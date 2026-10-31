-- I1.4: suspensão, reativação e encerramento (ADR-0002 §2.3, §2.10 e §2.11;
-- anexo A.6, D39 a D46; teste 5: CT5.1, CT5.3, CT5.4, CT5.5 e CT5.6). CT5.2
-- (operação de servidor) fica para a I1.5; CT5.1, CT5.4 e D40b pela API real
-- estão na integração.
--
-- "Sessão antiga": as claims do JWT de u1 e u2 são montadas antes da suspensão
-- e continuam as mesmas depois; quem muda a resposta é o banco, que lê o
-- status a cada consulta (§2.1). A chamada pela API é simulada com
-- request.headers (x-audit-reason e x-request-id), como o PostgREST faz.
begin;
select plan(60);

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
  values ($2, lower($1) || '-160@repasse-teste.invalid', case when $3 then now() end,
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

select pg_temp.usuario('X', '16000000-0000-4000-8000-000000000001');
select pg_temp.usuario('O', '16000000-0000-4000-8000-000000000002');
select pg_temp.usuario('U1', '16000000-0000-4000-8000-000000000003');
select pg_temp.usuario('U2', '16000000-0000-4000-8000-000000000004');
select pg_temp.usuario('F1', '16000000-0000-4000-8000-000000000005');
select pg_temp.usuario('G1', '16000000-0000-4000-8000-000000000006');
select pg_temp.usuario('GM', '16000000-0000-4000-8000-000000000007');
select pg_temp.usuario('OS', '16000000-0000-4000-8000-000000000008');
select pg_temp.usuario('OR', '16000000-0000-4000-8000-000000000009');
select pg_temp.usuario('R', '16000000-0000-4000-8000-000000000010');
select pg_temp.admin('X');
select pg_temp.conceder('O', 'operator', 'X');
select pg_temp.conceder('OS', 'operator', 'X');
select pg_temp.conceder('OR', 'operator', 'X');
select pg_temp.empresa('E', 'U1', 'X', '16000000000121', 'supplier');
select pg_temp.empresa('F', 'F1', 'X', '16000000000202', 'buyer');
select pg_temp.empresa('G', 'G1', 'X', '16000000000393', 'both');
select pg_temp.vincular('E', 'U2', 'member', 'U1');
select pg_temp.vincular('F', 'U2', 'member', 'F1');
select pg_temp.vincular('G', 'GM', 'member', 'G1');

select pg_temp.entrar('X');
update public.platform_staff set can_read_audit = true where profile_id in (pg_temp.id('OS'), pg_temp.id('OR'));
select pg_temp.entrar(null);
-- Chave não crítica, como uma migração a criaria (sem sessão).
insert into public.platform_settings (key, value, description, is_critical)
values ('teste_160_nao_critica', '{"v": 1}', 'chave não crítica de teste', false);

-- CT5.1, D39 e D43: perfil suspenso, sessão antiga --------------------------------------

set local role authenticated;
select pg_temp.entrar('U1');
select is(
  (select count(*)::int from public.organizations where id = pg_temp.id('E'))
  + (select count(*)::int from public.organization_members where organization_id = pg_temp.id('E')),
  3,
  'CT5.1 (antes): u1 lê E e os dois vínculos de E');

select pg_temp.entrar('X');
select pg_temp.api('{"x-audit-reason": "suspensao de teste", "x-request-id": "req-160-perfil"}');
select is(
  pg_temp.resultado($$update public.profiles set status = 'suspended' where id = pg_temp.id('U1')$$),
  'linhas: 1',
  'D39: o administrador suspende u1 pela API, com motivo');
select pg_temp.api(null);

select pg_temp.entrar('U1');
select is(
  (select count(*)::int from public.organizations where id = pg_temp.id('E')),
  0,
  'CT5.1/D43: suspenso, com a mesma sessão, u1 não lê E');
select is(
  (select count(*)::int from public.organization_members where organization_id = pg_temp.id('E')),
  0,
  'CT5.1/D43: suspenso, u1 não lê os vínculos de E, nem o próprio');
select is(
  (select count(*)::int from public.profiles where id = pg_temp.id('U2')),
  0,
  'D43: suspenso, u1 não lê os colegas');
select ok(
  (select not private.membro_ativo(pg_temp.id('E')) and not private.perfil_ativo()),
  'D43: suspenso, u1 não é membro ativo de E');
select throws_ok(
  $$insert into public.membership_applications (organization_name, legal_name, cnpj, requested_kind)
    values ('U1 Nova', 'U1 Nova Ltda', '16000000000474', 'buyer')$$,
  '42501', 'o pedido exige sessão de usuário com perfil ativo',
  'CT5.3/D43: suspenso, u1 não envia pedido de adesão');
select throws_ok(
  $$insert into public.organization_members (organization_id, profile_id, role)
    values (pg_temp.id('E'), pg_temp.id('R'), 'member')$$,
  '42501', 'só o administrador da empresa ativa ou da plataforma gerencia membros',
  'D43: suspenso, u1 não convida para E');
select is(
  pg_temp.resultado($$update public.organizations set name = 'Por u1 suspenso' where id = pg_temp.id('E')$$),
  'linhas: 0',
  'D43: suspenso, u1 não altera E');

select pg_temp.entrar('U2');
select is(
  (select count(*)::int from public.organizations where id = pg_temp.id('E'))
  + (select count(*)::int from public.organization_members where organization_id = pg_temp.id('E')),
  3,
  'CT5.1 (contraste): u2, com sessão do mesmo instante, continua lendo E e os vínculos de E');
select is(
  pg_temp.resultado($$insert into public.membership_applications (organization_name, legal_name, cnpj, requested_kind)
    values ('U2 Nova', 'U2 Nova Ltda', '16000000000474', 'buyer')$$),
  'linhas: 1',
  'CT5.3 (contraste): u2, com perfil ativo, envia pedido');

-- D46: a suspensão fica na auditoria, com motivo e request_id ---------------------------

select pg_temp.entrar('X');
select is(
  (select metadata ->> 'motivo' || '/' || request_id || '/' || (metadata -> 'status' ->> 'de') || '>'
          || (metadata -> 'status' ->> 'para') || '/' || (actor_profile_id = pg_temp.id('X'))::text
   from public.audit_logs
   where action = 'profiles.update' and entity_id = pg_temp.id('U1')),
  'suspensao de teste/req-160-perfil/active>suspended/true',
  'D46: a suspensão do perfil fica na auditoria, com motivo, request_id, transição e ator');

-- D42: reativado, u1 volta na operação seguinte ---------------------------------------

select pg_temp.api('{"x-audit-reason": "reativacao de teste"}');
select is(
  pg_temp.resultado($$update public.profiles set status = 'active' where id = pg_temp.id('U1')$$),
  'linhas: 1',
  'D42: o administrador reativa u1, com motivo');
select pg_temp.api(null);
select pg_temp.entrar('U1');
select is(
  (select count(*)::int from public.organizations where id = pg_temp.id('E'))
  + (select count(*)::int from public.organization_members where organization_id = pg_temp.id('E')),
  3,
  'D42: reativado, u1 volta a ler E e os vínculos na operação seguinte');

-- D40b: pela API, mudança de status sem motivo é recusada ------------------------------

select pg_temp.entrar('X');
select pg_temp.api('{"x-request-id": "req-160-sem-motivo"}');
select throws_ok(
  $$update public.profiles set status = 'suspended' where id = pg_temp.id('U2')$$,
  'P0001', 'informe o motivo da mudança de status',
  'D40b: suspender perfil pela API sem motivo é recusado');
select throws_ok(
  $$update public.organizations set status = 'suspended' where id = pg_temp.id('F')$$,
  'P0001', 'informe o motivo da mudança de status',
  'D40b: suspender empresa pela API sem motivo é recusado');
select pg_temp.api('{"x-audit-reason": "   "}');
select throws_ok(
  $$update public.profiles set status = 'suspended' where id = pg_temp.id('U2')$$,
  'P0001', 'informe o motivo da mudança de status',
  'D40b: motivo em branco conta como ausente');
select pg_temp.api(null);
select is(
  (select p.status || '/' || o.status from public.profiles p, public.organizations o
   where p.id = pg_temp.id('U2') and o.id = pg_temp.id('F')),
  'active/active',
  'D40b: sem motivo, nada mudou');

-- D41: o operador não suspende; o org_admin não suspende a própria empresa ---------------

select pg_temp.entrar('O');
select is(
  pg_temp.resultado($$update public.profiles set status = 'suspended' where id = pg_temp.id('U2')$$),
  'linhas: 0',
  'D41: o operador lê o perfil, mas não o suspende (política de UPDATE)');
select is(
  pg_temp.resultado($$update public.organizations set status = 'suspended' where id = pg_temp.id('E')$$),
  'linhas: 0',
  'D41: o operador lê a empresa, mas não a suspende (política de UPDATE)');
select pg_temp.entrar('U1');
select throws_ok(
  $$update public.organizations set status = 'suspended' where id = pg_temp.id('E')$$,
  '42501', 'só um administrador da plataforma muda o status da empresa',
  'D41: o org_admin não suspende a própria empresa');
reset role;
select pg_temp.entrar('O');
select pg_temp.api('{"x-audit-reason": "tentativa do operador"}');
select throws_ok(
  $$update public.profiles set status = 'suspended' where id = pg_temp.id('U2')$$,
  '42501', 'só um administrador da plataforma muda o status de outro perfil',
  'D41 (gatilho): o operador não suspende perfil');
select throws_ok(
  $$update public.organizations set status = 'suspended' where id = pg_temp.id('E')$$,
  '42501', 'só um administrador da plataforma muda o status da empresa',
  'D41 (gatilho): o operador não suspende empresa');
select pg_temp.api(null);

-- CT5.4, D40, D44 e D51: empresa suspensa, sessão antiga -----------------------------------

set local role authenticated;
select pg_temp.entrar('X');
select pg_temp.api('{"x-audit-reason": "empresa suspensa em teste"}');
select is(
  pg_temp.resultado($$update public.organizations set status = 'suspended' where id = pg_temp.id('E')$$),
  'linhas: 1',
  'D40: o administrador suspende E, com motivo');
select pg_temp.api(null);

select pg_temp.entrar('U2');
select is(
  (select status from public.organizations where id = pg_temp.id('E')),
  'suspended',
  'CT5.4/D51: u2 ainda lê a linha de E, com status suspended');
select is(
  (select count(*)::int from public.organization_members
   where organization_id = pg_temp.id('E') and profile_id <> pg_temp.id('U2')),
  0,
  'CT5.4/D44: u2 não lê os vínculos dos outros membros de E');
select is(
  (select count(*)::int from public.profiles where id = pg_temp.id('U1')),
  0,
  'CT5.4/D44: u2 não lê o perfil do colega de E');
select ok(
  (select not private.membro_ativo(pg_temp.id('E'))),
  'CT5.4/D44: u2 não é membro ativo de E');
select is(
  (select count(*)::int from public.organization_members
   where organization_id = pg_temp.id('F') and profile_id <> pg_temp.id('U2')),
  1,
  'D44: a outra empresa ativa de u2 continua acessível (contraste)');
select ok(
  (select private.membro_ativo(pg_temp.id('F'))),
  'D44: u2 continua membro ativo de F (contraste)');
select pg_temp.entrar('U1');
select throws_ok(
  $$insert into public.organization_members (organization_id, profile_id, role)
    values (pg_temp.id('E'), pg_temp.id('R'), 'member')$$,
  '42501', 'só o administrador da empresa ativa ou da plataforma gerencia membros',
  'CT5.4: o org_admin de E suspensa não convida');
select is(
  pg_temp.resultado($$update public.organizations set name = 'E suspensa renomeada' where id = pg_temp.id('E')$$),
  'linhas: 0',
  'CT5.4: o org_admin de E suspensa não altera E');
select pg_temp.entrar('X');
select is(
  (select count(*)::int from public.organization_members where organization_id = pg_temp.id('E')),
  2,
  'CT5.4 (contraste): o administrador lê os vínculos de E');
select is(
  (select metadata ->> 'motivo' || '/' || (metadata -> 'status' ->> 'de') || '>' || (metadata -> 'status' ->> 'para')
   from public.audit_logs
   where action = 'organizations.update' and entity_id = pg_temp.id('E') and actor_organization_id = pg_temp.id('E')),
  'empresa suspensa em teste/active>suspended',
  'D46: a suspensão da empresa fica na auditoria, com motivo');

select pg_temp.api('{"x-audit-reason": "empresa reativada em teste"}');
select is(
  pg_temp.resultado($$update public.organizations set status = 'active' where id = pg_temp.id('E')$$),
  'linhas: 1',
  'D42: o administrador reativa E');
select pg_temp.api(null);
select pg_temp.entrar('U2');
select is(
  (select count(*)::int from public.organization_members
   where organization_id = pg_temp.id('E') and profile_id <> pg_temp.id('U2')),
  1,
  'D42: com E reativada, u2 volta a ler os vínculos de E');

-- D40, D42 e D45: empresa encerrada -------------------------------------------------

select pg_temp.entrar('X');
select pg_temp.api('{"x-audit-reason": "encerramento de teste"}');
select is(
  pg_temp.resultado($$update public.organizations set status = 'closed' where id = pg_temp.id('G')$$),
  'linhas: 1',
  'D40: o administrador encerra G, com motivo');
select throws_ok(
  $$update public.organizations set status = 'active' where id = pg_temp.id('G')$$,
  'P0001', 'transição de status da empresa inválida: closed para active',
  'D42: empresa encerrada não volta a active');
select throws_ok(
  $$update public.organizations set status = 'suspended' where id = pg_temp.id('G')$$,
  'P0001', 'transição de status da empresa inválida: closed para suspended',
  'D42: empresa encerrada não vai a suspended');
select throws_ok(
  $$update public.organizations set status = 'pending' where id = pg_temp.id('F')$$,
  'P0001', 'transição de status da empresa inválida: active para pending',
  '§2.10: pending não é usado depois da aprovação');
select pg_temp.api(null);

select pg_temp.entrar('GM');
select is(
  (select status from public.organizations where id = pg_temp.id('G')),
  'closed',
  'D45/D51: o membro ainda lê a linha de G, com status closed');
select is(
  (select count(*)::int from public.organization_members
   where organization_id = pg_temp.id('G') and profile_id <> pg_temp.id('GM')),
  0,
  'D45: com G encerrada, o membro não lê os outros vínculos');
select ok(
  (select not private.membro_ativo(pg_temp.id('G'))),
  'D45: com G encerrada, o membro não é membro ativo');

reset role;
select pg_temp.entrar(null);
select lives_ok(
  $$select pg_temp.empresa('G2', 'R', 'X', '16000000000393', 'buyer')$$,
  '§2.10: empresa encerrada libera o CNPJ para nova adesão');

-- CT5.5: operador suspenso ou revogado ----------------------------------------------

set local role authenticated;
select pg_temp.entrar('OS');
select ok(
  (select count(*) from public.audit_logs where entity_id = pg_temp.id('E')) > 0,
  'CT5.5 (contraste): o operador com can_read_audit lê a auditoria');
select is(
  (select count(*)::int from public.platform_settings where key = 'teste_160_nao_critica'),
  1,
  'CT5.5 (contraste): o operador lê configuração não crítica');
select pg_temp.entrar('OR');
select ok(
  (select count(*) from public.audit_logs where entity_id = pg_temp.id('E')) > 0,
  'CT5.5 (contraste): o outro operador com can_read_audit lê a auditoria');
select is(
  (select count(*)::int from public.platform_settings where key = 'teste_160_nao_critica'),
  1,
  'CT5.5 (contraste): o outro operador lê configuração não crítica');

select pg_temp.entrar('X');
select pg_temp.api('{"x-audit-reason": "operador suspenso em teste"}');
select is(
  pg_temp.resultado($$update public.profiles set status = 'suspended' where id = pg_temp.id('OS')$$),
  'linhas: 1',
  'CT5.5 (preparo): o administrador suspende o perfil de OS');
select pg_temp.api(null);
select is(
  pg_temp.resultado($$update public.platform_staff set status = 'revoked' where profile_id = pg_temp.id('OR')$$),
  'linhas: 1',
  'CT5.5 (preparo): o administrador revoga o papel de OR');

select pg_temp.entrar('OS');
select is(
  (select count(*)::int from public.audit_logs where entity_id = pg_temp.id('E')),
  0,
  'CT5.5: operador com perfil suspenso não lê auditoria');
select is(
  (select count(*)::int from public.platform_settings where key = 'teste_160_nao_critica'),
  0,
  'CT5.5: operador com perfil suspenso não lê configuração não crítica');
select pg_temp.entrar('OR');
select is(
  (select count(*)::int from public.audit_logs where entity_id = pg_temp.id('E')),
  0,
  'CT5.5: operador revogado não lê auditoria');
select is(
  (select count(*)::int from public.platform_settings where key = 'teste_160_nao_critica'),
  0,
  'CT5.5: operador revogado não lê configuração não crítica');

-- CT5.6: vínculo suspenso ou removido -----------------------------------------------

select pg_temp.entrar('U1');
select is(
  pg_temp.resultado($$update public.organization_members set status = 'suspended'
    where organization_id = pg_temp.id('E') and profile_id = pg_temp.id('U2')$$),
  'linhas: 1',
  'CT5.6 (preparo): u1 suspende o vínculo de u2 em E');
select pg_temp.entrar('U2');
select is(
  (select count(*)::int from public.organizations where id = pg_temp.id('E'))
  + (select count(*)::int from public.organization_members
     where organization_id = pg_temp.id('E') and profile_id <> pg_temp.id('U2')),
  0,
  'CT5.6: com o vínculo suspenso, u2 não lê E nem os outros vínculos');
select ok(
  (select not private.membro_ativo(pg_temp.id('E'))),
  'CT5.6: com o vínculo suspenso, u2 não é membro ativo de E');
select is(
  (select count(*)::int from public.organizations where id = pg_temp.id('F')),
  1,
  'CT5.6 (contraste): u2 continua lendo F');
select pg_temp.entrar('U1');
select is(
  pg_temp.resultado($$update public.organization_members set status = 'removed'
    where organization_id = pg_temp.id('E') and profile_id = pg_temp.id('U2')$$),
  'linhas: 1',
  'CT5.6 (preparo): u1 remove u2 de E');
select pg_temp.entrar('U2');
select is(
  (select count(*)::int from public.organizations where id = pg_temp.id('E'))
  + (select count(*)::int from public.organization_members
     where organization_id = pg_temp.id('E') and profile_id <> pg_temp.id('U2'))
  + (select count(*)::int from public.profiles where id = pg_temp.id('U1')),
  0,
  'CT5.6: removido, u2 não lê E, os outros vínculos nem o perfil de u1');

reset role;
select pg_temp.entrar(null);

select * from finish();
rollback;
