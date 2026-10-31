-- I1.9: fornecedora só por convite (mudança de escopo de 30/10; ADR-0002 §9).
--
-- Camadas, de fora para dentro: privilégio por coluna, políticas (a de leitura
-- e a de alteração filtram as linhas, sem erro), gatilhos (o do convite e o do
-- pedido) e CHECK. A política de inclusão do convite e a CHECK do pedido são
-- exercitadas sozinhas, com o gatilho desligado só dentro desta transação. A
-- data de vencimento muda do mesmo jeito, só para montar o convite vencido.
begin;
select plan(75);

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
  values ($2, lower($1) || '-195@repasse-teste.invalid', case when $3 then now() end,
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

select pg_temp.usuario('X', '19500000-0000-4000-8000-000000000001');
select pg_temp.usuario('O', '19500000-0000-4000-8000-000000000002');
select pg_temp.usuario('A1', '19500000-0000-4000-8000-000000000003');
select pg_temp.usuario('A2', '19500000-0000-4000-8000-000000000004');
select pg_temp.usuario('AM', '19500000-0000-4000-8000-000000000005');
select pg_temp.usuario('S1', '19500000-0000-4000-8000-000000000006');
select pg_temp.usuario('B1', '19500000-0000-4000-8000-000000000007');
select pg_temp.usuario('N1', '19500000-0000-4000-8000-000000000008');
select pg_temp.usuario('N2', '19500000-0000-4000-8000-000000000009');
select pg_temp.usuario('N3', '19500000-0000-4000-8000-00000000000a');
select pg_temp.usuario('N4', '19500000-0000-4000-8000-00000000000b');
select pg_temp.usuario('N5', '19500000-0000-4000-8000-00000000000c');
select pg_temp.usuario('NU', '19500000-0000-4000-8000-00000000000d', false);
select pg_temp.usuario('XA', '19500000-0000-4000-8000-00000000000e');
select pg_temp.usuario('D1', '19500000-0000-4000-8000-00000000000f');
select pg_temp.usuario('D2', '19500000-0000-4000-8000-000000000010');
select pg_temp.usuario('E1', '19500000-0000-4000-8000-000000000011');
select pg_temp.admin('X');
select pg_temp.conceder('O', 'operator', 'X');
select pg_temp.conceder('XA', 'admin', 'X');
select pg_temp.empresa('C', 'A1', 'X', '19500000000189', 'buyer');
select pg_temp.vincular('C', 'A2', 'org_admin', 'A1');
select pg_temp.vincular('C', 'AM', 'member', 'A1');
select pg_temp.vincular('C', 'XA', 'org_admin', 'A1');
select pg_temp.empresa('S', 'S1', 'X', '19500000000260', 'supplier');
select pg_temp.empresa('B', 'B1', 'X', '19500000000340', 'buyer');
select pg_temp.empresa('D', 'D1', 'X', '19500000000936', 'buyer');
select pg_temp.vincular('D', 'D2', 'org_admin', 'D1');
select pg_temp.empresa('E', 'E1', 'X', '19500000001070', 'buyer');

-- Guarda o id do convite pendente do e-mail (e da empresa, se houver) na fixture.
create function pg_temp.guardar_convite(nome text, perfil text, empresa text default null) returns void
language sql
as $f$
  insert into pg_temp.fixture
  select $1, c.id from public.supplier_invitations c
  where c.email = lower($2) || '-195@repasse-teste.invalid' and c.status = 'pending'
    and c.organization_id is not distinct from pg_temp.id($3)
  order by c.created_at
  limit 1;
$f$;

-- CV: quem convida e o que o convite exige ---------------------------------------------

set local role authenticated;
select pg_temp.entrar('O');
select throws_ok(
  $$insert into public.supplier_invitations (email) values ('n1-195@repasse-teste.invalid')$$,
  '42501', 'só um administrador da plataforma convida fornecedoras',
  'CV01: o operador não convida fornecedora');
select pg_temp.entrar('A1');
select throws_ok(
  $$insert into public.supplier_invitations (email) values ('n1-195@repasse-teste.invalid')$$,
  '42501', 'só um administrador da plataforma convida fornecedoras',
  'CV02: o administrador de uma empresa não convida fornecedora');
select pg_temp.entrar('X');
select is(
  pg_temp.resultado($$insert into public.supplier_invitations (email) values ('  N1-195@Repasse-Teste.invalid ')$$),
  'linhas: 1',
  'CV03: o administrador da plataforma convida (contraste de CV01 e CV02)');
reset role;
select ok(
  (select c.invited_by = pg_temp.id('X') and c.status = 'pending' and c.organization_id is null
          and c.expires_at = now() + interval '14 days'
   from public.supplier_invitations c where c.email = 'n1-195@repasse-teste.invalid'),
  'CV03: o e-mail fica normalizado, com quem convidou, pendente e a validade da configuração (14 dias)');
set local role authenticated;
select throws_ok(
  $$insert into public.supplier_invitations (email) values ('n1-195@repasse-teste.invalid')$$,
  'P0001', 'já existe convite pendente para este e-mail',
  'CV04: um convite pendente por e-mail');
select throws_ok(
  $$insert into public.supplier_invitations (email, status) values ('n2-195@repasse-teste.invalid', 'used')$$,
  '42501', 'permission denied for table supplier_invitations',
  'CV05: o convite não nasce usado nem com outro autor (privilégio por coluna)');
select throws_ok(
  $$insert into public.supplier_invitations (email, organization_id) values ('am-195@repasse-teste.invalid', pg_temp.id('C'))$$,
  'P0001', 'o convite para uma compradora vai ao e-mail de um administrador ativo dela, com a empresa ativa',
  'CV06: o convite para a compradora não vai a um membro comum');
select throws_ok(
  $$insert into public.supplier_invitations (email, organization_id) values ('s1-195@repasse-teste.invalid', pg_temp.id('S'))$$,
  'P0001', 'o convite para uma compradora vai ao e-mail de um administrador ativo dela, com a empresa ativa',
  'CV07: nem a empresa que já fornece');
select is(
  pg_temp.resultado($$insert into public.supplier_invitations (email, organization_id)
    values ('a1-195@repasse-teste.invalid', pg_temp.id('C')), ('a2-195@repasse-teste.invalid', pg_temp.id('C'))$$),
  'linhas: 2',
  'CV08: o convite para a compradora vai aos administradores dela (contraste de CV06 e CV07)');
select is(
  pg_temp.resultado($$insert into public.supplier_invitations (email, organization_id)
    values ('xa-195@repasse-teste.invalid', pg_temp.id('C')), ('d1-195@repasse-teste.invalid', pg_temp.id('D')),
           ('e1-195@repasse-teste.invalid', pg_temp.id('E'))$$),
  'linhas: 3',
  'CV08b: convites de XA para C, de D1 para D e de E1 para E');
select is(
  pg_temp.resultado($$insert into public.supplier_invitations (email)
    values ('n3-195@repasse-teste.invalid'), ('n4-195@repasse-teste.invalid'),
           ('n5-195@repasse-teste.invalid'), ('nu-195@repasse-teste.invalid')$$),
  'linhas: 4',
  'CV09: convites de N3, N4, N5 e NU');
select pg_temp.entrar('XA');
select throws_ok(
  $$insert into public.supplier_invitations (email, organization_id) values ('xa-195@repasse-teste.invalid', pg_temp.id('B'))$$,
  '42501', 'ninguém convida o próprio e-mail para fornecer',
  'CV11: ninguém convida o próprio e-mail, nem quem administra a plataforma (R-I1.11-03)');
select pg_temp.entrar('X');
select throws_ok(
  $$insert into public.supplier_invitations (email) values ('x-195@repasse-teste.invalid')$$,
  '42501', 'ninguém convida o próprio e-mail para fornecer',
  'CV11: nem para empresa nova');

reset role;
select pg_temp.entrar(null);
select pg_temp.guardar_convite('convite N1', 'N1');
select pg_temp.guardar_convite('convite N3', 'N3');
select pg_temp.guardar_convite('convite N4', 'N4');
select pg_temp.guardar_convite('convite NU', 'NU');
select pg_temp.guardar_convite('convite A1', 'A1', 'C');
select pg_temp.guardar_convite('convite A2', 'A2', 'C');
select pg_temp.guardar_convite('convite XA', 'XA', 'C');
select pg_temp.guardar_convite('convite D1', 'D1', 'D');
select pg_temp.guardar_convite('convite E1', 'E1', 'E');

-- A política de inclusão sozinha, com o gatilho desligado só nesta transação.
alter table public.supplier_invitations disable trigger supplier_invitations_proteger;
set local role authenticated;
select pg_temp.entrar('O');
select throws_ok(
  $$insert into public.supplier_invitations (email) values ('o-195@repasse-teste.invalid')$$,
  '42501', 'new row violates row-level security policy for table "supplier_invitations"',
  'CV10 (política): sem o gatilho, a política ainda recusa o operador');
reset role;
select pg_temp.entrar(null);
alter table public.supplier_invitations enable trigger supplier_invitations_proteger;

-- LE: quem lê o convite -----------------------------------------------------------------

set local role authenticated;
select pg_temp.entrar('N1');
select is(
  (select count(*)::int from public.supplier_invitations),
  1,
  'LE01: o convidado lê só o convite do próprio e-mail');
select pg_temp.entrar('N2');
select is(
  (select count(*)::int from public.supplier_invitations),
  0,
  'LE02: quem não foi convidado não lê convite de ninguém');
select pg_temp.entrar('NU');
select is(
  (select count(*)::int from public.supplier_invitations),
  0,
  'LE03: com o e-mail sem confirmação, nem o próprio convite');
select pg_temp.entrar('N1');
select throws_ok(
  $$select invited_by from public.supplier_invitations$$,
  '42501', 'permission denied for table supplier_invitations',
  'LE07: o convidado não lê quem convidou, usou ou revogou (R-I1.11-11)');
select is(
  pg_temp.resultado($$select id, email, organization_id, status, expires_at, used_at, revoked_at, created_at, updated_at
    from public.supplier_invitations$$),
  'linhas: 1',
  'LE07: lê as colunas das telas (contraste)');
select pg_temp.entrar('O');
select ok(
  exists (select 1 from public.supplier_invitations where id = pg_temp.id('convite N1')),
  'LE04: a equipe lê os convites (contraste de LE02)');
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok(
  $$select 1 from public.supplier_invitations$$,
  '42501', 'permission denied for table supplier_invitations',
  'LE05: anon não lê convite');
reset role;

-- PD: o pedido de adesão como fornecedora -----------------------------------------------

set local role authenticated;
select pg_temp.entrar('N2');
select throws_ok(
  $$insert into public.membership_applications (organization_name, legal_name, cnpj, requested_kind)
    values ('Loja N2', 'Loja N2 Ltda', '19500000000421', 'supplier')$$,
  'P0001', 'o pedido como fornecedora exige convite da plataforma para o seu e-mail',
  'PD01: sem convite para o próprio e-mail, o pedido como fornecedora é recusado (há convites de outros e-mails pendentes)');
select throws_ok(
  $$insert into public.membership_applications (organization_name, legal_name, cnpj, requested_kind)
    values ('Loja N2', 'Loja N2 Ltda', '19500000000421', 'both')$$,
  'P0001', 'o pedido como fornecedora exige convite da plataforma para o seu e-mail',
  'PD02: como fornecedora e compradora também');
select is(
  pg_temp.resultado($$insert into public.membership_applications (organization_name, legal_name, cnpj, requested_kind)
    values ('Loja N2', 'Loja N2 Ltda', '19500000000421', 'buyer')$$),
  'linhas: 1',
  'PD03: o pedido de compradora não pede convite (contraste de PD01)');
select ok(
  (select supplier_invitation_id is null from public.membership_applications
   where applicant_profile_id = pg_temp.id('N2')),
  'PD03: o pedido de compradora fica sem convite');

select pg_temp.entrar('N1');
select throws_ok(
  $$insert into public.membership_applications (organization_name, legal_name, cnpj, requested_kind, supplier_invitation_id)
    values ('Loja N1', 'Loja N1 Ltda', '19500000000502', 'supplier', pg_temp.id('convite N1'))$$,
  '42501', 'permission denied for table membership_applications',
  'PD04: o requerente não escolhe o convite (privilégio por coluna)');
select is(
  pg_temp.resultado($$insert into public.membership_applications (organization_name, legal_name, cnpj, requested_kind)
    values ('Loja N1', 'Loja N1 Ltda', '19500000000502', 'supplier')$$),
  'linhas: 1',
  'PD05: com convite para o próprio e-mail, o pedido como fornecedora entra (contraste de PD01)');
select ok(
  (select supplier_invitation_id = pg_temp.id('convite N1') from public.membership_applications
   where applicant_profile_id = pg_temp.id('N1')),
  'PD05: o pedido guarda o convite');
reset role;
select is(
  (select status || '/' || (used_by = pg_temp.id('N1'))::text || '/' || (used_at is not null)::text
   from public.supplier_invitations where id = pg_temp.id('convite N1')),
  'used/true/true',
  'PD05: o convite fica usado pelo requerente na mesma transação');

-- Convite de N3 vencido: a data muda só com o gatilho desligado, nesta transação.
alter table public.supplier_invitations disable trigger supplier_invitations_proteger;
update public.supplier_invitations set expires_at = now() - interval '1 day' where id = pg_temp.id('convite N3');
alter table public.supplier_invitations enable trigger supplier_invitations_proteger;

set local role authenticated;
select pg_temp.entrar('N3');
select throws_ok(
  $$insert into public.membership_applications (organization_name, legal_name, cnpj, requested_kind)
    values ('Loja N3', 'Loja N3 Ltda', '19500000000693', 'supplier')$$,
  'P0001', 'o pedido como fornecedora exige convite da plataforma para o seu e-mail',
  'PD06: convite vencido não serve');

select pg_temp.entrar('X');
select is(
  pg_temp.resultado($$update public.supplier_invitations set status = 'revoked' where id = pg_temp.id('convite N4')$$),
  'linhas: 1',
  'RV01: o administrador revoga o convite');
select pg_temp.entrar('N4');
select throws_ok(
  $$insert into public.membership_applications (organization_name, legal_name, cnpj, requested_kind)
    values ('Loja N4', 'Loja N4 Ltda', '19500000000774', 'supplier')$$,
  'P0001', 'o pedido como fornecedora exige convite da plataforma para o seu e-mail',
  'PD07: convite revogado não serve');

select pg_temp.entrar('NU');
select throws_ok(
  $$insert into public.membership_applications (organization_name, legal_name, cnpj, requested_kind)
    values ('Loja NU', 'Loja NU Ltda', '19500000000855', 'supplier')$$,
  '42501', 'confirme o e-mail antes de enviar o pedido',
  'PD08: com o e-mail sem confirmação, o convite não serve');

select pg_temp.entrar('N5');
select is(
  pg_temp.resultado($$insert into public.membership_applications (organization_name, legal_name, cnpj, requested_kind)
    values ('Loja N5', 'Loja N5 Ltda', '19500000000774', 'both')$$),
  'linhas: 1',
  'PD09: com convite, o pedido como fornecedora e compradora entra');
-- O gatilho sozinho: como postgres, com as claims do administrador.
reset role;
select pg_temp.entrar('X');
select throws_ok(
  $$update public.membership_applications set supplier_invitation_id = null
    where applicant_profile_id = pg_temp.id('N5')$$,
  '42501', 'os dados enviados no pedido não mudam',
  'PD13 (gatilho): o convite do pedido não muda (R-I1.11-12)');
set local role authenticated;

select pg_temp.entrar('X');
select is(
  pg_temp.resultado($$update public.membership_applications set status = 'rejected', decision_reason = 'Dados incompletos.'
    where applicant_profile_id = pg_temp.id('N1')$$),
  'linhas: 1',
  'PD10: o pedido de N1 é rejeitado');
select pg_temp.entrar('N1');
select throws_ok(
  $$insert into public.membership_applications (organization_name, legal_name, cnpj, requested_kind)
    values ('Loja N1', 'Loja N1 Ltda', '19500000000502', 'supplier')$$,
  'P0001', 'o pedido como fornecedora exige convite da plataforma para o seu e-mail',
  'PD10: o convite usado pelo pedido rejeitado não serve para outro pedido');
reset role;
select ok(
  (select o.kind = 'supplier' and a.supplier_invitation_id is not null
   from public.organizations o join public.membership_applications a on a.organization_id = o.id
   where o.id = pg_temp.id('S')),
  'PD11: a fornecedora aprovada veio de pedido com convite');

-- CK: a CHECK sozinha, com o gatilho do convite desligado só nesta transação.
alter table public.membership_applications disable trigger membership_applications_vincular_convite;
set local role authenticated;
select pg_temp.entrar('N2');
select throws_ok(
  $$insert into public.membership_applications (organization_name, legal_name, cnpj, requested_kind)
    values ('Loja N2 B', 'Loja N2 B Ltda', '19500000000855', 'supplier')$$,
  '23514', 'new row for relation "membership_applications" violates check constraint "membership_applications_convite_da_fornecedora"',
  'CK01 (CHECK): sem o gatilho, a CHECK ainda recusa o pedido de fornecedora sem convite');
reset role;
select pg_temp.entrar(null);
alter table public.membership_applications enable trigger membership_applications_vincular_convite;

-- PD12: o convite para a compradora não serve ao pedido de empresa nova (R-I1.11-01).
set local role authenticated;
select pg_temp.entrar('A1');
select throws_ok(
  $$insert into public.membership_applications (organization_name, legal_name, cnpj, requested_kind)
    values ('Loja A1 nova', 'Loja A1 nova Ltda', '19500000000855', 'supplier')$$,
  'P0001', 'o pedido como fornecedora exige convite da plataforma para o seu e-mail',
  'PD12: o convite para a compradora não libera o pedido de uma empresa nova (R-I1.11-01)');
reset role;
select is(
  (select status from public.supplier_invitations where id = pg_temp.id('convite A1')),
  'pending',
  'PD12: o convite da compradora continua pendente');
select pg_temp.entrar(null);

-- AC: a compradora passa a fornecer pelo aceite -----------------------------------------

set local role authenticated;
select pg_temp.entrar('AM');
select is(
  pg_temp.resultado($$update public.supplier_invitations set status = 'used' where id = pg_temp.id('convite A1')$$),
  'linhas: 0',
  'AC01: o membro comum não aceita o convite de outro e-mail');
select pg_temp.entrar('N2');
select is(
  pg_temp.resultado($$update public.supplier_invitations set status = 'used' where id = pg_temp.id('convite A1')$$),
  'linhas: 0',
  'AC02: nem quem é de fora');
select pg_temp.entrar('X');
select throws_ok(
  $$update public.supplier_invitations set status = 'used' where id = pg_temp.id('convite A1')$$,
  '42501', 'só o administrador da empresa convidado aceita o convite',
  'AC03: o administrador da plataforma não aceita no lugar da empresa');
select pg_temp.entrar('XA');
select throws_ok(
  $$update public.supplier_invitations set status = 'used' where id = pg_temp.id('convite A2')$$,
  '42501', 'só o administrador da empresa convidado aceita o convite',
  'AC03b: nem quem administra a plataforma e a empresa aceita o convite de outro e-mail');
select pg_temp.entrar('A1');
select is(
  pg_temp.resultado($$update public.organization_members set role = 'member' where id = pg_temp.id('C/A2')$$),
  'linhas: 1',
  'AC04: A2 deixa de ser administrador da empresa');
select pg_temp.entrar('A2');
select throws_ok(
  $$update public.supplier_invitations set status = 'used' where id = pg_temp.id('convite A2')$$,
  '42501', 'só o administrador da empresa convidado aceita o convite',
  'AC04: quem deixou de ser administrador da empresa não aceita o convite do próprio e-mail');
reset role;

alter table public.supplier_invitations disable trigger supplier_invitations_proteger;
update public.supplier_invitations set expires_at = now() - interval '1 day' where id = pg_temp.id('convite A1');
alter table public.supplier_invitations enable trigger supplier_invitations_proteger;
set local role authenticated;
select pg_temp.entrar('A1');
select throws_ok(
  $$update public.supplier_invitations set status = 'used' where id = pg_temp.id('convite A1')$$,
  'P0001', 'o convite venceu; peça um novo à plataforma',
  'AC05: convite vencido não é aceito');
reset role;
alter table public.supplier_invitations disable trigger supplier_invitations_proteger;
update public.supplier_invitations set expires_at = now() + interval '14 days' where id = pg_temp.id('convite A1');
alter table public.supplier_invitations enable trigger supplier_invitations_proteger;

set local role authenticated;
select pg_temp.entrar('A1');
select is(
  pg_temp.resultado($$update public.supplier_invitations set status = 'used' where id = pg_temp.id('convite A1')$$),
  'linhas: 1',
  'AC06: o administrador da compradora aceita (contraste de AC01 a AC05)');
reset role;
select is(
  (select o.kind || '/' || c.status || '/' || (c.used_by = pg_temp.id('A1'))::text
   from public.organizations o join public.supplier_invitations c on c.organization_id = o.id
   where c.id = pg_temp.id('convite A1')),
  'both/used/true',
  'AC06: a empresa passa a both, e o convite fica usado por quem aceitou');
select ok(
  exists (select 1 from public.audit_logs l
          where l.entity_type = 'organizations' and l.entity_id = pg_temp.id('C')
            and l.actor_profile_id = pg_temp.id('A1') and l.metadata -> 'campos' ? 'kind'),
  'AC06: a mudança de tipo fica na auditoria, com quem aceitou');
set local role authenticated;
select pg_temp.entrar('A1');
select throws_ok(
  $$update public.supplier_invitations set status = 'revoked' where id = pg_temp.id('convite A1')$$,
  'P0001', 'convite usado ou revogado não muda',
  'AC07: convite aceito não muda');
select pg_temp.entrar('XA');
select throws_ok(
  $$update public.supplier_invitations set status = 'used' where id = pg_temp.id('convite XA')$$,
  'P0001', 'o convite vale só para compradora ativa',
  'AC12: a compradora que já passou a fornecer não aceita outro convite');
select pg_temp.entrar('D2');
select is(
  pg_temp.resultado($$update public.organization_members set status = 'suspended' where id = pg_temp.id('D/D1')$$),
  'linhas: 1',
  'AC10: D2 suspende o vínculo de D1');
select pg_temp.entrar('D1');
select throws_ok(
  $$update public.supplier_invitations set status = 'used' where id = pg_temp.id('convite D1')$$,
  '42501', 'só o administrador da empresa convidado aceita o convite',
  'AC10: com o vínculo suspenso, o administrador da empresa não aceita (R-I1.11-05)');
select pg_temp.entrar('X');
select pg_temp.api('{"x-audit-reason": "suspensao de teste"}');
select is(
  pg_temp.resultado($$update public.organizations set status = 'suspended' where id = pg_temp.id('E')$$),
  'linhas: 1',
  'AC11: o administrador suspende a compradora E');
select pg_temp.api(null);
select pg_temp.entrar('E1');
select throws_ok(
  $$update public.supplier_invitations set status = 'used' where id = pg_temp.id('convite E1')$$,
  '42501', 'só o administrador da empresa convidado aceita o convite',
  'AC11: com a empresa suspensa, o administrador dela não aceita (R-I1.11-05)');

select pg_temp.entrar('X');
select is(
  pg_temp.resultado($$insert into public.supplier_invitations (email) values ('n2-195@repasse-teste.invalid')$$),
  'linhas: 1',
  'AC08: convite de empresa nova para N2');
reset role;
select pg_temp.guardar_convite('convite N2', 'N2');
set local role authenticated;
select pg_temp.entrar('N2');
select is(
  pg_temp.resultado($$update public.supplier_invitations set status = 'used' where id = pg_temp.id('convite N2')$$),
  'linhas: 0',
  'AC08: o convite de empresa nova não se aceita por alteração');
select pg_temp.entrar('X');
select throws_ok(
  $$update public.supplier_invitations set status = 'used' where id = pg_temp.id('convite N2')$$,
  'P0001', 'o convite para empresa nova é usado pelo pedido de adesão',
  'AC09: nem pelo administrador da plataforma');

-- TP: o tipo da empresa ----------------------------------------------------------------

select throws_ok(
  $$update public.organizations set kind = 'both' where id = pg_temp.id('B')$$,
  'P0001', 'a compradora passa a fornecer só pelo aceite do convite de fornecedora',
  'TP01: o administrador não abre o lado fornecedor da compradora sem convite');
select throws_ok(
  $$update public.organizations set kind = 'supplier' where id = pg_temp.id('B')$$,
  'P0001', 'a compradora passa a fornecer só pelo aceite do convite de fornecedora',
  'TP02: nem trocando para fornecedora');
select is(
  pg_temp.resultado($$update public.organizations set kind = 'both' where id = pg_temp.id('S')$$),
  'linhas: 1',
  'TP03: a fornecedora passa a comprar também, como antes (contraste de TP01)');

-- RV: revogação ------------------------------------------------------------------------

reset role;
select ok(
  (select revoked_by = pg_temp.id('X') and revoked_at is not null and used_at is null
   from public.supplier_invitations where id = pg_temp.id('convite N4')),
  'RV01: a revogação grava quem revogou e quando');
-- O gatilho sozinho: como postgres, com as claims do administrador.
select throws_ok(
  $$update public.supplier_invitations set email = 'outro-195@repasse-teste.invalid' where id = pg_temp.id('convite NU')$$,
  '42501', 'os dados do convite não mudam',
  'RV06 (gatilho): os dados do convite não mudam (R-I1.11-05)');
set local role authenticated;
select pg_temp.entrar('O');
select is(
  pg_temp.resultado($$update public.supplier_invitations set status = 'revoked' where id = pg_temp.id('convite NU')$$),
  'linhas: 0',
  'RV02: o operador não revoga');
select pg_temp.entrar('X');
select throws_ok(
  $$update public.supplier_invitations set status = 'pending' where id = pg_temp.id('convite N4')$$,
  'P0001', 'convite usado ou revogado não muda',
  'RV03: convite revogado não volta');
select throws_ok(
  $$update public.supplier_invitations set email = 'outro-195@repasse-teste.invalid' where id = pg_temp.id('convite NU')$$,
  '42501', 'permission denied for table supplier_invitations',
  'RV04: o e-mail do convite não muda (privilégio por coluna)');
select throws_ok(
  $$delete from public.supplier_invitations where id = pg_temp.id('convite NU')$$,
  '42501', 'permission denied for table supplier_invitations',
  'RV05: convite não se apaga');

-- VA: validade configurada --------------------------------------------------------------

reset role;
select pg_temp.entrar(null);
update public.platform_settings set value = '0' where key = 'supplier_invitation_validity_days';
set local role authenticated;
select pg_temp.entrar('X');
select throws_ok(
  $$insert into public.supplier_invitations (email) values ('b1-195@repasse-teste.invalid')$$,
  'P0001', 'a validade do convite de fornecedora não está configurada',
  'VA01: sem validade configurada, o convite não nasce');
reset role;
select pg_temp.entrar(null);
update public.platform_settings set value = '14' where key = 'supplier_invitation_validity_days';

-- AU: auditoria --------------------------------------------------------------------------

select ok(
  exists (select 1 from public.audit_logs l
          where l.action = 'supplier_invitations.insert' and l.entity_id = pg_temp.id('convite N1')
            and l.actor_profile_id = pg_temp.id('X')),
  'AU01: o convite fica na auditoria, com quem convidou');
select ok(
  exists (select 1 from public.audit_logs l
          where l.action = 'supplier_invitations.update' and l.entity_id = pg_temp.id('convite N4')
            and l.metadata -> 'status' ->> 'para' = 'revoked'),
  'AU02: a revogação também');

set local role authenticated;
select pg_temp.entrar('N4');
select is(
  (select count(*)::int from public.supplier_invitations),
  1,
  'LE06: N4 lê o próprio convite revogado (contraste)');
select pg_temp.entrar('X');
select pg_temp.api('{"x-audit-reason": "suspensao de teste"}');
select is(
  pg_temp.resultado($$update public.profiles set status = 'suspended' where id = pg_temp.id('N4')$$),
  'linhas: 1',
  'LE06: o administrador suspende N4');
select pg_temp.api(null);
select pg_temp.entrar('N4');
select is(
  (select count(*)::int from public.supplier_invitations),
  0,
  'LE06: com o perfil suspenso, nem o próprio convite (R-I1.11-05)');

reset role;
select pg_temp.entrar(null);

select * from finish();
rollback;
