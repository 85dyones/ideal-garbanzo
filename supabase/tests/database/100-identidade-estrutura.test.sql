-- I1.3: estrutura da identidade (ADR-0002) e um fluxo completo de adesão.
-- Os testes negativos 1, 2, 4, 5 e 13, com contraste e mutação, ficam na I1.4
-- (arquivos 110 em diante).
--
-- Fixture: usuários inseridos em auth.users (o gatilho cria o perfil). O
-- administrador nasce pelo caminho do primeiro administrador (§2.13) ou, se o
-- banco já tiver um, é concedido por ele, com a sessão dele.
begin;
select plan(34);

-- Estrutura ----------------------------------------------------------------------

select has_table('public', 'profiles', 'profiles existe');
select has_table('public', 'organizations', 'organizations existe');
select has_table('public', 'organization_members', 'organization_members existe');
select has_table('public', 'platform_staff', 'platform_staff existe');
select has_table('public', 'membership_applications', 'membership_applications existe');
select has_table('public', 'membership_application_reviews', 'membership_application_reviews existe');
select has_table('public', 'membership_evidence_files', 'membership_evidence_files existe');

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0,
  'RLS ligado em toda tabela do public');

select ok(not has_schema_privilege('anon', 'private', 'USAGE'), 'anon não usa o schema private');
select ok(not has_function_privilege('anon', 'private.perfil_ativo()', 'EXECUTE'), 'anon não executa as funções de autorização');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef),
  0,
  'nenhuma função security definer no schema exposto');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.prosecdef
     and not coalesce(p.proconfig @> array['search_path=""'], false)),
  0,
  'toda função security definer do private fixa search_path vazio');

select is(
  (select count(*)::int
   from unnest(array['profiles', 'organizations', 'organization_members', 'platform_staff',
                     'membership_applications', 'membership_application_reviews', 'membership_evidence_files']) as t(tabela)
   cross join unnest(array['anon', 'authenticated', 'service_role']) as r(papel)
   where has_table_privilege(papel, 'public.' || tabela, 'DELETE')
      or has_table_privilege(papel, 'public.' || tabela, 'TRUNCATE')),
  0,
  'ninguém tem DELETE nem TRUNCATE nas tabelas de identidade');

select ok(
  (select public from storage.buckets where id = 'membership-evidence') = false,
  'o bucket da evidência existe e é privado');

-- CNPJ (exemplo oficial da Receita e CNPJ numérico) -----------------------------------

select ok(private.cnpj_valido('12ABC34501DE35'), 'CNPJ alfanumérico do exemplo oficial é válido');
select ok(not private.cnpj_valido('12ABC34501DE36'), 'dígito verificador errado é recusado');
select ok(private.cnpj_valido('11222333000181'), 'CNPJ numérico continua válido');
select ok(not private.cnpj_valido('11222333000182'), 'CNPJ numérico com dígito errado é recusado');
select ok(not private.cnpj_valido('00000000000000'), 'sequência repetida é recusada');
select ok(not private.cnpj_valido('12abc34501de35'), 'valor não normalizado é recusado');
select is(private.normalizar_cnpj('12.abc.345/01de-35'), '12ABC34501DE35', 'normalização tira pontuação e põe em maiúsculas');

-- Fixture --------------------------------------------------------------------------

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data, aud, role) values
  ('10000000-0000-4000-8000-000000000001', 'admin-100@teste.invalid', now(), '{"full_name": "Admin 100"}', 'authenticated', 'authenticated'),
  ('10000000-0000-4000-8000-000000000002', 'requerente-100@teste.invalid', now(), '{"full_name": "Requerente 100"}', 'authenticated', 'authenticated');

select is(
  (select email from public.profiles where id = '10000000-0000-4000-8000-000000000002'),
  'requerente-100@teste.invalid',
  'o cadastro no Auth cria o perfil com o e-mail');

do $$
declare
  existente uuid;
