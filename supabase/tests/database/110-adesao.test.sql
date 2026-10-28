-- I1.4: pedido de adesão (ADR-0002 §2.5 e §2.8; anexo A.1, D01 a D08, e CT4.4
-- na parte do banco). CT4.4 pela operação de servidor fica para a I1.5.
--
-- Camadas do INSERT em membership_applications, de fora para dentro: privilégio
-- por coluna, gatilho proteger_pedido_de_adesao, política
-- membership_applications_envio, CHECK e índice único. Cada recusa confere a
-- mensagem da camada que recusa, para que afrouxar essa camada mude o
-- resultado. O gatilho também é exercitado sozinho, como postgres com as claims
-- do usuário: o postgres ignora privilégio e RLS, e o gatilho continua valendo.
begin;
select plan(32);

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

grant execute on function pg_temp.id(text), pg_temp.entrar(text), pg_temp.resultado(text)
  to authenticated, anon, service_role;

-- Usuário do Auth; o gatilho do cadastro cria o perfil.
create function pg_temp.usuario(nome text, id uuid, confirmado boolean default true) returns void
language sql
as $f$
  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data, aud, role)
  values ($2, lower($1) || '-110@repasse-teste.invalid', case when $3 then now() end,
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

-- Empresa pelo fluxo real: pedido do requerente, arquivo e evidência, aprovação
-- pelo administrador. Registra a empresa, o pedido e o vínculo do requerente.
create function pg_temp.empresa(nome text, requerente text, admin text, cnpj_do_pedido text, tipo text)
returns void
language plpgsql
as $f$
declare
  id_pedido uuid;
  id_evidencia uuid;
  id_empresa uuid;
begin
  perform pg_temp.entrar(requerente);
  insert into public.membership_applications (organization_name, legal_name, cnpj, requested_kind)
  values (nome, nome || ' Ltda', cnpj_do_pedido, tipo)
  returning id into id_pedido;
  perform pg_temp.entrar(null);
  insert into storage.objects (bucket_id, name) values ('membership-evidence', id_pedido || '/consulta.pdf');
  perform pg_temp.entrar(admin);
  insert into public.membership_evidence_files (application_id, storage_path, sha256, content_type, size_bytes)
  values (id_pedido, id_pedido || '/consulta.pdf', repeat('a', 64), 'application/pdf', 1024)
  returning id into id_evidencia;
  update public.membership_applications
  set status = 'approved', cnpj_checked_at = now(), cnpj_check_source = 'consulta de teste',
      cnpj_check_evidence_id = id_evidencia
  where id = id_pedido
  returning organization_id into id_empresa;
  insert into pg_temp.fixture values (nome, id_empresa), ('pedido ' || nome, id_pedido);
  perform pg_temp.entrar(null);
end;
$f$;

-- Fixture ----------------------------------------------------------------------------

select pg_temp.usuario('X', '11000000-0000-4000-8000-000000000001');
select pg_temp.usuario('P1', '11000000-0000-4000-8000-000000000002');
select pg_temp.usuario('P2', '11000000-0000-4000-8000-000000000003');
select pg_temp.usuario('P3', '11000000-0000-4000-8000-000000000004');
select pg_temp.usuario('S', '11000000-0000-4000-8000-000000000005');
select pg_temp.usuario('N', '11000000-0000-4000-8000-000000000006', false);
select pg_temp.usuario('M', '11000000-0000-4000-8000-000000000007');
select pg_temp.admin('X');
select pg_temp.empresa('E', 'M', 'X', '11000000000108', 'supplier');

-- S suspenso pelo administrador, por SQL direto (sem request.headers).
select pg_temp.entrar('X');
update public.profiles set status = 'suspended' where id = pg_temp.id('S');
select pg_temp.entrar(null);

-- D01: anônimo ------------------------------------------------------------------------

set local role anon;
select throws_ok(
  $$insert into public.membership_applications (organization_name, legal_name, cnpj, requested_kind)
    values ('Anônima', 'Anônima Ltda', '11000000000299', 'buyer')$$,
  '42501', 'permission denied for table membership_applications',
  'D01: anônimo não envia pedido');
select throws_ok(
  $$select 1 from public.membership_applications$$,
  '42501', 'permission denied for table membership_applications',
  'D01: anônimo não lê pedidos');
reset role;

-- D01 (§2.8) e D05: conta sem e-mail confirmado e perfil suspenso -------------------

set local role authenticated;
select pg_temp.entrar('N');
select throws_ok(
  $$insert into public.membership_applications (organization_name, legal_name, cnpj, requested_kind)
    values ('Loja N', 'Loja N Ltda', '11000000000299', 'buyer')$$,
  '42501', 'confirme o e-mail antes de enviar o pedido',
  'D01 (§2.8): conta sem e-mail confirmado não envia pedido');

select pg_temp.entrar('S');
select throws_ok(
  $$insert into public.membership_applications (organization_name, legal_name, cnpj, requested_kind)
    values ('Loja S', 'Loja S Ltda', '11000000000299', 'buyer')$$,
  '42501', 'o pedido exige sessão de usuário com perfil ativo',
  'D05: perfil suspenso não envia pedido');

-- CT4.4 e D03: campos de revisão, requerente alheio e empresa no envio -------------
-- Primeira camada: o privilégio por coluna.

select pg_temp.entrar('P1');
select throws_ok(
  $$insert into public.membership_applications (organization_name, legal_name, cnpj, requested_kind, status)
    values ('Loja P1', 'Loja P1 Ltda', '11000000000299', 'buyer', 'approved')$$,
  '42501', 'permission denied for table membership_applications',
  'CT4.4/D03: o envio não aceita status');
select throws_ok(
  $$insert into public.membership_applications (organization_name, legal_name, cnpj, requested_kind, reviewed_by)
    values ('Loja P1', 'Loja P1 Ltda', '11000000000299', 'buyer', pg_temp.id('X'))$$,
  '42501', 'permission denied for table membership_applications',
  'CT4.4/D03: o envio não aceita revisor');
select throws_ok(
  $$insert into public.membership_applications (organization_name, legal_name, cnpj, requested_kind, applicant_profile_id)
    values ('Loja P1', 'Loja P1 Ltda', '11000000000299', 'buyer', pg_temp.id('P2'))$$,
  '42501', 'permission denied for table membership_applications',
  'CT4.4/D03: o envio não aceita requerente alheio');
select throws_ok(
  $$insert into public.membership_applications (organization_name, legal_name, cnpj, requested_kind, is_test)
    values ('Loja P1', 'Loja P1 Ltda', '11000000000299', 'buyer', true)$$,
  '42501', 'permission denied for table membership_applications',
  'D03: o envio não aceita a marcação de teste');
select throws_ok(
  $$insert into public.membership_applications (organization_name, legal_name, cnpj, requested_kind, organization_id)
    values ('Loja P1', 'Loja P1 Ltda', '11000000000299', 'buyer', pg_temp.id('E'))$$,
  '42501', 'permission denied for table membership_applications',
  'CT4.4/D03: o envio não aceita empresa');

-- Segunda camada, sozinha: o gatilho, como postgres com as claims de P1.
reset role;
select throws_ok(
  $$insert into public.membership_applications (organization_name, legal_name, cnpj, requested_kind, status)
    values ('Loja P1', 'Loja P1 Ltda', '11000000000299', 'buyer', 'approved')$$,
  '42501', 'o pedido nasce enviado, sem campos de revisão',
  'CT4.4/D03 (gatilho): status no envio é recusado');
select throws_ok(
  $$insert into public.membership_applications (organization_name, legal_name, cnpj, requested_kind, reviewed_by)
    values ('Loja P1', 'Loja P1 Ltda', '11000000000299', 'buyer', pg_temp.id('X'))$$,
  '42501', 'o pedido nasce enviado, sem campos de revisão',
  'CT4.4/D03 (gatilho): revisor no envio é recusado');
select throws_ok(
  $$insert into public.membership_applications (organization_name, legal_name, cnpj, requested_kind, applicant_profile_id)
    values ('Loja P1', 'Loja P1 Ltda', '11000000000299', 'buyer', pg_temp.id('P2'))$$,
  '42501', 'o requerente é o próprio usuário',
  'CT4.4/D03 (gatilho): requerente alheio é recusado');
select throws_ok(
  $$insert into public.membership_applications (organization_name, legal_name, cnpj, requested_kind, is_test)
    values ('Loja P1', 'Loja P1 Ltda', '11000000000299', 'buyer', true)$$,
  '42501', 'o pedido nasce enviado, sem campos de revisão',
  'D03 (gatilho): marcação de teste no envio é recusada');
select throws_ok(
  $$insert into public.membership_applications (organization_name, legal_name, cnpj, requested_kind, organization_id)
    values ('Loja P1', 'Loja P1 Ltda', '11000000000299', 'buyer', pg_temp.id('E'))$$,
  '42501', 'o pedido nasce enviado, sem campos de revisão',
  'CT4.4/D03 (gatilho): empresa no envio é recusada');
select pg_temp.entrar(null);

select is(
  (select count(*)::int from public.membership_applications
   where applicant_profile_id in (pg_temp.id('P1'), pg_temp.id('S'), pg_temp.id('N')))
  + (select count(*)::int from public.platform_staff where profile_id = pg_temp.id('P1'))
  + (select count(*)::int from public.organization_members where profile_id = pg_temp.id('P1')),
  0,
  'CT4.4: as tentativas recusadas não criaram pedido, papel na plataforma nem vínculo');

-- D04: domínio e CNPJ inválidos --------------------------------------------------------

set local role authenticated;
select pg_temp.entrar('P3');
select throws_ok(
  $$insert into public.membership_applications (organization_name, legal_name, cnpj, requested_kind)
    values ('Loja P3', 'Loja P3 Ltda', '11000000000299', 'dealer')$$,
  '23514', 'new row for relation "membership_applications" violates check constraint "membership_applications_requested_kind_check"',
  'D04: requested_kind fora do domínio é recusado com erro previsível');
select throws_ok(
  $$insert into public.membership_applications (organization_name, legal_name, cnpj, requested_kind)
    values ('Loja P3', 'Loja P3 Ltda', '11.000.000/0002-98', 'buyer')$$,
  '23514', 'new row for relation "membership_applications" violates check constraint "membership_applications_cnpj_check"',
  'D04: CNPJ com dígito verificador errado é recusado com erro previsível');

-- D02: o envio legítimo (contraste de D01, D03, D04 e D05) -------------------------------

select pg_temp.entrar('P1');
select is(
  pg_temp.resultado($$insert into public.membership_applications
      (organization_name, legal_name, cnpj, contact_email, contact_phone, requested_kind)
    values ('Loja P1', 'Loja P1 Ltda', '11.000.000/0002-99', 'contato@loja-p1.invalid', '+55 11 99999-0000', 'buyer')$$),
  'linhas: 1',
  'D02: perfil ativo sem empresa envia pedido válido');
select is(
  (select status || '/' || applicant_profile_id::text || '/' || cnpj || '/' || is_test::text
          || '/' || coalesce(reviewed_by::text, 'sem revisor')
   from public.membership_applications where applicant_profile_id = pg_temp.id('P1')),
  'submitted/' || pg_temp.id('P1')::text || '/11000000000299/false/sem revisor',
  'D02: nasce submitted, do próprio requerente, com CNPJ normalizado e sem revisão');

-- D07b e D06: um pedido aberto por requerente --------------------------------------------

select throws_ok(
  $$insert into public.membership_applications (organization_name, legal_name, cnpj, requested_kind)
    values ('Loja P1 B', 'Loja P1 B Ltda', '11000000000370', 'supplier')$$,
  '23505', 'duplicate key value violates unique constraint "membership_applications_um_aberto_idx"',
  'D07b: requerente com pedido aberto não envia outro');

select pg_temp.entrar('M');
select is(
  pg_temp.resultado($$insert into public.membership_applications (organization_name, legal_name, cnpj, requested_kind)
    values ('Filial M', 'Filial M Ltda', '11000000000370', 'buyer')$$),
  'linhas: 1',
  'D06: membro de empresa ativa, sem pedido aberto, pede outra empresa (contraste de D07b)');

-- D07: CNPJ já cadastrado ou em outro pedido aberto ---------------------------------------

select pg_temp.entrar('P2');
select is(
  pg_temp.resultado($$insert into public.membership_applications (organization_name, legal_name, cnpj, requested_kind)
    values ('Outra E', 'Outra E Ltda', '11.000.000/0001-08', 'buyer')$$),
  'linhas: 1',
  'D07: o envio com CNPJ de empresa já cadastrada é aceito, como qualquer outro');

select pg_temp.entrar('P3');
select is(
  pg_temp.resultado($$insert into public.membership_applications (organization_name, legal_name, cnpj, requested_kind)
    values ('Loja P3', 'Loja P3 Ltda', '11000000000299', 'supplier')$$),
  'linhas: 1',
  'D07: o envio com o CNPJ de outro pedido aberto é aceito');

reset role;
insert into storage.objects (bucket_id, name)
select 'membership-evidence', a.id || '/consulta.pdf'
from public.membership_applications a where a.applicant_profile_id = pg_temp.id('P2');

set local role authenticated;
select pg_temp.entrar('X');
select is(
  pg_temp.resultado($$insert into public.membership_evidence_files (application_id, storage_path, sha256, content_type, size_bytes)
    select a.id, a.id || '/consulta.pdf', repeat('c', 64), 'application/pdf', 2048
    from public.membership_applications a where a.applicant_profile_id = pg_temp.id('P2')$$),
  'linhas: 1',
  'D07 (preparo): o administrador registra a evidência do pedido de P2');
select throws_ok(
  $$update public.membership_applications a
    set status = 'approved', cnpj_checked_at = now(), cnpj_check_source = 'consulta de teste',
        cnpj_check_evidence_id = (select e.id from public.membership_evidence_files e where e.application_id = a.id)
    where a.applicant_profile_id = pg_temp.id('P2')$$,
  'P0001', 'já existe empresa não encerrada com este CNPJ; rejeite com motivo',
  'D07: a aprovação é recusada quando já existe empresa com o CNPJ');
select is(
  (select count(*)::int from public.organizations where cnpj = '11000000000108'),
  1,
  'D07: a aprovação recusada não criou outra empresa com o CNPJ');
select is(
  pg_temp.resultado($$update public.membership_applications
    set status = 'rejected', decision_reason = 'CNPJ já cadastrado; peça o convite ao administrador da empresa'
    where applicant_profile_id = pg_temp.id('P2')$$),
  'linhas: 1',
  'D07: o caminho é rejeitar com motivo (contraste)');

-- D08: leitura do pedido e da conferência ------------------------------------------------

select is(
  pg_temp.resultado($$insert into public.membership_application_reviews (application_id, checklist)
    select a.id, '[{"item": "cartão CNPJ", "resultado": "conferido", "observacao": "nota interna"}]'::jsonb
    from public.membership_applications a where a.applicant_profile_id = pg_temp.id('P1')$$),
  'linhas: 1',
  'D08 (preparo): o administrador grava a conferência do pedido de P1');
select is(
  (select count(*)::int from public.membership_application_reviews r
   join public.membership_applications a on a.id = r.application_id
   where a.applicant_profile_id = pg_temp.id('P1')),
  1,
  'D08: o administrador lê a conferência (contraste)');

select pg_temp.entrar('P1');
select is(
  (select count(*)::int from public.membership_applications where applicant_profile_id = pg_temp.id('P1')),
  1,
  'D08: o requerente lê o próprio pedido (contraste)');
select is(
  (select count(*)::int from public.membership_applications where applicant_profile_id <> pg_temp.id('P1')),
  0,
  'D08: o requerente não lê pedido de outra pessoa, nem o de mesmo CNPJ');
select is(
  (select count(*)::int from public.membership_application_reviews),
  0,
  'D08: o requerente não lê a conferência do próprio pedido');

reset role;
select pg_temp.entrar(null);

select * from finish();
rollback;
