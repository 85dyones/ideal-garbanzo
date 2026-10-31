-- I2.11: ressalvas ACH-I2.10-01 e ACH-I2.10-02 da revisão do Inc. 2 (ADR-0003
-- §2.9 e §8).
--
-- ACH-01: a publicada ou reservada com a validade vencida, antes da rodada da
-- expiração, já se comporta como expirada: nem conteúdo, validade,
-- disponibilidade, reserva ou liberação; seguem a retirada, a suspensão e a
-- expiração. A validade vencida é simulada com o gatilho desligado, dentro da
-- transação, como no 310. ACH-02: as funções do private com id de oferta
-- conferem quem chama pela regra de offers_leitura.
begin;
select plan(44);
set constraints all immediate;

-- Apoio do arquivo (objetos temporários, desfeitos no rollback) -------------------

create temporary table fixture (nome text primary key, id uuid not null);
grant select on pg_temp.fixture to authenticated, anon, service_role;

create function pg_temp.id(nome text) returns uuid
language sql stable
as $f$ select f.id from pg_temp.fixture f where f.nome = $1 $f$;

-- Sessão do usuário como o PostgREST a monta: só as claims do JWT.
create function pg_temp.entrar(usuario text) returns void
language sql
as $f$
  select set_config('request.jwt.claims',
    case when $1 is null then '' else json_build_object('sub', pg_temp.id($1), 'role', 'authenticated')::text end,
    true);
$f$;

-- Cabeçalhos da requisição, como o PostgREST os expõe (request.headers).
create function pg_temp.api(cabecalhos jsonb) returns void
language sql
as $f$ select set_config('request.headers', coalesce($1::text, ''), true); $f$;

-- Executa o comando e devolve 'linhas: N' ou 'erro <código>: <mensagem>'.
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

create function pg_temp.usuario(nome text, id uuid) returns void
language sql
as $f$
  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data, aud, role)
  values ($2, lower($1) || '-380@repasse-teste.invalid', now(),
          json_build_object('full_name', $1)::jsonb, 'authenticated', 'authenticated');
  insert into pg_temp.fixture values ($1, $2);
$f$;

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

create function pg_temp.conceder(nome text, papel text, quem_concede text) returns void
language plpgsql
as $f$
begin
  perform pg_temp.entrar(quem_concede);
  insert into public.platform_staff (profile_id, role) values (pg_temp.id(nome), papel);
  perform pg_temp.entrar(null);
end;
$f$;

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
  perform pg_temp.entrar(null);
end;
$f$;

create function pg_temp.vincular(empresa text, perfil text, papel text, quem_convida text)
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
  perform pg_temp.entrar(perfil);
  update public.organization_members set status = 'active' where id = novo;
  insert into pg_temp.fixture values (empresa || '/' || perfil, novo);
  perform pg_temp.entrar(null);
end;
$f$;

-- Oferta completa pela RPC criar_oferta, na sessão de quem cadastra. Com
-- declarar, uma declaração por categoria: apontamento em auction, "sem
-- ocorrência conhecida" em lien e "desconhece" nas demais.
create function pg_temp.oferta(nome text, empresa text, quem text, declarar boolean default true) returns void
language plpgsql
as $f$
declare
  novo uuid;
  categoria text;
begin
  perform pg_temp.entrar(quem);
  novo := public.criar_oferta(pg_temp.id(empresa),
    jsonb_build_object('make', 'Volkswagen', 'model', 'Gol', 'version', '1.0 MPI', 'manufacture_year', 2020,
      'model_year', 2021, 'mileage_km', 45000, 'fuel_type', 'flex', 'transmission', 'manual', 'color', 'prata',
      'body_type', 'hatch', 'plate', 'ABC1D23', 'renavam', '12345678900', 'chassis', '9BWZZZ377VT004251'),
    jsonb_build_object('asking_price', '45000.00', 'commercial_conditions', 'À vista, retirada no pátio.',
      'location_city', 'Campinas', 'location_state', 'SP', 'valid_until', (now() + interval '10 days')::text));
  insert into pg_temp.fixture values (nome, novo);
  insert into pg_temp.fixture select 'veículo ' || nome, o.vehicle_id from public.offers o where o.id = novo;
  if declarar then
    for categoria in
      select jsonb_array_elements_text(s.value) from public.platform_settings s where s.key = 'document_categories'
    loop
      insert into public.supplier_declarations (offer_id, category, declared_value, detail)
      values (novo, categoria,
        case categoria when 'auction' then 'has_occurrence' when 'lien' then 'no_known_occurrence' else 'unknown' end,
        case when categoria = 'auction' then 'Passagem por leilão em 2023, declarada pelo fornecedor.' end);
    end loop;
  end if;
  perform pg_temp.entrar(null);
