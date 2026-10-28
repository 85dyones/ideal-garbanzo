-- I1.4: configuração crítica (ADR-0002 §2.7; anexo A.8, D52 a D58; teste 13:
-- CT13.1, CT13.2, CT13.4 e CT13.5). CT13.3 (operação de servidor) fica para a
-- I1.5.
--
-- Preparo: a chave crítica K e a não crítica N entram na própria transação, sem
-- sessão, como uma migração faria. Camadas: privilégio por coluna (só value é
-- alterável), políticas de SELECT e de UPDATE (filtram as linhas, sem erro) e o
-- gatilho proteger_configuracao, exercitado sozinho como postgres com as claims
-- do usuário.
begin;
select plan(29);

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
  values ($2, lower($1) || '-180@repasse-teste.invalid', case when $3 then now() end,
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

select pg_temp.usuario('X', '18000000-0000-4000-8000-000000000001');
select pg_temp.usuario('O', '18000000-0000-4000-8000-000000000002');
select pg_temp.usuario('A1', '18000000-0000-4000-8000-000000000003');
select pg_temp.usuario('M', '18000000-0000-4000-8000-000000000004');
select pg_temp.usuario('P', '18000000-0000-4000-8000-000000000005');
select pg_temp.admin('X');
select pg_temp.conceder('O', 'operator', 'X');
select pg_temp.empresa('A', 'A1', 'X', '18000000000157', 'supplier');
select pg_temp.vincular('A', 'M', 'member', 'A1');

-- K nasce crítica pelo padrão da coluna; N é marcada não crítica.
insert into public.platform_settings (key, value, description)
values ('teste_180_critica', '{"v": 1}', 'chave crítica de teste');
insert into public.platform_settings (key, value, description, is_critical)
values ('teste_180_nao_critica', '{"v": 2}', 'chave não crítica de teste', false);

-- CT13.4, CT13.5, D54, D55 e D57: leitura -------------------------------------------------

set local role authenticated;
select pg_temp.entrar('X');
select is(
  (select count(*)::int from public.platform_settings where key in ('teste_180_critica', 'teste_180_nao_critica')),
  2,
  'D52 (contraste): o administrador lê K e N');
select pg_temp.entrar('O');
select is(
  (select count(*)::int from public.platform_settings where key = 'teste_180_critica'),
  0,
  'CT13.4/D54: o operador não lê a chave crítica K');
select is(
  (select count(*)::int from public.platform_settings where key = 'teste_180_nao_critica'),
  1,
  'CT13.5/D55: o operador lê a chave não crítica N');
select pg_temp.entrar('M');
select is(
  (select count(*)::int from public.platform_settings where key = 'teste_180_nao_critica'),
  1,
  'D57: membro ativo de empresa ativa lê a chave não crítica');
select is(
  (select count(*)::int from public.platform_settings where key = 'teste_180_critica'),
  0,
  'D57: membro ativo de empresa ativa não lê a chave crítica');
select pg_temp.entrar('P');
select is(
  (select count(*)::int from public.platform_settings where key in ('teste_180_critica', 'teste_180_nao_critica')),
  0,
  'D57: sem empresa nem papel, não lê nenhuma chave');

-- CT13.1 e D53: o operador não altera ------------------------------------------------------

select pg_temp.entrar('O');
select is(
  pg_temp.resultado($$update public.platform_settings set value = '{"v": 99}' where key = 'teste_180_critica'$$),
  'linhas: 0',
  'CT13.1/D53: o operador não altera K');
select is(
  pg_temp.resultado($$update public.platform_settings set value = '{"v": 99}' where key = 'teste_180_nao_critica'$$),
  'linhas: 0',
  'CT13.1/D53: o operador lê N, mas não o altera (política de UPDATE)');

-- CT13.2 e D56: ninguém insere nem apaga pela API ---------------------------------------

select throws_ok(
  $$insert into public.platform_settings (key, value, description) values ('teste_180_nova', '1', 'nova')$$,
  '42501', 'permission denied for table platform_settings',
  'CT13.2/D56: o operador não insere chave nova');
select throws_ok(
  $$delete from public.platform_settings where key = 'teste_180_critica'$$,
  '42501', 'permission denied for table platform_settings',
  'CT13.2/D56: o operador não apaga K');
select pg_temp.entrar('M');
select is(
  pg_temp.resultado($$update public.platform_settings set value = '{"v": 99}' where key = 'teste_180_nao_critica'$$),
  'linhas: 0',
  'D56: membro lê N, mas não o altera (política de UPDATE)');
select pg_temp.entrar('X');
select throws_ok(
  $$insert into public.platform_settings (key, value, description) values ('teste_180_nova', '1', 'nova')$$,
  '42501', 'permission denied for table platform_settings',
  'D56/§2.7: nem o administrador insere chave pela API; chave nova entra por migração');
select throws_ok(
  $$update public.platform_settings set description = 'outra' where key = 'teste_180_critica'$$,
  '42501', 'permission denied for table platform_settings',
  '§2.7: a descrição não é alterável pela API');
select throws_ok(
  $$update public.platform_settings set is_critical = false where key = 'teste_180_critica'$$,
  '42501', 'permission denied for table platform_settings',
  '§2.7: a marcação crítica não é alterável pela API');
reset role;
-- O servidor com a chave secreta: claims de service_role, sem usuário.
set local role service_role;
select set_config('request.jwt.claims', '{"role": "service_role"}', true);
select throws_ok(
  $$update public.platform_settings set value = '{"v": 99}' where key = 'teste_180_critica'$$,
  '42501', 'permission denied for table platform_settings',
  '§2.12: o service_role não escreve em platform_settings');
select is(
  (select count(*)::int from public.platform_settings where key = 'teste_180_critica'),
  1,
  '§2.12: o service_role lê platform_settings (contraste)');
reset role;

-- Gatilho sozinho, como postgres com as claims de quem tenta --------------------------------

select pg_temp.entrar('O');
select throws_ok(
  $$update public.platform_settings set value = '{"v": 99}' where key = 'teste_180_critica'$$,
  '42501', 'só um administrador da plataforma altera a configuração',
  'CT13.1/D53 (gatilho): o operador não altera K');
select throws_ok(
  $$insert into public.platform_settings (key, value, description) values ('teste_180_nova', '1', 'nova')$$,
  '42501', 'só um administrador da plataforma altera a configuração',
  'CT13.2 (gatilho): o operador não insere chave nova');
select pg_temp.entrar('M');
select throws_ok(
  $$update public.platform_settings set value = '{"v": 99}' where key = 'teste_180_nao_critica'$$,
  '42501', 'só um administrador da plataforma altera a configuração',
  'D56 (gatilho): membro não altera N');
select pg_temp.entrar('X');
select throws_ok(
  $$insert into public.platform_settings (key, value, description) values ('teste_180_nova', '1', 'nova')$$,
  '42501', 'chave nova de configuração entra por migração',
  'D56/§2.7 (gatilho): nem o administrador cria chave fora da migração');
select throws_ok(
  $$update public.platform_settings set description = 'outra' where key = 'teste_180_critica'$$,
  '42501', 'descrição e marcação crítica mudam só por migração',
  '§2.7 (gatilho): a descrição muda só por migração');
select throws_ok(
  $$update public.platform_settings set is_critical = false where key = 'teste_180_critica'$$,
  '42501', 'descrição e marcação crítica mudam só por migração',
  '§2.7 (gatilho): a marcação crítica muda só por migração');
select throws_ok(
  $$update public.platform_settings set key = 'teste_180_renomeada' where key = 'teste_180_critica'$$,
  '42501', 'a chave da configuração não muda',
  '§2.7 (gatilho): a chave não muda');
select throws_ok(
  $$delete from public.platform_settings where key = 'teste_180_critica'$$,
  '42501', 'exclusão não é permitida em public.platform_settings',
  'CT13.2 (gatilho): nem por SQL direto se apaga uma chave');
select pg_temp.entrar(null);
select is(
  (select string_agg(key || '=' || value::text || '/' || coalesce(updated_by::text, 'sem ator'), ', ' order by key)
   from public.platform_settings where key like 'teste_180_%'),
  'teste_180_critica={"v": 1}/sem ator, teste_180_nao_critica={"v": 2}/sem ator',
  'CT13.1/CT13.2: valores e updated_by inalterados; nenhuma chave nova');

-- D52 e D58: o administrador altera K (contraste do teste 13) -------------------------------

set local role authenticated;
select pg_temp.entrar('X');
select is(
  pg_temp.resultado($$update public.platform_settings set value = '{"v": 3}' where key = 'teste_180_critica'$$),
  'linhas: 1',
  'D52: o administrador altera K');
select is(
  (select updated_by from public.platform_settings where key = 'teste_180_critica'),
  pg_temp.id('X'),
  'D52: updated_by passa a X');
select is(
  (select string_agg(old_value::text || ' > ' || new_value::text || ' por '
                     || case changed_by when pg_temp.id('X') then 'X' else 'outro' end, ', ')
   from public.field_history
   where entity_type = 'platform_settings' and field = 'teste_180_critica' and changed_by is not null),
  '{"v": 1} > {"v": 3} por X',
  'D58: field_history guarda o valor anterior, o novo e o ator, e só a alteração de X');
select is(
  (select count(*)::int from public.audit_logs
   where action = 'platform_settings.update' and actor_profile_id = pg_temp.id('X')
     and metadata ->> 'chave' = 'teste_180_critica' and metadata -> 'campos' ? 'value'
     and metadata::text not like '%"v": 3%'),
  1,
  'D52/D64: a alteração fica na auditoria, com a chave e os campos, sem o valor');

reset role;
select pg_temp.entrar(null);

select * from finish();
rollback;
