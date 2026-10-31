-- I1.4: revisão da adesão (ADR-0002 §2.5 e §2.9; anexo A.2, D09 a D18, e
-- CT4.5). D19 (sem e-mail na aprovação) não tem efeito no banco.
--
-- Camadas do UPDATE em membership_applications, de fora para dentro: privilégio
-- por coluna, políticas de SELECT e de UPDATE (filtram as linhas, sem erro),
-- gatilho proteger_pedido_de_adesao e CHECK. Quem lê o pedido mas não pode
-- revisá-lo (o próprio requerente) mostra a política de UPDATE sozinha; o
-- gatilho é exercitado sozinho como postgres com as claims do usuário; o CHECK,
-- com o gatilho desligado só dentro desta transação.
begin;
select plan(62);

-- Apoio do arquivo (objetos temporários, desfeitos no rollback) -------------------

create temporary table fixture (nome text primary key, id uuid not null);
grant select on pg_temp.fixture to authenticated, anon, service_role;

create function pg_temp.id(nome text) returns uuid
language sql stable
as $f$ select f.id from pg_temp.fixture f where f.nome = $1 $f$;

-- Sessão do usuário como o PostgREST a monta: só as claims do JWT. O papel do
-- banco (set local role) fica à vista em cada bloco do teste.
create function pg_temp.entrar(usuario text) returns void
language sql
as $f$
  select set_config('request.jwt.claims',
    case when $1 is null then '' else json_build_object('sub', pg_temp.id($1), 'role', 'authenticated')::text end,
    true);
$f$;

-- Cabeçalhos da requisição, como o PostgREST os expõe (request.headers).
-- null = fora da API, SQL direto.
create function pg_temp.api(cabecalhos jsonb) returns void
language sql
as $f$ select set_config('request.headers', coalesce($1::text, ''), true); $f$;

-- Executa o comando com o papel e a sessão atuais e devolve 'linhas: N' ou
-- 'erro <código>: <mensagem>', sem abortar o arquivo.
create function pg_temp.resultado(comando text) returns text
language plpgsql
as $f$
declare
  n bigint;
begin
  execute comando;
  get diagnostics n = row_count;
  return 'linhas: ' || n;
exception when others then
  return 'erro ' || sqlstate || ': ' || sqlerrm;
end;
$f$;

grant execute on function pg_temp.id(text), pg_temp.entrar(text), pg_temp.api(jsonb), pg_temp.resultado(text)
  to authenticated, anon, service_role;

-- Usuário do Auth; o gatilho do cadastro cria o perfil.
create function pg_temp.usuario(nome text, id uuid, confirmado boolean default true) returns void
language sql
as $f$
  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data, aud, role)
  values ($2, lower($1) || '-120@repasse-teste.invalid', case when $3 then now() end,
          json_build_object('full_name', $1)::jsonb, 'authenticated', 'authenticated');
  insert into pg_temp.fixture values ($1, $2);
$f$;

-- Administrador da plataforma (ADR-0002 §2.13 e §3): o primeiro, se não houver
-- administrador ativo; senão, concedido pelo existente, com a sessão dele.
create function pg_temp.admin(nome text) returns void
language plpgsql
as $f$
declare
  existente uuid;
begin
  select s.profile_id into existente
  from public.platform_staff s join public.profiles p on p.id = s.profile_id
  where s.role = 'admin' and s.status = 'active' and p.status = 'active'
  limit 1;
  perform set_config('request.jwt.claims',
    case when existente is null then '' else json_build_object('sub', existente, 'role', 'authenticated')::text end,
    true);
  insert into public.platform_staff (profile_id, role) values (pg_temp.id(nome), 'admin');
  perform set_config('request.jwt.claims', '', true);
end;
$f$;

-- Papel da plataforma concedido por um administrador da fixture, na sessão dele.
create function pg_temp.conceder(nome text, papel text, quem_concede text) returns void
language plpgsql
as $f$
begin
  perform pg_temp.entrar(quem_concede);
  insert into public.platform_staff (profile_id, role) values (pg_temp.id(nome), papel);
  perform pg_temp.entrar(null);