end;
$f$;

-- Envio à revisão pelo org_admin, com a autorização de divulgação.
create function pg_temp.enviar(nome text, quem text) returns void
language plpgsql
as $f$
begin
  perform pg_temp.entrar(quem);
  update public.offers set status = 'under_review', publication_authorized_by = pg_temp.id(quem)
  where id = pg_temp.id(nome);
  perform pg_temp.entrar(null);
end;
$f$;

-- Envio e publicação pela plataforma (revisão exigida).
create function pg_temp.publicar(nome text, quem_envia text, quem_publica text) returns void
language plpgsql
as $f$
begin
  perform pg_temp.enviar(nome, quem_envia);
  perform pg_temp.entrar(quem_publica);
  update public.offers set status = 'published' where id = pg_temp.id(nome);
  perform pg_temp.entrar(null);
end;
$f$;

-- Documento e foto da oferta: o objeto entra no bucket como postgres, com o
-- dono informado, como o Storage grava; a linha entra na sessão de quem envia,
-- no caminho <empresa>/<oferta>/<uuid> (ADR-0003 §2.13).
create function pg_temp.documento(nome text, oferta text, quem text) returns void
language plpgsql
as $f$
declare
  novo uuid;
  caminho text;
begin
  perform pg_temp.entrar(null);
  select o.supplier_organization_id || '/' || o.id || '/' || gen_random_uuid() || '.pdf' into caminho
  from public.offers o where o.id = pg_temp.id(oferta);
  insert into storage.objects (bucket_id, name, owner_id) values ('offer-documents', caminho, pg_temp.id(quem)::text);
  perform pg_temp.entrar(quem);
  insert into public.offer_documents (offer_id, kind, storage_path, sha256)
  values (pg_temp.id(oferta), 'crlv', caminho, repeat('b', 64))
  returning id into novo;
  insert into pg_temp.fixture values (nome, novo);
  perform pg_temp.entrar(null);
end;
$f$;

create function pg_temp.foto(nome text, oferta text, quem text) returns void
language plpgsql
as $f$
declare
  novo uuid;
  caminho text;
begin
  perform pg_temp.entrar(null);
  select o.supplier_organization_id || '/' || o.id || '/' || gen_random_uuid() || '.jpg' into caminho
  from public.offers o where o.id = pg_temp.id(oferta);
  insert into storage.objects (bucket_id, name, owner_id) values ('offer-photos', caminho, pg_temp.id(quem)::text);
  perform pg_temp.entrar(quem);
  insert into public.offer_media (offer_id, storage_path, display_order)
  values (pg_temp.id(oferta), caminho, 1)
  returning id into novo;
  insert into pg_temp.fixture values (nome, novo);
  perform pg_temp.entrar(null);
end;
$f$;
-- Fixture ----------------------------------------------------------------------------

select pg_temp.usuario('X', '38000000-0000-4000-8000-000000000001');
select pg_temp.usuario('O', '38000000-0000-4000-8000-000000000002');
select pg_temp.usuario('F1', '38000000-0000-4000-8000-000000000003');
select pg_temp.usuario('F2', '38000000-0000-4000-8000-000000000004');
select pg_temp.usuario('G1', '38000000-0000-4000-8000-000000000005');
select pg_temp.usuario('C1', '38000000-0000-4000-8000-000000000006');
select pg_temp.admin('X');
select pg_temp.conceder('O', 'operator', 'X');
select pg_temp.empresa('F', 'F1', 'X', '38000001000109', 'supplier');
select pg_temp.empresa('G', 'G1', 'X', '38000002000153', 'supplier');
select pg_temp.empresa('C', 'C1', 'X', '38000003000106', 'buyer');
select pg_temp.vincular('F', 'F2', 'member', 'F1');

