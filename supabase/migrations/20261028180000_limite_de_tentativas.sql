-- I1.6: limite de tentativas no banco (especificação §7.1; ADR-0002 §2.16).
--
-- * Decisão da pessoa responsável em 28/10: os contadores ficam no Postgres do
--   repasse, sem provedor novo.
-- * Janela fixa por chave. A chave chega resumida pelo servidor (sha256 em
--   hexadecimal), então IP, e-mail e id não ficam gravados em claro.
-- * Só o servidor, com a chave secreta, consome o limite: anon e authenticated
--   não leem a tabela nem executam a função. A função é security invoker; o
--   service_role ignora a RLS e tem os grants da tabela.
-- * Cada chamada apaga as janelas vencidas da própria chave e, de vez em
--   quando, as de qualquer chave com mais de um dia.

create table public.limites_de_tentativas (
  chave text not null check (chave ~ '^[0-9a-f]{64}$'),
  janela_inicio timestamptz not null,
  tentativas integer not null default 1 check (tentativas > 0),
  primary key (chave, janela_inicio)
);

create index limites_de_tentativas_janela_idx on public.limites_de_tentativas (janela_inicio);

alter table public.limites_de_tentativas enable row level security;

revoke all on public.limites_de_tentativas from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.limites_de_tentativas to service_role;

create function public.consumir_limite_de_tentativas(p_chave text, p_maximo integer, p_janela_segundos integer)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inicio timestamptz;
  total integer;
begin
  if p_chave is null or p_chave !~ '^[0-9a-f]{64}$'
     or p_maximo is null or p_maximo < 1
     or p_janela_segundos is null or p_janela_segundos < 1 then
    raise exception 'parâmetros inválidos do limite de tentativas' using errcode = '22023';
  end if;

  inicio := to_timestamp(floor(extract(epoch from now()) / p_janela_segundos) * p_janela_segundos);

  delete from public.limites_de_tentativas
  where chave = p_chave and janela_inicio < inicio;
  if random() < 0.01 then
    delete from public.limites_de_tentativas where janela_inicio < now() - interval '1 day';
  end if;

  insert into public.limites_de_tentativas as l (chave, janela_inicio)
  values (p_chave, inicio)
  on conflict (chave, janela_inicio) do update set tentativas = l.tentativas + 1
  returning l.tentativas into total;

  return total <= p_maximo;
end;
$$;

revoke all on function public.consumir_limite_de_tentativas(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consumir_limite_de_tentativas(text, integer, integer) to service_role;
