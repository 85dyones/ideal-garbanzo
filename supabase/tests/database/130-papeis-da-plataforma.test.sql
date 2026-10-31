-- I1.4: papéis da plataforma e autopromoção (ADR-0002 §2.1, §2.4 e §2.13;
-- anexo A.3, D20 a D25b, e teste 4: CT4.1 a CT4.3 e CT4.7, com o contraste).
-- CT4.4 está no 110, CT4.5 no 120, CT4.8 e CT4.10 no 140, CT4.9 no 150 e
-- CT4.6 (metadado gravado pela API do Auth) na integração.
--
-- Camadas em platform_staff: privilégio por coluna; no INSERT, o gatilho
-- proteger_papel_da_plataforma e depois a política; no UPDATE, as políticas
-- (filtram as linhas, sem erro) e depois o gatilho. O gatilho é exercitado
-- sozinho como postgres com as claims do usuário; a política, com o gatilho
-- desligado só dentro desta transação.
begin;
select plan(50);

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
  values ($2, lower($1) || '-130@repasse-teste.invalid', case when $3 then now() end,
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

select pg_temp.usuario('X1', '13000000-0000-4000-8000-000000000001');
select pg_temp.usuario('X2', '13000000-0000-4000-8000-000000000002');
select pg_temp.usuario('O', '13000000-0000-4000-8000-000000000003');
select pg_temp.usuario('P', '13000000-0000-4000-8000-000000000004');
select pg_temp.usuario('Q', '13000000-0000-4000-8000-000000000005');
select pg_temp.usuario('T', '13000000-0000-4000-8000-000000000006');
select pg_temp.usuario('SU', '13000000-0000-4000-8000-000000000007');
select pg_temp.usuario('Z', '13000000-0000-4000-8000-000000000008');
select pg_temp.usuario('OA', '13000000-0000-4000-8000-000000000009');
select pg_temp.usuario('B', '13000000-0000-4000-8000-000000000010');
select pg_temp.admin('X1');
select pg_temp.conceder('X2', 'admin', 'X1');
select pg_temp.conceder('O', 'operator', 'X1');
select pg_temp.conceder('OA', 'operator', 'X1');

-- SU suspenso pelo administrador, por SQL direto (sem request.headers).
select pg_temp.entrar('X1');
update public.profiles set status = 'suspended' where id = pg_temp.id('SU');
select pg_temp.entrar(null);

-- CT4.1 e D22: autopromoção de quem não tem papel -------------------------------------

set local role authenticated;
select pg_temp.entrar('P');
select throws_ok(
  $$insert into public.platform_staff (profile_id, role) values (pg_temp.id('P'), 'admin')$$,
  '42501', 'só um administrador da plataforma concede ou altera papéis',
  'CT4.1/D22: P não se concede admin com o próprio token');
select throws_ok(
  $$insert into public.platform_staff (profile_id, role, granted_by) values (pg_temp.id('P'), 'admin', pg_temp.id('X1'))$$,
  '42501', 'permission denied for table platform_staff',
  'D22: papel com granted_by no payload é recusado pelo privilégio por coluna');
select is(
  (select count(*)::int from public.profiles where id = pg_temp.id('X2')),
  0,
  'D22: sem papel, P não lê perfil alheio');

-- D22: papel no metadado do usuário e do token não conta (§2.1).
reset role;
update auth.users
set raw_user_meta_data = raw_user_meta_data || '{"role": "admin"}', raw_app_meta_data = '{"role": "admin"}'
where id = pg_temp.id('P');
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', pg_temp.id('P'), 'role', 'authenticated',
                    'user_metadata', json_build_object('role', 'admin'),
                    'app_metadata', json_build_object('role', 'admin'))::text,
  true);
select ok(
  (select not private.tem_papel_na_plataforma(array['admin', 'operator'])),
  'D22: role admin no user_metadata e no app_metadata não dá papel na plataforma');
select throws_ok(
  $$insert into public.platform_staff (profile_id, role) values (pg_temp.id('P'), 'admin')$$,
  '42501', 'só um administrador da plataforma concede ou altera papéis',
  'D22: com role admin no metadado do token, P continua sem conceder papel');