-- R: rascunho completo. V e RV: publicada e reservada que vão vencer. PE:
-- publicada dentro da validade (contraste).
select pg_temp.oferta('R', 'F', 'F1');
select pg_temp.oferta('V', 'F', 'F1');
select pg_temp.oferta('RV', 'F', 'F1');
select pg_temp.oferta('PE', 'F', 'F1');
select pg_temp.publicar('V', 'F1', 'O');
select pg_temp.publicar('RV', 'F1', 'O');
select pg_temp.publicar('PE', 'F1', 'O');
select pg_temp.foto('FV', 'V', 'F1');
select pg_temp.entrar('F1');
update public.offers set status = 'reserved' where id = pg_temp.id('RV');
select pg_temp.entrar(null);

-- Validade vencida simulada só nesta transação, com o gatilho desligado,
-- antes da rodada da expiração; o rascunho também fica com a validade no
-- passado.
alter table public.offers disable trigger offers_proteger;
update public.offers set valid_until = now() - interval '1 minute'
where id in (pg_temp.id('V'), pg_temp.id('RV'), pg_temp.id('R'));
alter table public.offers enable trigger offers_proteger;

-- Objetos no bucket para as linhas de foto e documento da vencida e do contraste.
create temporary table caminhos (nome text primary key, caminho text not null);
grant select on pg_temp.caminhos to authenticated, anon;
insert into pg_temp.caminhos
select n.nome, o.supplier_organization_id || '/' || o.id || '/' || n.arquivo
from (values ('foto V', 'V', '00000000-0000-4000-8000-0000000000a1.jpg'),
             ('documento V', 'V', '00000000-0000-4000-8000-0000000000a2.pdf'),
             ('foto PE', 'PE', '00000000-0000-4000-8000-0000000000a3.jpg')) as n(nome, oferta, arquivo)
join public.offers o on o.id = pg_temp.id(n.oferta);
insert into storage.objects (bucket_id, name, owner_id)
select case when nome like 'documento%' then 'offer-documents' else 'offer-photos' end, caminho, pg_temp.id('F1')::text
from pg_temp.caminhos;

-- ACH-I2.10-01: publicada ou reservada vencida, antes do job -----------------------

select is(
  private.oferta_aberta(pg_temp.id('V')),
  false,
  'ACH-01: a publicada vencida já está fora do catálogo antes da rodada');
set local role authenticated;
select pg_temp.entrar('F1');
select throws_ok(
  $$update public.offers set asking_price = 46000 where id = pg_temp.id('V')$$,
  'P0001', 'a oferta em expired não pode ser editada',
  'ACH-01: vencida, o org_admin não altera o preço');
select throws_ok(
  $$update public.offers set valid_until = now() + interval '5 days' where id = pg_temp.id('V')$$,
  'P0001', 'a oferta em expired não pode ser editada',
  'ACH-01: nem estende a validade (a oferta voltaria ao catálogo sem a T13 nem a revisão)');
select throws_ok(
  $$update public.offers set valid_until = now() + interval '5 days' where id = pg_temp.id('RV')$$,
  'P0001', 'a oferta em expired não pode ser editada',
  'ACH-01: nem na reservada vencida');
select throws_ok(
  $$update public.vehicles set mileage_km = 46000
    where id = (select o.vehicle_id from public.offers o where o.id = pg_temp.id('V'))$$,
  'P0001', 'a oferta em expired não pode ser editada',
  'ACH-01: nem o veículo');
select throws_ok(
  $$insert into public.supplier_declarations (offer_id, category, declared_value)
    values (pg_temp.id('V'), 'auction', 'unknown')$$,
  'P0001', 'a oferta em expired não pode ser editada',
  'ACH-01: nem declara');
select throws_ok(
  $$update public.offer_media set removed_at = now() where id = pg_temp.id('FV')$$,
  'P0001', 'a oferta em expired não pode ser editada',
  'ACH-01: nem remove foto');
select throws_ok(
  $$insert into public.offer_media (offer_id, storage_path, display_order)
    select pg_temp.id('V'), caminho, 2 from pg_temp.caminhos where nome = 'foto V'$$,
  'P0001', 'a oferta em expired não pode ser editada',
  'ACH-01: nem registra foto nova');