begin
  select s.profile_id into existente
  from public.platform_staff s join public.profiles p on p.id = s.profile_id
  where s.role = 'admin' and s.status = 'active' and p.status = 'active'
  limit 1;
  if existente is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', existente, 'role', 'authenticated')::text, true);
  end if;
  insert into public.platform_staff (profile_id, role) values ('10000000-0000-4000-8000-000000000001', 'admin');
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- Fluxo de adesão --------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "10000000-0000-4000-8000-000000000002", "role": "authenticated"}', true);

select lives_ok(
  $$insert into public.membership_applications (organization_name, legal_name, cnpj, requested_kind)
    values ('Loja 100', 'Loja 100 Ltda', '12.abc.345/01de-35', 'buyer')$$,
  'o requerente envia o pedido');

select results_eq(
  $$select status, applicant_profile_id, cnpj from public.membership_applications$$,
  $$values ('submitted'::text, '10000000-0000-4000-8000-000000000002'::uuid, '12ABC34501DE35'::text)$$,
  'o pedido nasce enviado, do próprio requerente, com o CNPJ normalizado');

select ok(not private.pode_ver_catalogo(), 'sem empresa aprovada, o requerente não vê o catálogo');

reset role;
insert into storage.objects (bucket_id, name)
select 'membership-evidence', a.id || '/consulta.pdf'
from public.membership_applications a
where a.applicant_profile_id = '10000000-0000-4000-8000-000000000002';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "10000000-0000-4000-8000-000000000001", "role": "authenticated"}', true);

select lives_ok(
  $$insert into public.membership_application_reviews (application_id, checklist)
    select id, '[{"item": "cartão CNPJ", "resultado": "conferido"}]'::jsonb
    from public.membership_applications where applicant_profile_id = '10000000-0000-4000-8000-000000000002'$$,
  'o administrador grava a conferência');

select lives_ok(
  $$insert into public.membership_evidence_files (application_id, storage_path, sha256, content_type, size_bytes)
    select id, id || '/consulta.pdf', repeat('a', 64), 'application/pdf', 1024
    from public.membership_applications where applicant_profile_id = '10000000-0000-4000-8000-000000000002'$$,
  'o administrador registra a evidência');

select lives_ok(
  $$update public.membership_applications a
    set status = 'approved',
        cnpj_checked_at = now(),
        cnpj_check_source = 'consulta pública de teste',
        cnpj_check_evidence_id = (select e.id from public.membership_evidence_files e where e.application_id = a.id)
    where a.applicant_profile_id = '10000000-0000-4000-8000-000000000002'$$,
  'o administrador aprova o pedido');

select results_eq(
  $$select o.status, o.kind, o.cnpj, a.reviewed_by
    from public.membership_applications a join public.organizations o on o.id = a.organization_id
    where a.applicant_profile_id = '10000000-0000-4000-8000-000000000002'$$,
  $$values ('active'::text, 'buyer'::text, '12ABC34501DE35'::text, '10000000-0000-4000-8000-000000000001'::uuid)$$,
  'a aprovação cria a empresa ativa com o tipo pedido e grava o revisor da sessão');

select results_eq(
  $$select m.role, m.status
    from public.organization_members m join public.membership_applications a on a.organization_id = m.organization_id
    where m.profile_id = '10000000-0000-4000-8000-000000000002'$$,
  $$values ('org_admin'::text, 'active'::text)$$,
  'o requerente vira administrador ativo da empresa');

select ok(
  exists (select 1 from public.audit_logs
          where action = 'membership_applications.update'
            and actor_profile_id = '10000000-0000-4000-8000-000000000001'
            and metadata -> 'status' ->> 'para' = 'approved'),
  'a aprovação fica na auditoria, com o ator da sessão');

select set_config('request.jwt.claims', '{"sub": "10000000-0000-4000-8000-000000000002", "role": "authenticated"}', true);

select is((select count(*)::int from public.organizations), 1, 'o requerente lê a própria empresa');
select ok(private.pode_ver_catalogo(), 'membro ativo de empresa compradora vê o catálogo');
select is((select count(*)::int from public.audit_logs), 0, 'membro de empresa não lê a auditoria');

reset role;

select * from finish();
rollback;
