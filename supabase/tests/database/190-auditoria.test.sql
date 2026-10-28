-- I1.4: leitura e integridade dos registros (ADR-0002 §2.9 e §2.11; anexo A.9,
-- D59 a D64). O 010 cobre o "só inclusão" pelo postgres e o anon; aqui ficam
-- quem lê, o service_role e o conteúdo de metadata. D18 está no 120, D46 no
-- 160 e D58 no 180.
begin;
select plan(22);

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
  values ($2, lower($1) || '-190@repasse-teste.invalid', case when $3 then now() end,
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
create function pg_temp.empresa(nome text, requerente text, quem_aprova text, cnpj_do_pedido text, tipo text)
returns void
language plpgsql
as $f$
declare
  id_empresa uuid;
begin
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

select pg_temp.usuario('X', '19000000-0000-4000-8000-000000000001');
select pg_temp.usuario('O', '19000000-0000-4000-8000-000000000002');
select pg_temp.usuario('OA', '19000000-0000-4000-8000-000000000003');
select pg_temp.usuario('A1', '19000000-0000-4000-8000-000000000004');
select pg_temp.usuario('M', '19000000-0000-4000-8000-000000000005');
select pg_temp.admin('X');
select pg_temp.conceder('O', 'operator', 'X');
select pg_temp.conceder('OA', 'operator', 'X');
select pg_temp.empresa('A', 'A1', 'X', '19000000000110', 'supplier');
select pg_temp.vincular('A', 'M', 'member', 'A1');

select pg_temp.entrar('X');
update public.platform_staff set can_read_audit = true where profile_id = pg_temp.id('OA');
update public.organizations set contact_email = 'contato@a-190.invalid', contact_phone = '+55 11 3333-1900'
where id = pg_temp.id('A');
select pg_temp.entrar('A1');
update public.profiles set phone = '+55 11 98888-1900' where id = pg_temp.id('A1');
select pg_temp.entrar(null);
-- Chave nova sem sessão, como uma migração: gera linha em field_history.
insert into public.platform_settings (key, value, description, is_critical)
values ('teste_190_nao_critica', '{"v": 1}', 'chave não crítica de teste', false);

-- Visibilidade dos três registros para o papel e a sessão atuais: '1' quando
-- há linha da fixture visível, '0' quando não há (auditoria/histórico/acesso).
create function pg_temp.registros_visiveis() returns text
language sql
as $f$
  select least((select count(*) from public.audit_logs
                where entity_id in (pg_temp.id('A'), pg_temp.id('pedido A'), pg_temp.id('A1'))), 1)::text
    || '/' || least((select count(*) from public.field_history where field = 'teste_190_nao_critica'), 1)::text
    || '/' || least((select count(*) from public.restricted_access_logs
                     where resource_id = pg_temp.id('evidência A')), 1)::text;
$f$;
grant execute on function pg_temp.registros_visiveis() to authenticated;

-- D63 (contraste): o servidor registra o acesso à evidência, com a chave secreta
-- (claims de service_role, sem usuário).
set local role service_role;
select set_config('request.jwt.claims', '{"role": "service_role"}', true);
select is(
  pg_temp.resultado($$insert into public.restricted_access_logs (actor_profile_id, resource_type, resource_id, request_id)
    values (pg_temp.id('X'), 'membership_evidence', pg_temp.id('evidência A'), 'req-190')$$),
  'linhas: 1',
  'D63 (contraste): o service_role registra acesso restrito');
reset role;

-- D59 a D61: quem lê ------------------------------------------------------------------

set local role authenticated;
select pg_temp.entrar('X');
select is(pg_temp.registros_visiveis(), '1/1/1', 'D59: o administrador lê auditoria, histórico e acessos restritos');
select pg_temp.entrar('OA');
select is(pg_temp.registros_visiveis(), '1/1/1', 'D60: o operador com can_read_audit lê os três registros (contraste)');
select pg_temp.entrar('O');
select is(pg_temp.registros_visiveis(), '0/0/0', 'D60: o operador sem can_read_audit não lê nenhum dos três');
select pg_temp.entrar('A1');
select is(pg_temp.registros_visiveis(), '0/0/0', 'D61: org_admin não lê nenhum dos três, nem sobre a própria empresa');
select pg_temp.entrar('M');
select is(pg_temp.registros_visiveis(), '0/0/0', 'D61: member não lê nenhum dos três');

-- D63: ninguém insere direto, fora o servidor -------------------------------------------

select throws_ok(
  $$insert into public.audit_logs (action, entity_type) values ('forjada', 'teste')$$,
  '42501', 'permission denied for table audit_logs',
  'D63: member não insere em audit_logs');
select pg_temp.entrar('X');
select throws_ok(
  $$insert into public.audit_logs (action, entity_type) values ('forjada', 'teste')$$,
  '42501', 'permission denied for table audit_logs',
  'D63: nem o administrador insere em audit_logs');
select throws_ok(
  $$insert into public.field_history (entity_type, entity_id, field) values ('teste', gen_random_uuid(), 'campo')$$,
  '42501', 'permission denied for table field_history',
  'D63: nem o administrador insere em field_history');
select throws_ok(
  $$insert into public.restricted_access_logs (resource_type, resource_id) values ('teste', gen_random_uuid())$$,
  '42501', 'permission denied for table restricted_access_logs',
  'D63: nem o administrador insere em restricted_access_logs');

-- D62: ninguém altera nem apaga, inclusive o service_role e o administrador ----------------

select throws_ok(
  $$update public.audit_logs set action = 'alterada' where entity_id = pg_temp.id('A')$$,
  '42501', 'permission denied for table audit_logs',
  'D62: o administrador não altera audit_logs');
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role": "service_role"}', true);
select throws_ok(
  $$update public.audit_logs set action = 'alterada' where entity_id = pg_temp.id('A')$$,
  '42501', 'permission denied for table audit_logs',
  'D62: o service_role não altera audit_logs');
select throws_ok(
  $$delete from public.audit_logs where entity_id = pg_temp.id('A')$$,
  '42501', 'permission denied for table audit_logs',
  'D62: o service_role não apaga audit_logs');
select throws_ok(
  $$truncate public.audit_logs$$,
  '42501', 'permission denied for table audit_logs',
  'D62: o service_role não esvazia audit_logs');
select throws_ok(
  $$update public.field_history set field = 'alterado' where field = 'teste_190_nao_critica'$$,
  '42501', 'permission denied for table field_history',
  'D62: o service_role não altera field_history');
select throws_ok(
  $$delete from public.restricted_access_logs where resource_id = pg_temp.id('evidência A')$$,
  '42501', 'permission denied for table restricted_access_logs',
  'D62: o service_role não apaga restricted_access_logs');
select throws_ok(
  $$update public.membership_evidence_files set description = 'alterada' where id = pg_temp.id('evidência A')$$,
  '42501', 'permission denied for table membership_evidence_files',
  'D62/§2.5: o service_role não altera a evidência');
reset role;
select throws_ok(
  $$update public.membership_evidence_files set description = 'alterada' where id = pg_temp.id('evidência A')$$,
  'P0001', 'tabela só de inclusão: UPDATE não é permitido em public.membership_evidence_files',
  'D62/§2.5 (gatilho): a evidência é só de inclusão, nem por SQL direto');
select throws_ok(
  $$delete from public.membership_evidence_files where id = pg_temp.id('evidência A')$$,
  'P0001', 'tabela só de inclusão: DELETE não é permitido em public.membership_evidence_files',
  'D62/§2.5 (gatilho): a evidência não é apagada, nem por SQL direto');
select is(
  (select count(*)::int from public.audit_logs
   where entity_id = pg_temp.id('A') and action like 'organizations.%'),
  2,
  'D62: os registros de A continuam lá, inalterados (inclusão e alteração de contatos)');

-- D64: metadata sem CNPJ, e-mail nem telefone ---------------------------------------------

select ok(
  exists (select 1 from public.audit_logs
          where entity_id = pg_temp.id('A') and action = 'organizations.update'
            and metadata -> 'campos' ? 'contact_email' and metadata -> 'campos' ? 'contact_phone'),
  'D64 (contraste): a auditoria registra quais campos de contato mudaram');
select is(
  (select count(*)::int from public.audit_logs
   where (entity_id in (pg_temp.id('A'), pg_temp.id('pedido A'), pg_temp.id('A1'), pg_temp.id('M'), pg_temp.id('A/M'))
          or actor_organization_id = pg_temp.id('A'))
     and (metadata::text like '%19000000000110%' or metadata::text like '%@%'
          or metadata::text like '%3333-1900%' or metadata::text like '%98888-1900%')),
  0,
  'D64: metadata não traz CNPJ, e-mail nem telefone');

select pg_temp.entrar(null);

select * from finish();
rollback;
