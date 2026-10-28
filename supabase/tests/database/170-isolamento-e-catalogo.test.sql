-- I1.4: acesso ao produto e isolamento entre empresas (ADR-0002 §2.2, §2.9 e
-- §2.15; anexo A.7, D47 a D50; teste 1: CT1.2 e CT1.3; teste 2: CT2.1 a
-- CT2.4 e D38). CT1.1 e CT1.4 (página do comprador) ficam para a I1.5/I1.6;
-- CT2.5 e CT2.6 estão no 140; D51 está no 160.
--
-- O teste 1 cobre a função private.pode_ver_catalogo(), que protegerá o
-- catálogo do Inc. 4. Leitura recusada aqui é sempre "0 linhas": a RLS filtra.
begin;
select plan(28);

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
  values ($2, lower($1) || '-170@repasse-teste.invalid', case when $3 then now() end,
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

select pg_temp.usuario('X', '17000000-0000-4000-8000-000000000001');
select pg_temp.usuario('O', '17000000-0000-4000-8000-000000000002');
select pg_temp.usuario('P1', '17000000-0000-4000-8000-000000000003');
select pg_temp.usuario('P2', '17000000-0000-4000-8000-000000000004');
select pg_temp.usuario('A1', '17000000-0000-4000-8000-000000000005');
select pg_temp.usuario('A2', '17000000-0000-4000-8000-000000000006');
select pg_temp.usuario('B1', '17000000-0000-4000-8000-000000000007');
select pg_temp.usuario('P3', '17000000-0000-4000-8000-000000000008');
select pg_temp.usuario('P4', '17000000-0000-4000-8000-000000000009');
select pg_temp.usuario('S1', '17000000-0000-4000-8000-000000000010');
select pg_temp.usuario('C1', '17000000-0000-4000-8000-000000000011');
select pg_temp.usuario('PE', '17000000-0000-4000-8000-000000000012');
select pg_temp.usuario('SV', '17000000-0000-4000-8000-000000000013');
select pg_temp.usuario('RV', '17000000-0000-4000-8000-000000000014');
select pg_temp.usuario('BO', '17000000-0000-4000-8000-000000000015');
select pg_temp.usuario('SP', '17000000-0000-4000-8000-000000000016');
select pg_temp.admin('X');
select pg_temp.conceder('O', 'operator', 'X');

-- Teste 2: A e B ativas, supplier; a1 org_admin de A, a2 member de A, b1 org_admin de B.
select pg_temp.empresa('A', 'A1', 'X', '17000000000194', 'supplier');
select pg_temp.empresa('B', 'B1', 'X', '17000000000275', 'supplier');
select pg_temp.vincular('A', 'A2', 'member', 'A1');

-- Teste 1: C compradora (P2), CS compradora suspensa (S1), CC compradora
-- encerrada (C1), D com kind both (BO); vínculos pending, suspended e removed
-- em C; SP com vínculo ativo em C e perfil suspenso.
select pg_temp.empresa('C', 'P2', 'X', '17000000000356', 'buyer');
select pg_temp.empresa('CS', 'S1', 'X', '17000000000437', 'buyer');
select pg_temp.empresa('CC', 'C1', 'X', '17000000000518', 'buyer');
select pg_temp.empresa('D', 'BO', 'X', '17000000000607', 'both');
select pg_temp.vincular('C', 'PE', 'member', 'P2', false);
select pg_temp.vincular('C', 'SV', 'member', 'P2');
select pg_temp.vincular('C', 'RV', 'member', 'P2');
select pg_temp.vincular('C', 'SP', 'member', 'P2');
select pg_temp.pedido('P1', 'P1', '17000000000194', 'buyer');
select pg_temp.pedido('P3', 'P3', '17000000000275', 'buyer');
select pg_temp.pedido('P4', 'P4', '17000000000356', 'buyer');

select pg_temp.entrar('P2');
update public.organization_members set status = 'suspended' where id = pg_temp.id('C/SV');
update public.organization_members set status = 'removed' where id = pg_temp.id('C/RV');
select pg_temp.entrar('X');
update public.organizations set status = 'suspended' where id = pg_temp.id('CS');
update public.organizations set status = 'closed' where id = pg_temp.id('CC');
update public.profiles set status = 'suspended' where id = pg_temp.id('SP');
update public.membership_applications set status = 'under_review' where id = pg_temp.id('pedido P3');
update public.membership_applications set status = 'rejected', decision_reason = 'teste'
where id = pg_temp.id('pedido P4');
select pg_temp.entrar(null);

-- Teste 1: quem vê o catálogo -----------------------------------------------------------

set local role authenticated;
select pg_temp.entrar('P2');
select ok((select private.pode_ver_catalogo()), 'CT1 (contraste): P2, membro ativo de empresa ativa buyer, vê o catálogo');
select pg_temp.entrar('BO');
select ok((select private.pode_ver_catalogo()), 'D48 (contraste): membro ativo de empresa ativa both vê o catálogo');
select pg_temp.entrar('P1');
select ok((select not private.pode_ver_catalogo()), 'CT1.2/D47: P1, com pedido submitted e sem empresa, não vê o catálogo');
select pg_temp.entrar('P3');
select ok((select not private.pode_ver_catalogo()), 'CT1.3: pedido under_review não dá catálogo');
select pg_temp.entrar('P4');
select ok((select not private.pode_ver_catalogo()), 'CT1.3: pedido rejected não dá catálogo');
select pg_temp.entrar('S1');
select ok((select not private.pode_ver_catalogo()), 'CT1.3: empresa buyer suspensa não dá catálogo');
select pg_temp.entrar('C1');
select ok((select not private.pode_ver_catalogo()), 'CT1.3: empresa buyer encerrada não dá catálogo');
select pg_temp.entrar('PE');
select ok((select not private.pode_ver_catalogo()), 'CT1.3: vínculo pending não dá catálogo');
select pg_temp.entrar('SV');
select ok((select not private.pode_ver_catalogo()), 'CT1.3: vínculo suspended não dá catálogo');
select pg_temp.entrar('RV');
select ok((select not private.pode_ver_catalogo()), 'CT1.3: vínculo removed não dá catálogo');
select pg_temp.entrar('A2');
select ok((select not private.pode_ver_catalogo()), 'CT1.3/D49: membro só de empresa supplier não vê o catálogo');
select pg_temp.entrar('SP');
select ok((select not private.pode_ver_catalogo()), 'CT1.3/D43: perfil suspenso não vê o catálogo');
reset role;
set local role anon;
select throws_ok(
  $$select private.pode_ver_catalogo()$$,
  '42501', 'permission denied for schema private',
  'CT1.3/D47: anônimo não chega à função do catálogo');
select throws_ok(
  $$select 1 from public.organizations$$,
  '42501', 'permission denied for table organizations',
  'D47: anônimo não lê empresas');
reset role;

-- Teste 2, CT2.1 a CT2.4 e D38/D50: a2 não lê nada de B ---------------------------------

set local role authenticated;
select pg_temp.entrar('A2');
select is(
  (select count(*)::int from public.organizations where id = pg_temp.id('A')),
  1,
  'CT2 (contraste): a2 lê A');
select is(
  (select count(*)::int from public.organizations where id = pg_temp.id('B')),
  0,
  'CT2.1/D50: a2 não lê organizations de B');
select is(
  (select count(*)::int from public.organization_members where organization_id = pg_temp.id('A')),
  2,
  'CT2 (contraste): a2 lê os membros de A');
select is(
  (select count(*)::int from public.organization_members where organization_id = pg_temp.id('B')),
  0,
  'CT2.2/D50: a2 não lê organization_members de B');
select is(
  (select count(*)::int from public.profiles where id = pg_temp.id('A1')),
  1,
  'D38 (contraste): a2 lê o perfil do colega a1');
select is(
  (select count(*)::int from public.profiles where id = pg_temp.id('B1')),
  0,
  'CT2.3/D38/D50: a2 não lê o perfil de b1');
select is(
  (select count(*)::int from public.membership_applications where id = pg_temp.id('pedido B')),
  0,
  'CT2.4/D50: a2 não lê o pedido que originou B');
select is(
  (select count(*)::int from public.membership_application_reviews where application_id = pg_temp.id('pedido B'))
  + (select count(*)::int from public.membership_evidence_files where application_id = pg_temp.id('pedido B')),
  0,
  '§2.9: a2 não lê conferência nem evidência da adesão de B');
select is(
  (select count(*)::int from public.platform_staff where profile_id = pg_temp.id('X')),
  0,
  '§2.9: a2 não lê a linha de papel do administrador');

select pg_temp.entrar('B1');
select is(
  (select count(*)::int from public.membership_applications where id = pg_temp.id('pedido B')),
  1,
  'CT2.4 (contraste): b1 lê o próprio pedido que originou B');
select is(
  (select count(*)::int from public.organizations where id = pg_temp.id('A'))
  + (select count(*)::int from public.organization_members where organization_id = pg_temp.id('A'))
  + (select count(*)::int from public.profiles where id in (pg_temp.id('A1'), pg_temp.id('A2'))),
  0,
  'CT2.1 a CT2.3/D50: b1 também não lê nada de A');

select pg_temp.entrar('X');
select is(
  (select count(*)::int from public.organizations where id in (pg_temp.id('A'), pg_temp.id('B')))
  + (select count(*)::int from public.profiles where id = pg_temp.id('B1'))
  + (select count(*)::int from public.membership_applications where id = pg_temp.id('pedido B')),
  4,
  'CT2 (contraste): X lê A, B, o perfil de b1 e o pedido de B');
select is(
  (select count(*)::int from public.platform_staff where profile_id = pg_temp.id('X')),
  1,
  '§2.9 (contraste): o administrador lê a própria linha de papel');

select pg_temp.entrar('O');
select is(
  (select count(*)::int from public.organizations where id in (pg_temp.id('A'), pg_temp.id('B')))
  + (select count(*)::int from public.organization_members where organization_id in (pg_temp.id('A'), pg_temp.id('B')))
  + (select count(*)::int from public.membership_applications where id = pg_temp.id('pedido B')),
  6,
  '§2.9 (contraste): o operador lê empresas, vínculos e pedidos');

reset role;
select pg_temp.entrar(null);

select * from finish();
rollback;
