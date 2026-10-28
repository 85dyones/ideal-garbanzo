-- I1.4: membros da empresa (ADR-0002 §2.6; anexo A.4, D26 a D33; CT2.5 e
-- CT2.6 do teste 2; CT4.8 e CT4.10 do teste 4). CT2.5 pelo servidor fica
-- para a I1.5; a leitura do teste 2 (CT2.1 a CT2.4) está no 170.
--
-- Camadas em organization_members: privilégio por coluna; no INSERT, o gatilho
-- proteger_vinculo e depois a política; no UPDATE, as políticas de SELECT e de
-- UPDATE (filtram as linhas, sem erro), o gatilho e a garantia de org_admin.
-- Quem lê o vínculo mas não pode alterá-lo (member, operador) mostra a política
-- de UPDATE sozinha. O gatilho é exercitado sozinho como postgres com as
-- claims do usuário; a política de INSERT, com o gatilho desligado só dentro
-- desta transação.
begin;
select plan(69);

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
  values ($2, lower($1) || '-140@repasse-teste.invalid', case when $3 then now() end,
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

select pg_temp.usuario('X', '14000000-0000-4000-8000-000000000001');
select pg_temp.usuario('O', '14000000-0000-4000-8000-000000000002');
select pg_temp.usuario('A1', '14000000-0000-4000-8000-000000000003');
select pg_temp.usuario('A2', '14000000-0000-4000-8000-000000000004');
select pg_temp.usuario('A3', '14000000-0000-4000-8000-000000000005');
select pg_temp.usuario('B1', '14000000-0000-4000-8000-000000000006');
select pg_temp.usuario('B2', '14000000-0000-4000-8000-000000000007');
select pg_temp.usuario('K', '14000000-0000-4000-8000-000000000008');
select pg_temp.usuario('KM', '14000000-0000-4000-8000-000000000009');
select pg_temp.usuario('N', '14000000-0000-4000-8000-000000000010');
select pg_temp.usuario('N2', '14000000-0000-4000-8000-000000000011');
select pg_temp.usuario('N3', '14000000-0000-4000-8000-000000000012');
select pg_temp.usuario('N4', '14000000-0000-4000-8000-000000000013');
select pg_temp.usuario('C', '14000000-0000-4000-8000-000000000014');
select pg_temp.usuario('C2', '14000000-0000-4000-8000-000000000015');
select pg_temp.usuario('SP', '14000000-0000-4000-8000-000000000016');
select pg_temp.admin('X');
select pg_temp.conceder('O', 'operator', 'X');
select pg_temp.empresa('A', 'A1', 'X', '14000000000104', 'supplier');
select pg_temp.empresa('B', 'B1', 'X', '14000000000287', 'buyer');
select pg_temp.empresa('Z', 'K', 'X', '14000000000368', 'both');
select pg_temp.vincular('A', 'A2', 'member', 'A1');
select pg_temp.vincular('A', 'A3', 'member', 'A1');
select pg_temp.vincular('B', 'B2', 'member', 'B1');
select pg_temp.vincular('Z', 'KM', 'member', 'K');
select pg_temp.vincular('A', 'C', 'member', 'A1', false);
select pg_temp.vincular('A', 'C2', 'member', 'A1', false);

-- SP suspenso pelo administrador, por SQL direto (sem request.headers).
select pg_temp.entrar('X');
update public.profiles set status = 'suspended' where id = pg_temp.id('SP');
select pg_temp.entrar(null);

-- D26: o org_admin convida, sem aprovação da plataforma ----------------------------------

set local role authenticated;
select pg_temp.entrar('A1');
select is(
  pg_temp.resultado($$insert into public.organization_members (organization_id, profile_id, role, invited_email)
    values (pg_temp.id('A'), pg_temp.id('N'), 'member', 'n-140@repasse-teste.invalid')$$),
  'linhas: 1',
  'D26: o org_admin da empresa ativa convida');
select is(
  (select status from public.organization_members
   where organization_id = pg_temp.id('A') and profile_id = pg_temp.id('N')),
  'pending',
  'D26: o convite nasce pending');
select throws_ok(
  $$insert into public.organization_members (organization_id, profile_id, role, status)
    values (pg_temp.id('A'), pg_temp.id('N3'), 'member', 'active')$$,
  '42501', 'permission denied for table organization_members',
  'D26: o convite não nasce ativo (privilégio por coluna)');
select throws_ok(
  $$insert into public.organization_members (organization_id, profile_id, role)
    values (pg_temp.id('A'), pg_temp.id('SP'), 'member')$$,
  'P0001', 'o convidado precisa ter perfil ativo',
  'D26: não se convida perfil suspenso');
reset role;
select throws_ok(
  $$insert into public.organization_members (organization_id, profile_id, role, status)
    values (pg_temp.id('A'), pg_temp.id('N3'), 'member', 'active')$$,
  'P0001', 'o vínculo nasce como convite pendente; o convidado aceita',
  'D26 (gatilho): o convite não nasce ativo');

-- D26b e D26d: só o convidado aceita ---------------------------------------------------

set local role authenticated;
select throws_ok(
  $$update public.organization_members set status = 'active'
    where organization_id = pg_temp.id('A') and profile_id = pg_temp.id('N')$$,
  'P0001', 'transição de vínculo inválida: pending para active',
  'D26b: o org_admin não ativa o convite de outra pessoa');
select pg_temp.entrar('X');
select throws_ok(
  $$update public.organization_members set status = 'active'
    where organization_id = pg_temp.id('A') and profile_id = pg_temp.id('N')$$,
  'P0001', 'transição de vínculo inválida: pending para active',
  'D26b/D30: nem o administrador da plataforma aceita no lugar do convidado');
select pg_temp.entrar('N');
select is(
  pg_temp.resultado($$update public.organization_members set status = 'active'
    where organization_id = pg_temp.id('A') and profile_id = pg_temp.id('N')$$),
  'linhas: 1',
  'D26d: o convidado aceita o próprio convite (contraste de D26b)');

-- CT4.10 e D26d: o convidado não muda o papel ao aceitar -------------------------------

select pg_temp.entrar('A1');
select is(
  (select count(*)::int from public.organization_members where id = pg_temp.id('A/C'))
  + (select count(*)::int from public.profiles where id = pg_temp.id('C')),
  1,
  '§2.9: a empresa vê o vínculo pendente, mas não o perfil do convidado antes do aceite');
select pg_temp.entrar('C');
select is(
  (select count(*)::int from public.organizations where id = pg_temp.id('A')),
  1,
  '§2.9: o convidado pendente lê a empresa que o convidou');
select is(
  (select count(*)::int from public.profiles where id = pg_temp.id('A1')),
  0,
  '§2.9: antes do aceite, o convidado não lê o perfil dos membros');
select throws_ok(
  $$update public.organization_members set status = 'active', role = 'org_admin'
    where organization_id = pg_temp.id('A') and profile_id = pg_temp.id('C')$$,
  '42501', 'ninguém altera o próprio vínculo, fora aceitar ou recusar o próprio convite',
  'CT4.10/D26d: o convidado não aceita mudando o papel para org_admin');
select is(
  (select status || '/' || role from public.organization_members
   where organization_id = pg_temp.id('A') and profile_id = pg_temp.id('C')),
  'pending/member',
  'CT4.10: o vínculo continua pending e member');
select is(
  pg_temp.resultado($$update public.organization_members set status = 'active'
    where organization_id = pg_temp.id('A') and profile_id = pg_temp.id('C')$$),
  'linhas: 1',
  'CT4.10: o convidado aceita sem mudar o papel (contraste)');
select is(
  (select count(*)::int from public.profiles where id = pg_temp.id('A1')),
  1,
  'CT4.10: depois do aceite, o convidado lê os colegas da empresa');
select pg_temp.entrar('A1');
select is(
  (select count(*)::int from public.profiles where id = pg_temp.id('C')),
  1,
  '§2.9: depois do aceite, a empresa lê o perfil do novo colega (contraste)');
select pg_temp.entrar('C2');
select is(
  pg_temp.resultado($$update public.organization_members set status = 'removed'
    where organization_id = pg_temp.id('A') and profile_id = pg_temp.id('C2')$$),
  'linhas: 1',
  'D26d: o convidado recusa o próprio convite');

-- D28: member não gerencia ---------------------------------------------------------------

select pg_temp.entrar('A2');
select throws_ok(
  $$insert into public.organization_members (organization_id, profile_id, role)
    values (pg_temp.id('A'), pg_temp.id('N3'), 'member')$$,
  '42501', 'só o administrador da empresa ativa ou da plataforma gerencia membros',
  'D28: member não convida');
select is(
  pg_temp.resultado($$update public.organization_members set status = 'suspended'
    where organization_id = pg_temp.id('A') and profile_id = pg_temp.id('A1')$$),
  'linhas: 0',
  'D28: member lê o vínculo do colega, mas não o suspende (política de UPDATE)');
reset role;
select throws_ok(
  $$update public.organization_members set status = 'suspended'
    where organization_id = pg_temp.id('A') and profile_id = pg_temp.id('A1')$$,
  '42501', 'só o administrador da empresa ativa ou da plataforma gerencia membros',
  'D28 (gatilho): member não suspende colega');

-- D29 e CT4.8: ninguém altera o próprio vínculo ------------------------------------------

set local role authenticated;
select is(
  pg_temp.resultado($$update public.organization_members set role = 'org_admin'
    where organization_id = pg_temp.id('A') and profile_id = pg_temp.id('A2')$$),
  'linhas: 0',
  'CT4.8/D29: member não se promove a org_admin');
reset role;
select throws_ok(
  $$update public.organization_members set role = 'org_admin'
    where organization_id = pg_temp.id('A') and profile_id = pg_temp.id('A2')$$,
  '42501', 'ninguém altera o próprio vínculo, fora aceitar ou recusar o próprio convite',
  'CT4.8/D29 (gatilho): member não se promove a org_admin');
select is(
  (select role from public.organization_members
   where organization_id = pg_temp.id('A') and profile_id = pg_temp.id('A2')),
  'member',
  'CT4.8: A2 continua member');

set local role authenticated;
select pg_temp.entrar('A1');
select throws_ok(
  $$update public.organization_members set role = 'member'
    where organization_id = pg_temp.id('A') and profile_id = pg_temp.id('A1')$$,
  '42501', 'ninguém altera o próprio vínculo, fora aceitar ou recusar o próprio convite',
  'D29: o org_admin não muda o próprio papel');
select throws_ok(
  $$update public.organization_members set status = 'removed'
    where organization_id = pg_temp.id('A') and profile_id = pg_temp.id('A1')$$,
  '42501', 'ninguém altera o próprio vínculo, fora aceitar ou recusar o próprio convite',
  'D29: o org_admin não muda o próprio status');

-- D26c: o org_admin gerencia os outros membros da própria empresa ativa ---------------------

select is(
  pg_temp.resultado($$update public.organization_members set status = 'suspended'
    where organization_id = pg_temp.id('A') and profile_id = pg_temp.id('A2')$$),
  'linhas: 1',
  'D26c: a1 suspende a2 (contraste do teste 2)');
select is(
  pg_temp.resultado($$update public.organization_members set status = 'active'
    where organization_id = pg_temp.id('A') and profile_id = pg_temp.id('A2')$$),
  'linhas: 1',
  'D26c: a1 reativa a2 (contraste do teste 2)');
select is(
  pg_temp.resultado($$update public.organization_members set role = 'org_admin'
    where organization_id = pg_temp.id('A') and profile_id = pg_temp.id('A3')$$),
  'linhas: 1',
  'D26c: o org_admin promove outro membro');
select is(
  pg_temp.resultado($$update public.organization_members set role = 'member'
    where organization_id = pg_temp.id('A') and profile_id = pg_temp.id('A3')$$),
  'linhas: 1',
  'D26c: o org_admin rebaixa outro membro');
select is(
  pg_temp.resultado($$update public.organization_members set status = 'removed'
    where organization_id = pg_temp.id('A') and profile_id = pg_temp.id('A3')$$),
  'linhas: 1',
  'D26c: o org_admin remove outro membro');
select throws_ok(
  $$update public.organization_members set role = 'org_admin'
    where organization_id = pg_temp.id('A') and profile_id = pg_temp.id('A3')$$,
  'P0001', 'vínculo removido não muda de papel; convide de novo',
  'D26c: vínculo removido não muda de papel');
select is(
  pg_temp.resultado($$update public.organization_members set status = 'pending', invited_email = 'a3-140@repasse-teste.invalid'
    where organization_id = pg_temp.id('A') and profile_id = pg_temp.id('A3')$$),
  'linhas: 1',
  'D26c: o reconvite reaproveita a linha removida');
select throws_ok(
  $$update public.organization_members set status = 'suspended'
    where organization_id = pg_temp.id('A') and profile_id = pg_temp.id('A3')$$,
  'P0001', 'transição de vínculo inválida: pending para suspended',
  'D26c: convite pendente não vai direto a suspended');
select throws_ok(
  $$update public.organization_members set invited_email = 'outro-140@repasse-teste.invalid'
    where organization_id = pg_temp.id('A') and profile_id = pg_temp.id('N')$$,
  'P0001', 'o e-mail do convite só muda no reconvite',
  'D26c: o e-mail do convite só muda no reconvite');
select is(
  pg_temp.resultado($$insert into public.organization_members (organization_id, profile_id, role)
    values (pg_temp.id('A'), pg_temp.id('N2'), 'member')$$),
  'linhas: 1',
  'D26c (preparo): o org_admin convida N2');
select is(
  pg_temp.resultado($$update public.organization_members set status = 'removed'
    where organization_id = pg_temp.id('A') and profile_id = pg_temp.id('N2')$$),
  'linhas: 1',
  'D26c: o org_admin cancela o convite pendente');

-- R3 (I1.8): reconvite com troca de papel numa chamada só ----------------------------
-- N2 está removido, como member. O id vem como postgres, fora da RLS.

reset role;
insert into pg_temp.fixture
  select 'A/N2', m.id from public.organization_members m
  where m.organization_id = pg_temp.id('A') and m.profile_id = pg_temp.id('N2');
set local role authenticated;

select matches(
  pg_temp.resultado($$select public.reconvidar_membro(pg_temp.id('A/N2'), 'n2-140@repasse-teste.invalid', 'dono')$$),
  '^erro 23514',
  'R3: papel inválido na troca derruba o reconvite inteiro');
reset role;
select is(
  (select m.role || '/' || m.status from public.organization_members m where m.id = pg_temp.id('A/N2')),
  'member/removed',
  'R3: depois da falha na troca, o vínculo continua removido (nada gravado)');
set local role authenticated;

select pg_temp.entrar('A2');
select matches(
  pg_temp.resultado($$select public.reconvidar_membro(pg_temp.id('A/N2'), 'n2-140@repasse-teste.invalid', 'member')$$),
  '^erro P0001: reconvite indisponível para este vínculo',
  'R3: member não reconvida (a RLS tira a linha do alcance)');

select pg_temp.entrar('A1');
select is(
  pg_temp.resultado($$select public.reconvidar_membro(pg_temp.id('A/N2'), 'n2-140@repasse-teste.invalid', 'org_admin')$$),
  'linhas: 1',
  'R3: o org_admin reconvida com papel novo');
reset role;
select is(
  (select m.role || '/' || m.status || '/' || m.invited_email from public.organization_members m where m.id = pg_temp.id('A/N2')),
  'org_admin/pending/n2-140@repasse-teste.invalid',
  'R3: o reconvite grava status, e-mail e papel juntos');
set local role authenticated;

select matches(
  pg_temp.resultado($$select public.reconvidar_membro(pg_temp.id('A/N2'), 'n2-140@repasse-teste.invalid', 'member')$$),
  '^erro P0001: reconvite indisponível para este vínculo',
  'R3: vínculo que não está removido não é reconvidado');

set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok(
  $$select public.reconvidar_membro(gen_random_uuid(), 'x@repasse-teste.invalid', 'member')$$,
  '42501', 'permission denied for function reconvidar_membro',
  'R3: anon não executa o reconvite');
set local role authenticated;
select pg_temp.entrar('A1');

-- CT2.5, CT2.6 e D27: o org_admin de A não gerencia B ---------------------------------------

select throws_ok(
  $$insert into public.organization_members (organization_id, profile_id, role)
    values (pg_temp.id('B'), pg_temp.id('N3'), 'member')$$,
  '42501', 'só o administrador da empresa ativa ou da plataforma gerencia membros',
  'CT2.5/D27: a1 não insere vínculo em B');
select is(
  pg_temp.resultado($$update public.organization_members set role = 'member'
    where organization_id = pg_temp.id('B') and profile_id = pg_temp.id('B1')$$),
  'linhas: 0',
  'CT2.6/D27: a1 não altera o papel de b1');
select is(
  pg_temp.resultado($$update public.organization_members set status = 'suspended'
    where organization_id = pg_temp.id('B') and profile_id = pg_temp.id('B2')$$),
  'linhas: 0',
  'CT2.6/D27: a1 não altera o status de membro de B');
select throws_ok(
  $$update public.organization_members set organization_id = pg_temp.id('B')
    where organization_id = pg_temp.id('A') and profile_id = pg_temp.id('A2')$$,
  '42501', 'permission denied for table organization_members',
  'D27: o id de B no payload não move vínculo de A para B (privilégio por coluna)');
reset role;
select throws_ok(
  $$update public.organization_members set status = 'suspended'
    where organization_id = pg_temp.id('B') and profile_id = pg_temp.id('B1')$$,
  '42501', 'só o administrador da empresa ativa ou da plataforma gerencia membros',
  'CT2.6/D27 (gatilho): a1 não suspende b1');
select throws_ok(
  $$update public.organization_members set organization_id = pg_temp.id('B')
    where organization_id = pg_temp.id('A') and profile_id = pg_temp.id('A2')$$,
  '42501', 'empresa e perfil do vínculo não mudam',
  'D27 (gatilho): o vínculo não muda de empresa');
select pg_temp.entrar(null);
select is(
  (select string_agg(p.nome || ':' || m.role || '/' || m.status, ',' order by p.nome)
   from public.organization_members m join pg_temp.fixture p on p.id = m.profile_id
   where m.organization_id = pg_temp.id('B')),
  'B1:org_admin/active,B2:member/active',
  'CT2.5/CT2.6: B continua só com b1 e B2, inalterados');

-- D30: o administrador da plataforma gerencia qualquer empresa -----------------------------

set local role authenticated;
select pg_temp.entrar('X');
select is(
  pg_temp.resultado($$insert into public.organization_members (organization_id, profile_id, role)
    values (pg_temp.id('B'), pg_temp.id('N4'), 'member')$$),
  'linhas: 1',
  'D30: o administrador convida para B');
select is(
  pg_temp.resultado($$update public.organization_members set status = 'suspended'
    where organization_id = pg_temp.id('B') and profile_id = pg_temp.id('B2')$$),
  'linhas: 1',
  'D30: o administrador suspende membro de B');
select is(
  pg_temp.resultado($$update public.organization_members set status = 'active', role = 'org_admin'
    where organization_id = pg_temp.id('B') and profile_id = pg_temp.id('B2')$$),
  'linhas: 1',
  'D30: o administrador reativa e promove membro de B');

-- D31: o operador não gerencia membros -------------------------------------------------

select pg_temp.entrar('O');
select is(
  (select count(*)::int from public.organization_members where organization_id = pg_temp.id('B')),
  3,
  'D31/§2.9: o operador lê os vínculos de B (contraste)');
select is(
  pg_temp.resultado($$update public.organization_members set status = 'suspended'
    where organization_id = pg_temp.id('B') and profile_id = pg_temp.id('B2')$$),
  'linhas: 0',
  'D31: o operador lê o vínculo, mas não o suspende (política de UPDATE)');
select throws_ok(
  $$insert into public.organization_members (organization_id, profile_id, role)
    values (pg_temp.id('B'), pg_temp.id('N3'), 'member')$$,
  '42501', 'só o administrador da empresa ativa ou da plataforma gerencia membros',
  'D31: o operador não convida');
reset role;
select throws_ok(
  $$update public.organization_members set status = 'suspended'
    where organization_id = pg_temp.id('B') and profile_id = pg_temp.id('B2')$$,
  '42501', 'só o administrador da empresa ativa ou da plataforma gerencia membros',
  'D31 (gatilho): o operador não suspende');

-- CT2.5, D28 e D31, camada da política de INSERT sozinha (gatilho desligado só aqui) ----------

alter table public.organization_members disable trigger organization_members_proteger;
set local role authenticated;
select pg_temp.entrar('A1');
select throws_ok(
  $$insert into public.organization_members (organization_id, profile_id, role)
    values (pg_temp.id('B'), pg_temp.id('N3'), 'member')$$,
  '42501', 'new row violates row-level security policy for table "organization_members"',
  'CT2.5/D27 (política): a1 não insere vínculo em B');
select pg_temp.entrar('A2');
select throws_ok(
  $$insert into public.organization_members (organization_id, profile_id, role)
    values (pg_temp.id('A'), pg_temp.id('N3'), 'member')$$,
  '42501', 'new row violates row-level security policy for table "organization_members"',
  'D28 (política): member não convida');
select pg_temp.entrar('O');
select throws_ok(
  $$insert into public.organization_members (organization_id, profile_id, role)
    values (pg_temp.id('B'), pg_temp.id('N3'), 'member')$$,
  '42501', 'new row violates row-level security policy for table "organization_members"',
  'D31 (política): o operador não convida');
select pg_temp.entrar('A1');
select is(
  pg_temp.resultado($$insert into public.organization_members (organization_id, profile_id, role)
    values (pg_temp.id('A'), pg_temp.id('N3'), 'member')$$),
  'linhas: 1',
  'CT2.5 (política): a1 convida para A (contraste)');
reset role;
alter table public.organization_members enable trigger organization_members_proteger;

-- D32: org_admin de empresa suspensa não gerencia ------------------------------------------

set local role authenticated;
select pg_temp.entrar('K');
select is(
  pg_temp.resultado($$update public.organization_members set status = 'suspended'
    where organization_id = pg_temp.id('Z') and profile_id = pg_temp.id('KM')$$),
  'linhas: 1',
  'D32: com a empresa ativa, o org_admin suspende membro (contraste)');
select pg_temp.entrar('X');
select is(
  pg_temp.resultado($$update public.organizations set status = 'suspended' where id = pg_temp.id('Z')$$),
  'linhas: 1',
  'D32 (preparo): o administrador suspende Z');
select pg_temp.entrar('K');
select is(
  pg_temp.resultado($$update public.organization_members set status = 'active'
    where organization_id = pg_temp.id('Z') and profile_id = pg_temp.id('KM')$$),
  'linhas: 0',
  'D32: com a empresa suspensa, o org_admin não reativa membro');
select throws_ok(
  $$insert into public.organization_members (organization_id, profile_id, role)
    values (pg_temp.id('Z'), pg_temp.id('N3'), 'member')$$,
  '42501', 'só o administrador da empresa ativa ou da plataforma gerencia membros',
  'D32: com a empresa suspensa, o org_admin não convida');

-- D33: a empresa ativa mantém um org_admin ativo -------------------------------------------

select pg_temp.entrar('X');
select throws_ok(
  $$update public.organization_members set status = 'suspended'
    where organization_id = pg_temp.id('A') and profile_id = pg_temp.id('A1')$$,
  'P0001', 'a empresa ativa precisa de ao menos um administrador ativo',
  'D33: suspender o único org_admin ativo é recusado');
select throws_ok(
  $$update public.organization_members set role = 'member'
    where organization_id = pg_temp.id('A') and profile_id = pg_temp.id('A1')$$,
  'P0001', 'a empresa ativa precisa de ao menos um administrador ativo',
  'D33: rebaixar o único org_admin ativo é recusado');
select is(
  pg_temp.resultado($$update public.organization_members set role = 'org_admin'
    where organization_id = pg_temp.id('A') and profile_id = pg_temp.id('A2')$$),
  'linhas: 1',
  'D33 (preparo): o administrador promove A2 a org_admin');
select is(
  pg_temp.resultado($$update public.organization_members set status = 'suspended'
    where organization_id = pg_temp.id('A') and profile_id = pg_temp.id('A1')$$),
  'linhas: 1',
  'D33: com outro org_admin ativo, suspender A1 é aceito (contraste)');

reset role;
select pg_temp.entrar(null);

select * from finish();
rollback;