end;
$f$;

-- Pedido enviado pelo requerente, na sessão dele.
create function pg_temp.pedido(nome text, requerente text, cnpj_do_pedido text, tipo text) returns void
language plpgsql
as $f$
declare
  novo uuid;
begin
  perform pg_temp.entrar(requerente);
  insert into public.membership_applications (organization_name, legal_name, cnpj, requested_kind)
  values (nome, nome || ' Ltda', cnpj_do_pedido, tipo)
  returning id into novo;
  insert into pg_temp.fixture values ('pedido ' || nome, novo);
  perform pg_temp.entrar(null);
end;
$f$;

-- Arquivo no bucket (como postgres) e evidência registrada pelo administrador.
create function pg_temp.evidencia(nome text, quem_registra text) returns void
language plpgsql
as $f$
declare
  id_pedido uuid := pg_temp.id('pedido ' || nome);
  novo uuid;
begin
  perform pg_temp.entrar(null);
  insert into storage.objects (bucket_id, name) values ('membership-evidence', id_pedido || '/consulta.pdf');
  perform pg_temp.entrar(quem_registra);
  insert into public.membership_evidence_files (application_id, storage_path, sha256, content_type, size_bytes)
  values (id_pedido, id_pedido || '/consulta.pdf', repeat('a', 64), 'application/pdf', 1024)
  returning id into novo;
  insert into pg_temp.fixture values ('evidência ' || nome, novo);
  perform pg_temp.entrar(null);
end;
$f$;

-- Empresa pelo fluxo real: pedido, evidência e aprovação pelo administrador.
-- Registra a empresa, o pedido, a evidência e o vínculo do requerente.
-- Fornecedora só entra por convite (ADR-0002 §9): o administrador convida o e-mail do requerente.
create function pg_temp.convite_de_fornecedora(perfil text, quem_convida text) returns void
language plpgsql
as $f$
begin
  perform pg_temp.entrar(quem_convida);
  insert into public.supplier_invitations (email)
  select p.email from public.profiles p where p.id = pg_temp.id(perfil);
  perform pg_temp.entrar(null);
end;
$f$;

create function pg_temp.empresa(nome text, requerente text, quem_aprova text, cnpj_do_pedido text, tipo text)
returns void
language plpgsql
as $f$
declare
  id_empresa uuid;
begin
  if tipo <> 'buyer' then
    perform pg_temp.convite_de_fornecedora(requerente, quem_aprova);
  end if;
  perform pg_temp.pedido(nome, requerente, cnpj_do_pedido, tipo);
  perform pg_temp.evidencia(nome, quem_aprova);
  perform pg_temp.entrar(quem_aprova);
  update public.membership_applications
  set status = 'approved', cnpj_checked_at = now(), cnpj_check_source = 'consulta de teste',
      cnpj_check_evidence_id = pg_temp.id('evidência ' || nome)
  where id = pg_temp.id('pedido ' || nome)
  returning organization_id into id_empresa;
  insert into pg_temp.fixture values (nome, id_empresa);
  insert into pg_temp.fixture
  select nome || '/' || requerente, m.id
  from public.organization_members m
  where m.organization_id = id_empresa and m.profile_id = pg_temp.id(requerente);
  perform pg_temp.entrar(null);
end;
$f$;

-- Vínculo pelo fluxo real: convite de quem_convida e, se aceitar, aceite do
-- convidado. Registra o vínculo como '<empresa>/<perfil>'.
create function pg_temp.vincular(empresa text, perfil text, papel text, quem_convida text, aceitar boolean default true)
returns void
language plpgsql
as $f$
declare
  novo uuid;
begin
  perform pg_temp.entrar(quem_convida);
  insert into public.organization_members (organization_id, profile_id, role)
  values (pg_temp.id(empresa), pg_temp.id(perfil), papel)
  returning id into novo;
  if aceitar then
    perform pg_temp.entrar(perfil);
    update public.organization_members set status = 'active' where id = novo;
  end if;
  insert into pg_temp.fixture values (empresa || '/' || perfil, novo);
  perform pg_temp.entrar(null);