select is(
  (select count(*)::int from public.profiles where id = pg_temp.id('X2')),
  0,
  'D22: com role admin no metadado do token, P continua sem ler perfil alheio');

reset role;
select pg_temp.entrar(null);
select is(
  (select count(*)::int from public.platform_staff where profile_id = pg_temp.id('P')),
  0,
  'CT4.1: as tentativas não criaram linha de P em platform_staff');

-- CT4.2: o operador não muda a própria linha -------------------------------------------

set local role authenticated;
select pg_temp.entrar('O');
select is(
  pg_temp.resultado($$update public.platform_staff set role = 'admin' where profile_id = pg_temp.id('O')$$),
  'linhas: 0',
  'CT4.2: o operador lê a própria linha, mas não se promove a admin');
select is(
  (select role || '/' || status from public.platform_staff where profile_id = pg_temp.id('O')),
  'operator/active',
  'CT4.2: O continua operator');
reset role;
select throws_ok(
  $$update public.platform_staff set role = 'admin' where profile_id = pg_temp.id('O')$$,
  '42501', 'só um administrador da plataforma concede ou altera papéis',
  'CT4.2 (gatilho): o operador não se promove a admin');

-- CT4.3 e D21: o operador não concede, não altera e não revoga ---------------------------

set local role authenticated;
select throws_ok(
  $$insert into public.platform_staff (profile_id, role) values (pg_temp.id('Q'), 'operator')$$,
  '42501', 'só um administrador da plataforma concede ou altera papéis',
  'CT4.3/D21: o operador não concede papel a outra pessoa');
select is(
  pg_temp.resultado($$update public.platform_staff set status = 'revoked' where profile_id = pg_temp.id('X2')$$),
  'linhas: 0',
  'CT4.3/D21: o operador não revoga outro papel');
select throws_ok(
  $$update public.platform_staff set granted_by = pg_temp.id('O') where profile_id = pg_temp.id('X2')$$,
  '42501', 'permission denied for table platform_staff',
  'CT4.3: granted_by não é alterável pela API');
reset role;
select throws_ok(
  $$update public.platform_staff set status = 'revoked' where profile_id = pg_temp.id('X2')$$,
  '42501', 'só um administrador da plataforma concede ou altera papéis',
  'CT4.3/D21 (gatilho): o operador não revoga outro papel');
select throws_ok(
  $$update public.platform_staff set granted_by = pg_temp.id('O') where profile_id = pg_temp.id('X2')$$,
  '42501', 'só um administrador da plataforma concede ou altera papéis',
  'CT4.3 (gatilho): o operador não altera granted_by');
select pg_temp.entrar(null);
select is(
  (select role || '/' || status || '/' || (granted_by = pg_temp.id('X1'))::text
   from public.platform_staff where profile_id = pg_temp.id('X2')),
  'admin/active/true',
  'CT4.3: o papel de X2 não mudou');

-- CT4.1 e CT4.3, camada da política sozinha (gatilho desligado só aqui) --------------------

alter table public.platform_staff disable trigger platform_staff_proteger;
set local role authenticated;
select pg_temp.entrar('P');
select throws_ok(
  $$insert into public.platform_staff (profile_id, role) values (pg_temp.id('P'), 'admin')$$,
  '42501', 'new row violates row-level security policy for table "platform_staff"',
  'CT4.1 (política): P não se concede admin');
select pg_temp.entrar('O');
select throws_ok(
  $$insert into public.platform_staff (profile_id, role) values (pg_temp.id('Q'), 'operator')$$,
  '42501', 'new row violates row-level security policy for table "platform_staff"',
  'CT4.3 (política): o operador não concede papel');
select pg_temp.entrar('X1');
select is(
  pg_temp.resultado($$insert into public.platform_staff (profile_id, role) values (pg_temp.id('Z'), 'operator')$$),
  'linhas: 1',
  'CT4.1/CT4.3 (política): o administrador concede (contraste)');
reset role;
alter table public.platform_staff enable trigger platform_staff_proteger;

-- D24: o administrador não mexe na própria linha ------------------------------------------