select throws_ok(
  $$insert into public.offer_documents (offer_id, kind, storage_path, sha256)
    select pg_temp.id('V'), 'crlv', caminho, repeat('c', 64) from pg_temp.caminhos where nome = 'documento V'$$,
  'P0001', 'a oferta em expired não pode ser editada',
  'ACH-01: nem registra documento');
select ok(
  not private.pode_enviar_arquivo_da_oferta(
    pg_temp.id('F') || '/' || pg_temp.id('V') || '/00000000-0000-4000-8000-0000000000b1.jpg', 'jpg|jpeg|png|webp'),
  'ACH-01: a política do Storage recusa arquivo novo na vencida');
select throws_ok(
  $$update public.offers set status = 'reserved' where id = pg_temp.id('V')$$,
  'P0001', 'a validade da oferta venceu: ela não pode ser reservada nem liberada',
  'ACH-01: o org_admin não reserva a vencida (T08)');
select throws_ok(
  $$update public.offers set status = 'published' where id = pg_temp.id('RV')$$,
  'P0001', 'a validade da oferta venceu: ela não pode ser reservada nem liberada',
  'ACH-01: nem libera a reserva vencida (T09)');
select pg_temp.entrar('F2');
select throws_ok(
  $$update public.offers set availability_confirmed_at = now() where id = pg_temp.id('V')$$,
  'P0001', 'a validade da oferta venceu: a disponibilidade não se confirma',
  'ACH-01: o member não confirma a disponibilidade da vencida (T16)');
select pg_temp.entrar('O');
select throws_ok(
  $$update public.offers set status = 'reserved' where id = pg_temp.id('V')$$,
  'P0001', 'a validade da oferta venceu: ela não pode ser reservada nem liberada',
  'ACH-01: nem a plataforma reserva a vencida');
select pg_temp.api('{"x-audit-reason": "Documento com indício de adulteração."}');
select is(
  pg_temp.resultado($$update public.offers set status = 'suspended', suspended_category = 'forgery'
    where id = pg_temp.id('RV')$$),
  'linhas: 1',
  'ACH-01: a plataforma ainda suspende a vencida (T14)');
select pg_temp.api(null);
select pg_temp.entrar('F1');
select is(
  pg_temp.resultado($$update public.offers set status = 'withdrawn' where id = pg_temp.id('V')$$),
  'linhas: 1',
  'ACH-01: o org_admin ainda retira a vencida (T11)');

-- Contraste: dentro da validade, e o rascunho com a validade no passado ------------------

select is(
  pg_temp.resultado($$update public.offers set asking_price = 46000 where id = pg_temp.id('PE')$$),
  'linhas: 1',
  'contraste ACH-01: dentro da validade, o org_admin altera o preço');
select is(
  pg_temp.resultado($$update public.offers set valid_until = now() + interval '5 days' where id = pg_temp.id('PE')$$),
  'linhas: 1',
  'contraste ACH-01: e estende a validade');
select is(
  pg_temp.resultado($$insert into public.offer_media (offer_id, storage_path, display_order)
    select pg_temp.id('PE'), caminho, 2 from pg_temp.caminhos where nome = 'foto PE'$$),
  'linhas: 1',
  'contraste ACH-01: e registra foto nova');
select ok(
  private.pode_enviar_arquivo_da_oferta(
    pg_temp.id('F') || '/' || pg_temp.id('PE') || '/00000000-0000-4000-8000-0000000000b2.jpg', 'jpg|jpeg|png|webp'),
  'contraste ACH-01: a política do Storage aceita arquivo novo dentro da validade');
select is(
  pg_temp.resultado($$update public.offers set status = 'reserved' where id = pg_temp.id('PE')$$),
  'linhas: 1',
  'contraste ACH-01: e reserva');
select is(
  pg_temp.resultado($$update public.offers set status = 'published' where id = pg_temp.id('PE')$$),
  'linhas: 1',
  'contraste ACH-01: e libera');
select pg_temp.entrar('F2');
select is(
  pg_temp.resultado($$update public.offers set availability_confirmed_at = now() where id = pg_temp.id('PE')$$),
  'linhas: 1',
  'contraste ACH-01: o member confirma a disponibilidade dentro da validade');