end;
$f$;

-- Fixture ----------------------------------------------------------------------------

select pg_temp.usuario('X', '12000000-0000-4000-8000-000000000001');
select pg_temp.usuario('X2', '12000000-0000-4000-8000-000000000002');
select pg_temp.usuario('O', '12000000-0000-4000-8000-000000000003');
select pg_temp.usuario('R1', '12000000-0000-4000-8000-000000000004');
select pg_temp.usuario('R2', '12000000-0000-4000-8000-000000000005');
select pg_temp.usuario('R3', '12000000-0000-4000-8000-000000000006');
select pg_temp.usuario('A1', '12000000-0000-4000-8000-000000000007');
select pg_temp.usuario('AM', '12000000-0000-4000-8000-000000000008');
select pg_temp.usuario('P', '12000000-0000-4000-8000-000000000009');
select pg_temp.admin('X');
select pg_temp.conceder('X2', 'admin', 'X');
select pg_temp.conceder('O', 'operator', 'X');
select pg_temp.empresa('A', 'A1', 'X', '12000000000170', 'supplier');
select pg_temp.vincular('A', 'AM', 'member', 'A1');
select pg_temp.pedido('R1', 'R1', '12000000000251', 'buyer');
select pg_temp.convite_de_fornecedora('R2', 'X');
select pg_temp.pedido('R2', 'R2', '12000000000332', 'supplier');
select pg_temp.convite_de_fornecedora('R3', 'X');
select pg_temp.pedido('R3', 'R3', '12000000000413', 'both');
select pg_temp.pedido('X2', 'X2', '12000000000502', 'buyer');
select pg_temp.evidencia('R1', 'X');
select pg_temp.evidencia('R3', 'X');

-- D10: o operador prepara a revisão (Q2) e não decide ------------------------------------

set local role authenticated;
select pg_temp.entrar('O');
select is(
  (select count(*)::int from public.membership_applications
   where id in (pg_temp.id('pedido R1'), pg_temp.id('pedido R2'), pg_temp.id('pedido R3'))),
  3,
  'D10: o operador lê os pedidos');
select is(
  pg_temp.resultado($$update public.membership_applications set status = 'under_review'
    where id = pg_temp.id('pedido R1')$$),
  'linhas: 1',
  'D10: o operador move o pedido de submitted para under_review (contraste)');
select throws_ok(
  $$update public.membership_applications
    set status = 'approved', cnpj_checked_at = now(), cnpj_check_source = 'consulta de teste',
        cnpj_check_evidence_id = pg_temp.id('evidência R3')
    where id = pg_temp.id('pedido R3')$$,
  '42501', 'o operador só move o pedido de enviado para em análise',
  'D10: o operador não aprova');
select throws_ok(
  $$update public.membership_applications set status = 'rejected', decision_reason = 'motivo'
    where id = pg_temp.id('pedido R2')$$,
  '42501', 'o operador só move o pedido de enviado para em análise',
  'D10: o operador não rejeita');
select throws_ok(
  $$update public.membership_applications set status = 'under_review', is_test = true
    where id = pg_temp.id('pedido R2')$$,
  '42501', 'o operador só move o pedido de enviado para em análise',
  'D10: o operador não muda outra coluna ao mover o pedido');
select throws_ok(
  $$update public.membership_applications set status = 'submitted' where id = pg_temp.id('pedido R1')$$,
  '42501', 'o operador só move o pedido de enviado para em análise',
  'D10: o operador não devolve o pedido para submitted');
select throws_ok(
  $$insert into public.membership_application_reviews (application_id, checklist)
    values (pg_temp.id('pedido R2'), '[]')$$,
  '42501', 'só um administrador da plataforma grava a conferência',
  'D10: o operador não grava a conferência');
select throws_ok(
  $$insert into public.membership_evidence_files (application_id, storage_path, sha256, content_type, size_bytes)
    values (pg_temp.id('pedido R2'), pg_temp.id('pedido R2') || '/operador.pdf', repeat('b', 64), 'application/pdf', 10)$$,
  '42501', 'só um administrador da plataforma registra a evidência',
  'D10: o operador não registra evidência');