set local role authenticated;
select pg_temp.entrar('X1');
select throws_ok(
  $$update public.platform_staff set status = 'revoked' where profile_id = pg_temp.id('X1')$$,
  '42501', 'ninguém altera o próprio papel na plataforma',
  'D24: o administrador não revoga a própria linha');
select throws_ok(
  $$update public.platform_staff set role = 'operator' where profile_id = pg_temp.id('X1')$$,
  '42501', 'ninguém altera o próprio papel na plataforma',
  'D24: o administrador não muda o próprio papel');

-- CT4.7: granted_by e granted_at vêm do gatilho, não do payload ------------------------

select throws_ok(
  $$insert into public.platform_staff (profile_id, role, granted_by) values (pg_temp.id('Q'), 'operator', pg_temp.id('X2'))$$,
  '42501', 'permission denied for table platform_staff',
  'CT4.7: granted_by no payload é recusado pelo privilégio por coluna');
reset role;
select is(
  pg_temp.resultado($$insert into public.platform_staff (profile_id, role, granted_by, granted_at)
    values (pg_temp.id('Q'), 'operator', pg_temp.id('X2'), '2000-01-01')$$),
  'linhas: 1',
  'CT4.7 (gatilho): a concessão com granted_by e granted_at no payload é aceita');
select is(
  (select (granted_by = pg_temp.id('X1'))::text || '/' || (granted_at = now())::text
   from public.platform_staff where profile_id = pg_temp.id('Q')),
  'true/true',
  'CT4.7 (gatilho): grava granted_by = X1 e granted_at = agora, não os valores do payload');

-- D20, D23 e D25: o contraste do teste 4 -------------------------------------------------

set local role authenticated;
select is(
  pg_temp.resultado($$insert into public.platform_staff (profile_id, role) values (pg_temp.id('P'), 'operator')$$),
  'linhas: 1',
  'D20: X1 concede operator a P (contraste do teste 4)');
select is(
  (select granted_by from public.platform_staff where profile_id = pg_temp.id('P')),
  pg_temp.id('X1'),
  'D20: a linha de P tem granted_by = X1');
select pg_temp.entrar('P');
select ok(
  (select private.tem_papel_na_plataforma(array['operator'])),
  'D20: P age como operador na operação seguinte');
select is(
  (select count(*)::int from public.profiles where id = pg_temp.id('X2')),
  1,
  'D20: como operador, P lê perfil alheio');
select pg_temp.entrar('X1');
select is(
  pg_temp.resultado($$update public.platform_staff set status = 'revoked' where profile_id = pg_temp.id('P')$$),
  'linhas: 1',
  'D23: X1 revoga o papel de P');
select pg_temp.entrar('P');
select ok(
  (select not private.tem_papel_na_plataforma(array['admin', 'operator'])),
  'D25: com a mesma sessão, P perde o papel na operação seguinte');
select is(
  (select count(*)::int from public.profiles where id = pg_temp.id('X2')),
  0,
  'D25: revogado, P volta a não ler perfil alheio');

select pg_temp.entrar('X1');
select is(
  pg_temp.resultado($$insert into public.platform_staff (profile_id, role) values (pg_temp.id('T'), 'admin')$$),
  'linhas: 1',
  'D20: X1 concede admin a T');
select throws_ok(
  $$insert into public.platform_staff (profile_id, role) values (pg_temp.id('SU'), 'operator')$$,
  'P0001', 'o papel só vale para perfil ativo',
  'D20: papel para perfil suspenso é recusado');

-- D25: staff com perfil suspenso perde o papel ---------------------------------------------

select pg_temp.entrar('OA');
select is(
  (select count(*)::int from public.profiles where id = pg_temp.id('X2')),
  1,
  'D25: o operador ativo lê perfil alheio (contraste)');
select pg_temp.entrar('X1');
select is(
  pg_temp.resultado($$update public.profiles set status = 'suspended' where id = pg_temp.id('OA')$$),
  'linhas: 1',
  'D25 (preparo): X1 suspende o perfil do operador OA');
select pg_temp.entrar('OA');
select ok(
  (select not private.tem_papel_na_plataforma(array['operator'])),
  'D25: com o perfil suspenso, o operador perde o papel na operação seguinte');