select is(
  pg_temp.resultado($$update public.offers set asking_price = 47000 where id = pg_temp.id('R')$$),
  'linhas: 1',
  'contraste ACH-01: o rascunho com a validade no passado continua editável (§2.4)');

-- ACH-I2.10-02: funções do private conferem quem chama ------------------------------

select pg_temp.entrar('G1');
select throws_ok(
  $$select private.pendencias_de_publicacao(pg_temp.id('R'))$$,
  '42501', 'sem permissão',
  'ACH-02: fornecedor de outra empresa não lê as pendências pela função do private');
select throws_ok(
  $$select count(*) from private.estados_documentais_da_oferta(pg_temp.id('R'))$$,
  '42501', 'sem permissão',
  'ACH-02: nem o detalhe das declarações');
select throws_ok(
  $$select private.pendencias_de_publicacao('00000000-0000-4000-8000-0000000000ff')$$,
  '42501', 'sem permissão',
  'ACH-02: oferta inexistente dá a mesma resposta');
select pg_temp.entrar('C1');
select throws_ok(
  $$select count(*) from private.estados_documentais_da_oferta(pg_temp.id('PE'))$$,
  '42501', 'sem permissão',
  'ACH-02: comprador não lê os estados da publicada pelo private antes do catálogo (Inc. 4)');
select pg_temp.entrar('F2');
select is(
  private.pendencias_de_publicacao(pg_temp.id('PE')),
  '{}'::text[],
  'contraste ACH-02: o member da empresa dona lê as pendências');
select pg_temp.entrar('O');
select is(
  (select count(*)::integer from private.estados_documentais_da_oferta(pg_temp.id('R'))),
  10,
  'contraste ACH-02: a plataforma lê os estados');
select pg_temp.entrar(null);
reset role;
select is(
  (select count(*)::integer from private.estados_documentais_da_oferta(pg_temp.id('R'))),
  10,
  'contraste ACH-02: sem usuário, na sessão de manutenção, a função responde');

-- ACH-04: outra empresa não cadastra oferta com o veículo da empresa dona -------------
-- A política offers_cadastro e o gatilho têm o mesmo predicado; com só a
-- política afrouxada, o gatilho recusa antes. Este caso é o que cai quando os
-- dois são afrouxados.

select pg_temp.entrar('F1');
with novos as (
  insert into public.vehicles (organization_id, make, model)
  values (pg_temp.id('F'), 'Fiat', 'Uno'), (pg_temp.id('F'), 'Fiat', 'Mobi')
  returning id, model)
insert into pg_temp.fixture select 'veículo ' || model, id from novos;
set local role authenticated;
select pg_temp.entrar('G1');
select throws_ok(
  $$insert into public.offers (vehicle_id, supplier_organization_id)
    values (pg_temp.id('veículo Uno'), pg_temp.id('F'))$$,
  '42501', 'só membro ativo da empresa fornecedora cadastra oferta',
  'ACH-04/CT2.11: outra empresa não cadastra oferta na empresa dona pela API direta, nem com o veículo dela');
select pg_temp.entrar('F1');
select is(
  pg_temp.resultado($$insert into public.offers (vehicle_id, supplier_organization_id)
    values (pg_temp.id('veículo Mobi'), pg_temp.id('F'))$$),
  'linhas: 1',
  'contraste ACH-04: o fornecedor cadastra a oferta com o próprio veículo pela API direta');
select pg_temp.entrar(null);
reset role;

-- ACH-04, camada da política sozinha: os gatilhos de proteção ficam desligados só
-- durante estas asserções, dentro desta transação (exceção do README: isolar uma
-- camada). Nas de inclusão, outra empresa; nas de alteração, o staff, que lê a
-- linha pela política de leitura, mas não é da empresa dona.
alter table public.vehicles disable trigger vehicles_proteger;
alter table public.offers disable trigger offers_proteger;
alter table public.supplier_declarations disable trigger supplier_declarations_proteger;
alter table public.offer_media disable trigger offer_media_proteger;
alter table public.offer_documents disable trigger offer_documents_proteger;
set local role authenticated;
select pg_temp.entrar('G1');
select throws_ok(
  $$insert into public.vehicles (organization_id, make, model) values (pg_temp.id('F'), 'Fiat', 'Palio')$$,
  '42501', 'new row violates row-level security policy for table "vehicles"',
  'ACH-04 (política): vehicles_cadastro recusa veículo em nome de outra empresa');