-- D10, camada da política sozinha: gatilhos de conferência e evidência desligados
-- só dentro desta transação.
reset role;
alter table public.membership_application_reviews disable trigger membership_application_reviews_proteger;
alter table public.membership_evidence_files disable trigger membership_evidence_files_proteger;
set local role authenticated;
select throws_ok(
  $$insert into public.membership_application_reviews (application_id, checklist)
    values (pg_temp.id('pedido R2'), '[]')$$,
  '42501', 'new row violates row-level security policy for table "membership_application_reviews"',
  'D10 (política): o operador não grava a conferência');
select throws_ok(
  $$insert into public.membership_evidence_files (application_id, storage_path, sha256, content_type, size_bytes)
    values (pg_temp.id('pedido R2'), pg_temp.id('pedido R2') || '/operador.pdf', repeat('b', 64), 'application/pdf', 10)$$,
  '42501', 'new row violates row-level security policy for table "membership_evidence_files"',
  'D10 (política): o operador não registra evidência');
select pg_temp.entrar('X');
select is(
  pg_temp.resultado($$insert into public.membership_application_reviews (application_id, checklist)
    values (pg_temp.id('pedido R2'), '[]')$$),
  'linhas: 1',
  'D10 (política): o administrador grava a conferência (contraste)');
select is(
  pg_temp.resultado($$insert into public.membership_evidence_files (application_id, storage_path, sha256, content_type, size_bytes)
    values (pg_temp.id('pedido R2'), pg_temp.id('pedido R2') || '/admin.pdf', repeat('b', 64), 'application/pdf', 10)$$),
  'erro 23502: null value in column "uploaded_by" of relation "membership_evidence_files" violates not-null constraint',
  'D10 (política): o administrador passa pela política da evidência (contraste; sem o gatilho, falta quem enviou)');
reset role;
alter table public.membership_application_reviews enable trigger membership_application_reviews_proteger;
alter table public.membership_evidence_files enable trigger membership_evidence_files_proteger;

-- D11 e CT4.5: quem não é da equipe da plataforma não revisa --------------------------------

set local role authenticated;
select pg_temp.entrar('A1');
select is(
  pg_temp.resultado($$update public.membership_applications set status = 'under_review'
    where id = pg_temp.id('pedido R2')$$),
  'linhas: 0',
  'D11: org_admin não revisa pedido');
select pg_temp.entrar('AM');
select is(
  pg_temp.resultado($$update public.membership_applications set status = 'under_review'
    where id = pg_temp.id('pedido R2')$$),
  'linhas: 0',
  'D11: member não revisa pedido');
select pg_temp.entrar('P');
select is(
  pg_temp.resultado($$update public.membership_applications
    set status = 'approved', cnpj_checked_at = now(), cnpj_check_source = 'consulta de teste',
        cnpj_check_evidence_id = pg_temp.id('evidência R3')
    where id = pg_temp.id('pedido R3')$$),
  'linhas: 0',
  'CT4.5/D11: P, sem empresa nem papel, não aprova pedido');
select pg_temp.entrar('R3');
select is(
  pg_temp.resultado($$update public.membership_applications
    set status = 'approved', cnpj_checked_at = now(), cnpj_check_source = 'consulta de teste',
        cnpj_check_evidence_id = pg_temp.id('evidência R3')
    where id = pg_temp.id('pedido R3')$$),
  'linhas: 0',
  'CT4.5/D11: o requerente lê o próprio pedido, mas não o aprova (política de UPDATE)');
reset role;
set local role anon;
select throws_ok(
  $$update public.membership_applications set status = 'under_review' where id = pg_temp.id('pedido R2')$$,
  '42501', 'permission denied for table membership_applications',
  'D11: anônimo não revisa pedido');
reset role;