select is(
  (select count(*)::int from public.profiles where id = pg_temp.id('X2')),
  0,
  'D25: com o perfil suspenso, o operador não lê perfil alheio');

-- D25b: liberar a auditoria a um operador ---------------------------------------------------

select pg_temp.entrar('O');
select ok((select not private.pode_ler_auditoria()), 'D25b: sem can_read_audit, o operador não lê auditoria');
select pg_temp.entrar('X1');
select is(
  pg_temp.resultado($$update public.platform_staff set can_read_audit = true where profile_id = pg_temp.id('O')$$),
  'linhas: 1',
  'D25b: o administrador libera a auditoria ao operador');
select throws_ok(
  $$update public.platform_staff set can_read_audit = true where profile_id = pg_temp.id('T')$$,
  '23514', 'new row for relation "platform_staff" violates check constraint "platform_staff_check"',
  'D25b: can_read_audit só vale para operador');
select pg_temp.entrar('O');
select ok((select private.pode_ler_auditoria()), 'D25b: com can_read_audit, o operador lê auditoria');

-- §2.10 e §2.12: sem DELETE; o service_role só lê ------------------------------------------

select pg_temp.entrar('X1');
select throws_ok(
  $$delete from public.platform_staff where profile_id = pg_temp.id('Z')$$,
  '42501', 'permission denied for table platform_staff',
  'D23/§2.10: revogar é mudar o status; não há DELETE pela API');
reset role;
select throws_ok(
  $$delete from public.platform_staff where profile_id = pg_temp.id('Z')$$,
  '42501', 'exclusão não é permitida em public.platform_staff',
  'D23/§2.10 (gatilho): nem por SQL direto se apaga papel');
-- O servidor com a chave secreta: claims de service_role, sem usuário.
set local role service_role;
select set_config('request.jwt.claims', '{"role": "service_role"}', true);
select throws_ok(
  $$insert into public.platform_staff (profile_id, role) values (pg_temp.id('B'), 'operator')$$,
  '42501', 'permission denied for table platform_staff',
  '§2.4: o service_role não concede papel');
select throws_ok(
  $$update public.platform_staff set status = 'revoked' where profile_id = pg_temp.id('X2')$$,
  '42501', 'permission denied for table platform_staff',
  '§2.4: o service_role não altera papel');
select is(
  (select count(*)::int from public.platform_staff where profile_id = pg_temp.id('X1')),
  1,
  '§2.12: o service_role lê platform_staff (contraste)');
reset role;

-- §2.13: sem sessão, só o primeiro administrador ---------------------------------------

select pg_temp.entrar(null);
select throws_ok(
  $$insert into public.platform_staff (profile_id, role) values (pg_temp.id('B'), 'admin')$$,
  '42501', 'já existe administrador ativo; papéis são concedidos por um administrador na própria sessão',
  '§2.13: sem sessão, ninguém vira administrador quando já existe um ativo');

-- D24: a plataforma mantém um administrador ativo (gatilho de garantia sozinho) ------------
-- Pelo caminho comum, ninguém revoga o último: o ator é administrador ativo e não
-- mexe na própria linha. A garantia é exercitada com o gatilho de proteção
-- desligado só aqui.

alter table public.platform_staff disable trigger platform_staff_proteger;
select throws_ok(
  $$update public.platform_staff set status = 'revoked' where role = 'admin' and status = 'active'$$,
  'P0001', 'a plataforma precisa de ao menos um administrador ativo',
  'D24 (garantia): revogar todos os administradores ativos é recusado');
select lives_ok(
  $$update public.platform_staff set status = 'revoked'
    where role = 'admin' and status = 'active' and profile_id <> pg_temp.id('X1')$$,
  'D24 (garantia): revogar os outros, mantendo um, é aceito (contraste)');
select is(
  (select count(*)::int from public.platform_staff where role = 'admin' and status = 'active'),
  1,
  'D24 (garantia): sobra exatamente um administrador ativo');
alter table public.platform_staff enable trigger platform_staff_proteger;

select * from finish();
rollback;