select throws_ok(
  $$insert into public.offers (vehicle_id, supplier_organization_id)
    values (pg_temp.id('veículo Uno'), pg_temp.id('F'))$$,
  '42501', 'new row violates row-level security policy for table "offers"',
  'ACH-04 (política): offers_cadastro recusa oferta em nome de outra empresa');
select throws_ok(
  $$insert into public.supplier_declarations (offer_id, category, declared_value)
    values (pg_temp.id('PE'), 'auction', 'unknown')$$,
  '42501', 'new row violates row-level security policy for table "supplier_declarations"',
  'ACH-04 (política): supplier_declarations_inclusao recusa declaração na oferta alheia');
select throws_ok(
  $$insert into public.offer_media (offer_id, storage_path, display_order)
    values (pg_temp.id('PE'), pg_temp.id('F') || '/' || pg_temp.id('PE') || '/00000000-0000-4000-8000-0000000000c1.jpg', 3)$$,
  '42501', 'new row violates row-level security policy for table "offer_media"',
  'ACH-04 (política): offer_media_inclusao recusa foto na oferta alheia');
select throws_ok(
  $$insert into public.offer_documents (offer_id, kind, storage_path, sha256)
    values (pg_temp.id('PE'), 'crlv', pg_temp.id('F') || '/' || pg_temp.id('PE') || '/00000000-0000-4000-8000-0000000000c2.pdf', repeat('d', 64))$$,
  '42501', 'new row violates row-level security policy for table "offer_documents"',
  'ACH-04 (política): offer_documents_inclusao recusa documento na oferta alheia');
select pg_temp.entrar('O');
select is(
  pg_temp.resultado($$update public.vehicles set mileage_km = 1
    where id = (select o.vehicle_id from public.offers o where o.id = pg_temp.id('PE'))$$),
  'linhas: 0',
  'ACH-04 (política): vehicles_alteracao não deixa o staff alterar o veículo');
select is(
  pg_temp.resultado($$update public.offer_media set display_order = 7 where id = pg_temp.id('FV')$$),
  'linhas: 0',
  'ACH-04 (política): offer_media_alteracao não deixa o staff alterar a foto');
select pg_temp.entrar('F1');
select is(
  pg_temp.resultado($$update public.vehicles set mileage_km = 45001
    where id = (select o.vehicle_id from public.offers o where o.id = pg_temp.id('PE'))$$),
  'linhas: 1',
  'contraste ACH-04 (política): a empresa dona altera o veículo');
select is(
  pg_temp.resultado($$update public.offer_media set display_order = 7 where id = pg_temp.id('FV')$$),
  'linhas: 1',
  'contraste ACH-04 (política): e a foto');
select pg_temp.entrar(null);
reset role;
alter table public.vehicles enable trigger vehicles_proteger;
alter table public.offers enable trigger offers_proteger;
alter table public.supplier_declarations enable trigger supplier_declarations_proteger;
alter table public.offer_media enable trigger offer_media_proteger;
alter table public.offer_documents enable trigger offer_documents_proteger;

-- Depois da rodada: expirada, e só então reaberta (T12 e T13) ---------------------------

-- V foi retirada acima; volta a publicada vencida só nesta transação.
alter table public.offers disable trigger offers_proteger;
update public.offers set status = 'published', withdrawn_by = null, withdrawn_at = null, withdrawn_reason = null
where id = pg_temp.id('V');
alter table public.offers enable trigger offers_proteger;
select cmp_ok(private.expirar_ofertas(), '>=', 1, 'T12: a rotina expira a publicada vencida');
set local role authenticated;
select pg_temp.entrar('F1');
select is(
  pg_temp.resultado($$update public.offers set status = 'draft' where id = pg_temp.id('V')$$),
  'linhas: 1',
  'ACH-01: expirada, o org_admin reabre como rascunho (T13)');
select pg_temp.entrar(null);
reset role;

select * from finish();
rollback;