-- Gatilho sozinho, como postgres com as claims de quem tenta.
select pg_temp.entrar('P');
select throws_ok(
  $$update public.membership_applications
    set status = 'approved', cnpj_checked_at = now(), cnpj_check_source = 'consulta de teste',
        cnpj_check_evidence_id = pg_temp.id('evidência R3')
    where id = pg_temp.id('pedido R3')$$,
  '42501', 'só a equipe da plataforma revisa pedidos',
  'CT4.5 (gatilho): P não aprova pedido');
select pg_temp.entrar('A1');
select throws_ok(
  $$update public.membership_applications set status = 'under_review' where id = pg_temp.id('pedido R2')$$,
  '42501', 'só a equipe da plataforma revisa pedidos',
  'D11 (gatilho): org_admin não revisa pedido');
select pg_temp.entrar(null);
select is(
  (select string_agg(status || coalesce('/' || organization_id::text, ''), ',' order by organization_name)
   from public.membership_applications where id in (pg_temp.id('pedido R2'), pg_temp.id('pedido R3'))),
  'submitted,submitted',
  'CT4.5/D10/D11: os pedidos recusados continuam submitted e sem empresa');

-- D09 e D13: o administrador move e registra a conferência ---------------------------------

set local role authenticated;
select pg_temp.entrar('X');
select is(
  pg_temp.resultado($$update public.membership_applications set status = 'under_review'
    where id = pg_temp.id('pedido R2')$$),
  'linhas: 1',
  'D09: o administrador move o pedido para under_review');
select is(
  pg_temp.resultado($$insert into public.membership_application_reviews (application_id, checklist)
    values (pg_temp.id('pedido R1'), '[]')$$),
  'linhas: 1',
  'D13: a conferência aceita lista vazia; nenhum item é exigido');
select is(
  pg_temp.resultado($$update public.membership_application_reviews
    set checklist = '[{"item": "contrato social", "resultado": "conferido", "observacao": "texto livre"}]'
    where application_id = pg_temp.id('pedido R1')$$),
  'linhas: 1',
  'D13: o administrador atualiza a conferência com itens livres');
select is(
  (select updated_by from public.membership_application_reviews where application_id = pg_temp.id('pedido R1')),
  pg_temp.id('X'),
  'D13: updated_by da conferência vem da sessão');

-- D12, D17 e D14b: aprovação incompleta ou com evidência de outro pedido -------------------

select throws_ok(
  $$update public.membership_applications
    set status = 'approved', cnpj_check_source = 'consulta de teste', cnpj_check_evidence_id = pg_temp.id('evidência R1')
    where id = pg_temp.id('pedido R1')$$,
  'P0001', 'a aprovação exige a conferência do CNPJ, a fonte e a evidência',
  'D12: aprovar sem cnpj_checked_at é recusado');
select throws_ok(
  $$update public.membership_applications
    set status = 'approved', cnpj_checked_at = now(), cnpj_check_evidence_id = pg_temp.id('evidência R1')
    where id = pg_temp.id('pedido R1')$$,
  'P0001', 'a aprovação exige a conferência do CNPJ, a fonte e a evidência',
  'D12/D17: aprovar sem a fonte da conferência é recusado');
select throws_ok(
  $$update public.membership_applications
    set status = 'approved', cnpj_checked_at = now(), cnpj_check_source = 'consulta de teste'
    where id = pg_temp.id('pedido R1')$$,
  'P0001', 'a aprovação exige a conferência do CNPJ, a fonte e a evidência',
  'D12/D17: aprovar sem a evidência é recusado');
select throws_ok(
  $$update public.membership_applications
    set status = 'approved', cnpj_checked_at = now() + interval '1 day', cnpj_check_source = 'consulta de teste',
        cnpj_check_evidence_id = pg_temp.id('evidência R1')
    where id = pg_temp.id('pedido R1')$$,
  'P0001', 'a data da conferência do CNPJ não pode estar no futuro',
  'D12: data da conferência no futuro é recusada');
select throws_ok(
  $$update public.membership_applications
    set status = 'approved', cnpj_checked_at = now(), cnpj_check_source = 'consulta de teste',
        cnpj_check_evidence_id = pg_temp.id('evidência R1'), reviewed_by = pg_temp.id('X2')
    where id = pg_temp.id('pedido R1')$$,
  '42501', 'permission denied for table membership_applications',
  'D12: o revisor não vem do payload (privilégio por coluna)');
