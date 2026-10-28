-- I1.8: ressalvas R5 e R3 da revisão da I1.7 (ADR-0002 §8).
--
-- R5. Saída de manutenção. Pelo PostgREST a sessão é sempre authenticator, mas
-- a API do Auth escreve em auth.users com o papel administrativo dela e sem
-- claims, e o Storage e o Realtime têm sessões próprias. Por isso a saída de
-- manutenção passa a valer só para uma lista de sessões (migração e SQL da
-- pessoa responsável), só no primeiro nível de gatilho e, como antes, sem
-- usuário e sem claims. As sessões conferidas: os scripts do T2 entram no dev
-- como postgres; a CLI do Supabase e o editor SQL do painel podem usar
-- supabase_admin.
--
-- R3. Reconvite numa transação só: o vínculo removido volta a pending e, se o
-- papel pedido for outro, troca de papel na mesma chamada. Se a troca falhar,
-- nada fica gravado. A função é security invoker: valem a RLS, os privilégios
-- por coluna e o gatilho proteger_vinculo, com o ator da sessão.

create function private.sessao_de_manutencao(p_sessao name)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_sessao in ('postgres', 'supabase_admin');
$$;

revoke all on function private.sessao_de_manutencao(name) from public, anon, authenticated, service_role;

-- SQL fora da API e sem sessão de usuário: migração ou a pessoa responsável no
-- editor do projeto. Chamada direta pelo gatilho do comando, nunca de dentro de
-- outro gatilho (pg_trigger_depth() = 1).
create or replace function private.manutencao()
returns boolean
language sql
stable
set search_path = ''
as $$
  select pg_trigger_depth() = 1
    and private.sessao_de_manutencao(session_user)
    and (select auth.uid()) is null
    and coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}') = '{}';
$$;

create function public.reconvidar_membro(p_vinculo uuid, p_email text, p_papel text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.organization_members
     set status = 'pending', invited_email = p_email
   where id = p_vinculo and status = 'removed';
  if not found then
    raise exception 'reconvite indisponível para este vínculo' using errcode = 'P0001';
  end if;
  update public.organization_members
     set role = p_papel
   where id = p_vinculo and role is distinct from p_papel;
end;
$$;

revoke all on function public.reconvidar_membro(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.reconvidar_membro(uuid, text, text) to authenticated;
