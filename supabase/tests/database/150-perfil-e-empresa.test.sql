-- I1.4: perfil e empresa (ADR-0002 §2.4 e §2.8; anexo A.5, D34 a D37 e D38b;
-- CT4.9 do teste 4). D38 (perfis de outra empresa) está no 170, com o CT2.3.
--
-- Camadas em profiles e organizations: privilégio por coluna, políticas de
-- SELECT e de UPDATE (filtram as linhas, sem erro) e o gatilho proteger_*.
-- Quem lê a linha mas não pode alterá-la (colega, member, operador) mostra a
-- política de UPDATE sozinha; o gatilho é exercitado sozinho como postgres com
-- as claims do usuário.
begin;
select plan(35);

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
  values ($2, lower($1) || '-150@repasse-teste.invalid', case when $3 then now() end,
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

select pg_temp.usuario('X', '15000000-0000-4000-8000-000000000001');
select pg_temp.usuario('O', '15000000-0000-4000-8000-000000000002');
select pg_temp.usuario('U', '15000000-0000-4000-8000-000000000003');
select pg_temp.usuario('V', '15000000-0000-4000-8000-000000000004');
select pg_temp.usuario('A1', '15000000-0000-4000-8000-000000000005');
select pg_temp.usuario('A2', '15000000-0000-4000-8000-000000000006');
select pg_temp.usuario('SU', '15000000-0000-4000-8000-000000000007');
select pg_temp.admin('X');
select pg_temp.conceder('O', 'operator', 'X');
select pg_temp.empresa('A', 'A1', 'X', '15000000000169', 'supplier');
select pg_temp.vincular('A', 'A2', 'member', 'A1');

-- SU suspenso pelo administrador, por SQL direto (sem request.headers).
select pg_temp.entrar('X');
update public.profiles set status = 'suspended' where id = pg_temp.id('SU');
select pg_temp.entrar(null);

-- D34: o usuário ativo altera nome e telefone do próprio perfil ---------------------------

set local role authenticated;
select pg_temp.entrar('U');
select is(
  pg_temp.resultado($$update public.profiles set full_name = 'U Atualizado', phone = '+55 11 98888-0000'
    where id = pg_temp.id('U')$$),
  'linhas: 1',
  'D34: o usuário altera o próprio nome e telefone');
select is(
  (select full_name || '/' || phone from public.profiles where id = pg_temp.id('U')),
  'U Atualizado/+55 11 98888-0000',
  'D34: nome e telefone gravados');

-- D35 e CT4.9: e-mail só pela sincronização com o Auth -------------------------------------

select throws_ok(
  $$update public.profiles set email = 'outro-150@repasse-teste.invalid' where id = pg_temp.id('U')$$,
  '42501', 'permission denied for table profiles',
  'CT4.9/D35: o usuário não altera o próprio e-mail (privilégio por coluna)');
reset role;
select throws_ok(
  $$update public.profiles set email = 'outro-150@repasse-teste.invalid' where id = pg_temp.id('U')$$,
  '42501', 'o e-mail muda só pelo fluxo de confirmação do Auth',
  'CT4.9/D35 (gatilho): o usuário não altera o próprio e-mail');
select pg_temp.entrar(null);
update auth.users set email = 'u-novo-150@repasse-teste.invalid' where id = pg_temp.id('U');
select is(
  (select email from public.profiles where id = pg_temp.id('U')),
  'u-novo-150@repasse-teste.invalid',
  'D35: a troca no Auth chega ao perfil pela sincronização (contraste)');

-- D36 e CT4.9: ninguém altera o próprio status ------------------------------------------

set local role authenticated;
select pg_temp.entrar('U');
select throws_ok(
  $$update public.profiles set status = 'suspended' where id = pg_temp.id('U')$$,
  '42501', 'só um administrador da plataforma muda o status de outro perfil',
  'CT4.9/D36: o usuário não altera o próprio status');
select pg_temp.entrar('X');
select throws_ok(
  $$update public.profiles set status = 'suspended' where id = pg_temp.id('X')$$,
  '42501', 'só um administrador da plataforma muda o status de outro perfil',
  'D36: nem o administrador altera o próprio status');
select is(
  pg_temp.resultado($$update public.profiles set status = 'suspended' where id = pg_temp.id('V')$$),
  'linhas: 1',
  'D36: o administrador suspende outro perfil (contraste)');
select is(
  pg_temp.resultado($$update public.profiles set status = 'active' where id = pg_temp.id('V')$$),
  'linhas: 1',
  'D36: o administrador reativa outro perfil (contraste)');
select is(
  (select string_agg(status, ',' order by full_name) from public.profiles
   where id in (pg_temp.id('U'), pg_temp.id('X'))),
  'active,active',
  'CT4.9/D36: U e X continuam ativos');

-- D37: perfil alheio ---------------------------------------------------------------------

select pg_temp.entrar('U');
select is(
  pg_temp.resultado($$update public.profiles set full_name = 'Invadido' where id = pg_temp.id('V')$$),
  'linhas: 0',
  'D37: o usuário não altera perfil alheio');
select pg_temp.entrar('A2');
select is(
  (select count(*)::int from public.profiles where id = pg_temp.id('A1')),
  1,
  'D37: o colega lê o perfil do outro (contraste)');
select is(
  pg_temp.resultado($$update public.profiles set full_name = 'Invadido' where id = pg_temp.id('A1')$$),
  'linhas: 0',
  'D37: o colega lê o perfil, mas não o altera (política de UPDATE)');
select pg_temp.entrar('X');
select throws_ok(
  $$update public.profiles set full_name = 'Pelo administrador' where id = pg_temp.id('U')$$,
  '42501', 'só o próprio usuário, com perfil ativo, altera nome e telefone',
  'D37: o administrador não altera nome alheio; só muda o status');
select pg_temp.entrar('SU');
select throws_ok(
  $$update public.profiles set full_name = 'Suspenso' where id = pg_temp.id('SU')$$,
  '42501', 'só o próprio usuário, com perfil ativo, altera nome e telefone',
  'D37/D43: perfil suspenso não altera o próprio nome');
select throws_ok(
  $$insert into public.profiles (id, full_name) values ('15000000-0000-4000-8000-0000000000ff', 'Novo')$$,
  '42501', 'permission denied for table profiles',
  'D37/§2.8: perfil não nasce pela API');
reset role;
select pg_temp.entrar('A2');
select throws_ok(
  $$update public.profiles set full_name = 'Invadido' where id = pg_temp.id('A1')$$,
  '42501', 'só o próprio usuário, com perfil ativo, altera nome e telefone',
  'D37 (gatilho): o colega não altera o perfil do outro');
select pg_temp.entrar(null);
select throws_ok(
  $$insert into public.profiles (id, full_name) values ('15000000-0000-4000-8000-0000000000ff', 'Novo')$$,
  '42501', 'o perfil nasce só pelo cadastro',
  '§2.8 (gatilho): perfil não nasce fora do cadastro');
select is(
  (select string_agg(full_name, ',' order by full_name) from public.profiles
   where id in (pg_temp.id('V'), pg_temp.id('A1'), pg_temp.id('SU'))),
  'A1,SU,V',
  'D37: os perfis alheios não mudaram');

-- D38b: o org_admin altera nome e contatos da própria empresa ativa --------------------------

set local role authenticated;
select pg_temp.entrar('A1');
select is(
  pg_temp.resultado($$update public.organizations
    set name = 'A Renomeada', contact_email = 'contato@a-150.invalid', contact_phone = '+55 11 3333-0000'
    where id = pg_temp.id('A')$$),
  'linhas: 1',
  'D38b: o org_admin altera nome e contatos da própria empresa ativa');
select throws_ok(
  $$update public.organizations set legal_name = 'Outra Razão Ltda' where id = pg_temp.id('A')$$,
  '42501', 'só um administrador da plataforma altera razão social, CNPJ, tipo e marcação de teste',
  'D38b: o org_admin não altera a razão social');
select throws_ok(
  $$update public.organizations set cnpj = '15000000000240' where id = pg_temp.id('A')$$,
  '42501', 'só um administrador da plataforma altera razão social, CNPJ, tipo e marcação de teste',
  'D38b: o org_admin não altera o CNPJ');
select throws_ok(
  $$update public.organizations set kind = 'both' where id = pg_temp.id('A')$$,
  '42501', 'só um administrador da plataforma altera razão social, CNPJ, tipo e marcação de teste',
  'D38b: o org_admin não altera o tipo (passar a comprador abre o catálogo)');
select throws_ok(
  $$update public.organizations set is_test = true where id = pg_temp.id('A')$$,
  '42501', 'só um administrador da plataforma altera razão social, CNPJ, tipo e marcação de teste',
  'D38b: o org_admin não altera a marcação de teste');
select throws_ok(
  $$update public.organizations set status = 'closed' where id = pg_temp.id('A')$$,
  '42501', 'só um administrador da plataforma muda o status da empresa',
  'D38b: o org_admin não altera o status da empresa');
select throws_ok(
  $$insert into public.organizations (name, legal_name, cnpj, kind) values ('Nova', 'Nova Ltda', '15000000000240', 'buyer')$$,
  '42501', 'permission denied for table organizations',
  'D38b/§2.4: empresa não nasce pela API');

select pg_temp.entrar('A2');
select is(
  pg_temp.resultado($$update public.organizations set name = 'Pelo member' where id = pg_temp.id('A')$$),
  'linhas: 0',
  'D38b: member lê a empresa, mas não a altera (política de UPDATE)');
select pg_temp.entrar('O');
select is(
  pg_temp.resultado($$update public.organizations set name = 'Pelo operador' where id = pg_temp.id('A')$$),
  'linhas: 0',
  'D38b/§2.9: o operador lê a empresa, mas não a altera (política de UPDATE)');
reset role;
select pg_temp.entrar('A2');
select throws_ok(
  $$update public.organizations set name = 'Pelo member' where id = pg_temp.id('A')$$,
  '42501', 'só o administrador da empresa ativa ou da plataforma altera nome e contatos',
  'D38b (gatilho): member não altera a empresa');
select pg_temp.entrar(null);
select throws_ok(
  $$insert into public.organizations (name, legal_name, cnpj, kind) values ('Nova', 'Nova Ltda', '15000000000240', 'buyer')$$,
  '42501', 'a empresa nasce só pela aprovação da adesão',
  'D38b/§2.5 (gatilho): empresa não nasce fora da aprovação');

set local role authenticated;
select pg_temp.entrar('X');
select is(
  pg_temp.resultado($$update public.organizations set legal_name = 'A Razão Corrigida Ltda', kind = 'both'
    where id = pg_temp.id('A')$$),
  'linhas: 1',
  'D38b: o administrador da plataforma altera razão social e tipo (contraste)');
select is(
  (select name || '/' || legal_name || '/' || cnpj || '/' || kind || '/' || status || '/' || is_test::text
   from public.organizations where id = pg_temp.id('A')),
  'A Renomeada/A Razão Corrigida Ltda/15000000000169/both/active/false',
  'D38b: só as mudanças permitidas foram gravadas');

-- D38b: com a empresa suspensa, o org_admin não altera nem os contatos ------------------------

select is(
  pg_temp.resultado($$update public.organizations set status = 'suspended' where id = pg_temp.id('A')$$),
  'linhas: 1',
  'D38b (preparo): o administrador suspende A');
select pg_temp.entrar('A1');
select is(
  pg_temp.resultado($$update public.organizations set name = 'Suspensa Renomeada' where id = pg_temp.id('A')$$),
  'linhas: 0',
  'D38b/D32: com a empresa suspensa, o org_admin não altera o nome');
reset role;
select throws_ok(
  $$update public.organizations set name = 'Suspensa Renomeada' where id = pg_temp.id('A')$$,
  '42501', 'só o administrador da empresa ativa ou da plataforma altera nome e contatos',
  'D38b (gatilho): com a empresa suspensa, o org_admin não altera o nome');

select pg_temp.entrar(null);

select * from finish();
rollback;