select throws_ok(
  $$update public.membership_applications
    set status = 'approved', cnpj_checked_at = now(), cnpj_check_source = 'consulta de teste',
        cnpj_check_evidence_id = pg_temp.id('evidência R1'), organization_id = pg_temp.id('A')
    where id = pg_temp.id('pedido R1')$$,
  '42501', 'permission denied for table membership_applications',
  'D12: a empresa não vem do payload (privilégio por coluna)');
select throws_ok(
  $$update public.membership_applications
    set status = 'approved', cnpj_checked_at = now(), cnpj_check_source = 'consulta de teste',
        cnpj_check_evidence_id = pg_temp.id('evidência R3')
    where id = pg_temp.id('pedido R1')$$,
  'P0001', 'a evidência precisa ser deste pedido',
  'D14b: aprovar com a evidência de outro pedido é recusado');

reset role;
select pg_temp.entrar('X');
select throws_ok(
  $$update public.membership_applications
    set status = 'approved', cnpj_checked_at = now(), cnpj_check_source = 'consulta de teste',
        cnpj_check_evidence_id = pg_temp.id('evidência R1'), reviewed_by = pg_temp.id('X2')
    where id = pg_temp.id('pedido R1')$$,
  '42501', 'revisor, data da decisão e empresa são preenchidos pelo banco',
  'D12 (gatilho): o revisor do payload é recusado');
select throws_ok(
  $$update public.membership_applications
    set status = 'approved', cnpj_checked_at = now(), cnpj_check_source = 'consulta de teste',
        cnpj_check_evidence_id = pg_temp.id('evidência R1'), reviewed_at = now() - interval '1 day'
    where id = pg_temp.id('pedido R1')$$,
  '42501', 'revisor, data da decisão e empresa são preenchidos pelo banco',
  'D12 (gatilho): a data da decisão do payload é recusada');
select pg_temp.entrar(null);
select is(
  (select status || '/' || coalesce(organization_id::text, 'sem empresa') || '/'
          || (select count(*) from public.organizations o where o.cnpj = '12000000000251')::text
   from public.membership_applications where id = pg_temp.id('pedido R1')),
  'under_review/sem empresa/0',
  'D12/D14b: as aprovações recusadas não gravaram nada');

-- D12 e D14: a aprovação completa (contraste) ----------------------------------------------

set local role authenticated;
select pg_temp.entrar('X');
select is(
  pg_temp.resultado($$update public.membership_applications
    set status = 'approved', cnpj_checked_at = now(), cnpj_check_source = 'consulta de teste',
        cnpj_check_evidence_id = pg_temp.id('evidência R1')
    where id = pg_temp.id('pedido R1')$$),
  'linhas: 1',
  'D12: o administrador aprova com conferência, fonte e evidência');
select is(
  (select reviewed_by from public.membership_applications where id = pg_temp.id('pedido R1')),
  pg_temp.id('X'),
  'D12: reviewed_by vem da sessão');
select ok(
  (select reviewed_at is not null and cnpj_checked_at is not null and cnpj_check_source is not null
          and cnpj_check_evidence_id = pg_temp.id('evidência R1') and organization_id is not null
   from public.membership_applications where id = pg_temp.id('pedido R1')),
  'D12: a aprovação grava data, conferência, fonte, evidência e empresa');
select is(
  (select o.status || '/' || o.kind || '/' || o.name || '/' || o.cnpj || '/' || o.is_test::text
   from public.organizations o
   join public.membership_applications a on a.organization_id = o.id
   where a.id = pg_temp.id('pedido R1')),
  'active/buyer/R1/12000000000251/false',
  'D14: a aprovação cria a empresa ativa com o tipo e os dados do pedido');
select is(
  (select m.role || '/' || m.status
   from public.organization_members m
   join public.membership_applications a on a.organization_id = m.organization_id
   where a.id = pg_temp.id('pedido R1') and m.profile_id = pg_temp.id('R1')),
  'org_admin/active',
  'D14: o requerente vira org_admin ativo da empresa, na mesma transação');

