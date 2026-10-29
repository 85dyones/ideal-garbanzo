-- I2.3: expiração das ofertas no banco (ADR-0003 §2.9; especificação v1.1,
-- §4.3 e §6.9).
--
-- * private.expirar_ofertas() leva a expired toda oferta published ou
--   reserved com valid_until vencido. O gatilho proteger_oferta só aceita
--   essa transição fora da sessão de usuário (private.manutencao()) e com a
--   validade de fato vencida (X04).
-- * O pg_cron roda a função a cada 10 minutos, como postgres. O intervalo é
--   técnico e provisório. Entre duas rodadas, private.oferta_aberta() já trata
--   a oferta vencida como fechada.
-- * Reaplicável: o reset não remove a extensão nem o schema cron, e
--   cron.schedule com o mesmo nome atualiza o job existente
--   (supabase/tests/README.md). A extensão é ligada no schema pg_catalog, como
--   manda a documentação do Supabase ("Install", Supabase Cron).
-- * Sem GRANT no schema cron: o gatilho de eventos do próprio Supabase dá ao
--   postgres o acesso ao criar a extensão e, a cada nova execução do create
--   extension, revoga e concede de novo. Um GRANT feito pelo postgres para ele
--   mesmo fica dependente desse acesso, e a revogação do gatilho falha com
--   "dependent privileges exist" (conferido no reset de 29/10).

create extension if not exists pg_cron with schema pg_catalog;

create function private.expirar_ofertas()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.offers
  set status = 'expired'
  where status in ('published', 'reserved') and valid_until <= now();
  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function private.expirar_ofertas() is
  'Expiração das ofertas vencidas (ADR-0003 §2.9). Roda pelo pg_cron, job expirar-ofertas.';

revoke all on function private.expirar_ofertas() from public, anon, authenticated, service_role;

select cron.schedule('expirar-ofertas', '*/10 * * * *', 'select private.expirar_ofertas()');