-- D12, CHECK sozinho: com o gatilho desligado só aqui, o CHECK recusa aprovação sem revisão.
reset role;
select pg_temp.entrar(null);
alter table public.membership_applications disable trigger membership_applications_proteger;
select throws_ok(
  $$update public.membership_applications set status = 'approved' where id = pg_temp.id('pedido R3')$$,
  '23514', 'new row for relation "membership_applications" violates check constraint "membership_applications_aprovacao_completa"',
  'D12 (CHECK): pedido com status approved sem revisor, conferência e empresa é recusado');
alter table public.membership_applications enable trigger membership_applications_proteger;

-- D13: a conferência congela depois da decisão ------------------------------------------

set local role authenticated;
select pg_temp.entrar('X');
select throws_ok(
  $$update public.membership_application_reviews set checklist = '[]'
    where application_id = pg_temp.id('pedido R1')$$,
  'P0001', 'a conferência só muda enquanto o pedido está aberto',
  'D13: a conferência não muda depois da aprovação');

-- D15: rejeição com motivo ------------------------------------------------------------

select throws_ok(
  $$update public.membership_applications set status = 'rejected' where id = pg_temp.id('pedido R2')$$,
  '23514', 'new row for relation "membership_applications" violates check constraint "membership_applications_rejeicao_com_motivo"',
  'D15: rejeitar sem decision_reason é recusado');
select is(
  pg_temp.resultado($$update public.membership_applications
    set status = 'rejected', decision_reason = 'documentação divergente'
    where id = pg_temp.id('pedido R2')$$),
  'linhas: 1',
  'D15: rejeitar com motivo é permitido (contraste)');
select ok(
  (select reviewed_by = pg_temp.id('X') and reviewed_at is not null and organization_id is null
   from public.membership_applications where id = pg_temp.id('pedido R2')),
  'D15: a rejeição grava revisor da sessão e data, sem empresa');

-- D16: pedido decidido não muda; novo pedido é nova linha ---------------------------------

select throws_ok(
  $$update public.membership_applications set decision_reason = 'outro texto' where id = pg_temp.id('pedido R1')$$,
  'P0001', 'pedido decidido não muda; um novo pedido é uma nova linha',
  'D16: pedido com status approved não muda');
select throws_ok(
  $$update public.membership_applications set status = 'under_review' where id = pg_temp.id('pedido R2')$$,
  'P0001', 'pedido decidido não muda; um novo pedido é uma nova linha',
  'D16: pedido rejeitado não reabre');
select pg_temp.entrar('O');
select throws_ok(
  $$update public.membership_applications set status = 'under_review' where id = pg_temp.id('pedido R2')$$,
  'P0001', 'pedido decidido não muda; um novo pedido é uma nova linha',
  'D16: nem o operador reabre pedido decidido');
-- O convite foi usado pelo pedido rejeitado; o reenvio como fornecedora pede outro (ADR-0002 §9).
select pg_temp.convite_de_fornecedora('R2', 'X');
select pg_temp.entrar('R2');
select is(
  pg_temp.resultado($$insert into public.membership_applications (organization_name, legal_name, cnpj, requested_kind)
    values ('R2 de novo', 'R2 de novo Ltda', '12000000000332', 'supplier')$$),
  'linhas: 1',
  'D16: depois da rejeição, o requerente envia novo pedido em nova linha (contraste)');

-- D09b: administrador que é o requerente --------------------------------------------------

select pg_temp.entrar('X2');
select throws_ok(
  $$update public.membership_applications set status = 'under_review' where id = pg_temp.id('pedido X2')$$,
  '42501', 'ninguém revisa o próprio pedido',
  'D09b: o administrador não revisa o próprio pedido');
select throws_ok(
  $$insert into public.membership_application_reviews (application_id, checklist)
    values (pg_temp.id('pedido X2'), '[]')$$,
  '42501', 'ninguém confere o próprio pedido',
  'D09b: o administrador não confere o próprio pedido');
select throws_ok(
  $$insert into public.membership_evidence_files (application_id, storage_path, sha256, content_type, size_bytes)
    values (pg_temp.id('pedido X2'), pg_temp.id('pedido X2') || '/propria.pdf', repeat('d', 64), 'application/pdf', 10)$$,
  '42501', 'ninguém registra evidência do próprio pedido',
  'D09b: o administrador não registra evidência do próprio pedido');
select pg_temp.entrar('X');
select is(
  pg_temp.resultado($$update public.membership_applications set status = 'under_review'
    where id = pg_temp.id('pedido X2')$$),
  'linhas: 1',
  'D09b: outro administrador revisa o pedido de X2 (contraste)');

-- §2.5: quem envia arquivo de evidência (função da política do Storage) -----------------------

select ok(
  (select private.pode_enviar_evidencia(pg_temp.id('pedido R3') || '/consulta-2.pdf')),
  '§2.5 (Storage): o administrador envia evidência para pedido aberto de outra pessoa (contraste)');
select ok(
  (select not private.pode_enviar_evidencia(pg_temp.id('pedido R1') || '/depois.pdf')),
  '§2.5 (Storage): pedido já decidido não recebe evidência');
select ok(
  (select not private.pode_enviar_evidencia('consulta.pdf')
      and not private.pode_enviar_evidencia(pg_temp.id('pedido R3') || '/pasta/consulta.pdf')
      and not private.pode_enviar_evidencia(upper(pg_temp.id('pedido R3')::text) || '/consulta.pdf')),
  '§2.5 (Storage): caminho fora de <id do pedido>/<arquivo> é recusado');
select ok(
  (select not private.pode_enviar_evidencia('12000000-0000-4000-8000-0000000000ff/consulta.pdf')),
  '§2.5 (Storage): id que não é de pedido é recusado');
select pg_temp.entrar('X2');
select ok(
  (select not private.pode_enviar_evidencia(pg_temp.id('pedido X2') || '/propria.pdf')),
  '§2.5 (Storage): o administrador não envia evidência do próprio pedido');
select pg_temp.entrar('O');
select ok(
  (select not private.pode_enviar_evidencia(pg_temp.id('pedido R3') || '/operador.pdf')),
  '§2.5 (Storage): o operador não envia evidência');

-- D10: leitura da conferência e da evidência --------------------------------------------

select is(
  (select count(*)::int from public.membership_application_reviews where application_id = pg_temp.id('pedido R1')),
  1,
  'D10: o operador lê a conferência');
select is(
  (select count(*)::int from public.membership_evidence_files
   where application_id in (pg_temp.id('pedido R1'), pg_temp.id('pedido R3'))),
  0,
  'D10/§2.9: o operador não lê os registros de evidência');
select pg_temp.entrar('X');
select is(
  (select count(*)::int from public.membership_evidence_files
   where application_id in (pg_temp.id('pedido R1'), pg_temp.id('pedido R3'))),
  2,
  '§2.9: o administrador lê os registros de evidência (contraste)');

-- D18: a revisão fica na auditoria, com o ator da sessão ------------------------------------

select is(
  (select string_agg(t, ', ' order by t) from (
     select case entity_id when pg_temp.id('pedido R1') then 'R1' else 'R2' end || ' '
            || coalesce(metadata -> 'status' ->> 'de', '-') || '>' || coalesce(metadata -> 'status' ->> 'para', '-')
            || ' por ' || case actor_profile_id when pg_temp.id('X') then 'X' when pg_temp.id('O') then 'O' else '?' end
     from public.audit_logs
     where action = 'membership_applications.update'
       and entity_id in (pg_temp.id('pedido R1'), pg_temp.id('pedido R2'))) as registro(t)),
  'R1 submitted>under_review por O, R1 under_review>approved por X, '
  || 'R2 submitted>under_review por X, R2 under_review>rejected por X',
  'D18: cada passo da revisão fica na auditoria, com a transição e o ator da sessão');

reset role;
select pg_temp.entrar(null);

select * from finish();
rollback;
