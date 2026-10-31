-- I2.7: versionamento por coluna da oferta (ADR-0003 §2.6, §2.8, §2.9, §2.11,
-- §2.13 e §2.16; anexo A.4; B13 e Q4).
--
-- Para cada coluna editável de offers e vehicles, e para declaração, foto e
-- documento: mudança em campo material (lista material_fields da
-- configuração) cria exatamente uma versão nova, com o change_summary certo;
-- mudança em campo não material não cria versão, mas gera field_history
-- quando a coluna é de offers ou vehicles. Cada caso mede o efeito do próprio
-- comando (versões e linhas de histórico antes e depois), então um caso que
-- falha não desloca os seguintes.
--
-- Os gatilhos de versão são adiados; o arquivo os torna imediatos para cada
-- comando gravar a própria versão, e volta a adiá-los só no caso que confere
-- uma versão por transação, como o 320.
begin;
select plan(32);
set constraints all immediate;

-- Apoio do arquivo (objetos temporários, desfeitos no rollback) -------------------

create temporary table fixture (nome text primary key, id uuid not null);
grant select on pg_temp.fixture to authenticated, anon, service_role;

-- Número de versões gravadas antes do caso da transação com várias mudanças.
create temporary table marca (oferta text primary key, versoes bigint not null);

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

-- Versões gravadas, versão vigente, change_summary da vigente e linhas de
-- field_history da coluna (tabela offers ou vehicles; nula para declaração,
-- foto e documento). Lê como o dono das tabelas (security definer), para a
-- contagem não depender de quem age: o operador não lê o field_history.
create function pg_temp.contagens(oferta text, tabela text, coluna text,
  out versoes bigint, out vigente integer, out resumo text, out historico bigint)
language sql
stable
security definer
as $f$
  select
    (select count(*) from public.offer_versions v where v.offer_id = o.id),
    o.current_version,
    (select v.change_summary from public.offer_versions v
      where v.offer_id = o.id and v.version_number = o.current_version),
    (select count(*) from public.field_history h
      where h.entity_type = $2 and h.field = $3
        and h.entity_id = case $2 when 'vehicles' then o.vehicle_id else o.id end)
  from public.offers o
  where o.id = pg_temp.id($1);
$f$;

-- Executa o comando na sessão atual e descreve o efeito na oferta:
-- 'versão +N (<change_summary da vigente>), histórico +M', sem o parêntese
-- quando N = 0. Comando que não afeta uma linha, ou que falha, vira texto.
create function pg_temp.efeito(comando text, oferta text, tabela text default null, coluna text default null)
returns text
language plpgsql
as $f$
declare
  antes record;
  depois record;
  n bigint;
begin
  select * into antes from pg_temp.contagens(oferta, tabela, coluna);
  execute comando;
  get diagnostics n = row_count;
  if n <> 1 then
    return 'linhas: ' || n;
  end if;
  select * into depois from pg_temp.contagens(oferta, tabela, coluna);
  if depois.vigente <> depois.versoes then
    return 'current_version ' || depois.vigente || ' com ' || depois.versoes || ' versões';
  end if;
  return 'versão +' || (depois.versoes - antes.versoes)
    || case when depois.versoes > antes.versoes then ' (' || depois.resumo || ')' else '' end
    || ', histórico +' || (depois.historico - antes.historico);
exception when others then
  return 'erro ' || sqlstate || ': ' || sqlerrm;
end;
$f$;

create function pg_temp.marcar(oferta text) returns void
language sql
security definer
as $f$
  insert into pg_temp.marca
  select $1, c.versoes from pg_temp.contagens($1, null, null) c
  on conflict (oferta) do update set versoes = excluded.versoes;
$f$;

-- Versões novas desde a marca, com o change_summary da vigente.
create function pg_temp.desde_a_marca(oferta text) returns text
language sql
stable
security definer
as $f$
  select 'versão +' || (c.versoes - m.versoes)
    || case when c.versoes > m.versoes then ' (' || c.resumo || ')' else '' end
  from pg_temp.contagens($1, null, null) c
  join pg_temp.marca m on m.oferta = $1;
$f$;

grant execute on function pg_temp.id(text), pg_temp.entrar(text), pg_temp.api(jsonb),
  pg_temp.contagens(text, text, text), pg_temp.efeito(text, text, text, text),
  pg_temp.marcar(text), pg_temp.desde_a_marca(text)
  to authenticated, anon, service_role;

create function pg_temp.usuario(nome text, id uuid) returns void
language sql
as $f$
  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data, aud, role)
  values ($2, lower($1) || '-370@repasse-teste.invalid', now(),
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

select pg_temp.usuario('X', '37000000-0000-4000-8000-000000000001');
select pg_temp.usuario('O', '37000000-0000-4000-8000-000000000002');
select pg_temp.usuario('F1', '37000000-0000-4000-8000-000000000003');
select pg_temp.usuario('F2', '37000000-0000-4000-8000-000000000004');
select pg_temp.admin('X');
select pg_temp.conceder('O', 'operator', 'X');
select pg_temp.empresa('F', 'F1', 'X', '37000001000146', 'supplier');
select pg_temp.vincular('F', 'F2', 'member', 'F1');

-- R: rascunho nunca publicado. P: publicada pela revisão.
select pg_temp.oferta('R', 'F', 'F1');
select pg_temp.oferta('P', 'F', 'F1');
select pg_temp.publicar('P', 'F1', 'O');

-- §2.16: a lista que decide o que é material ----------------------------------------------

select is(
  (select value from public.platform_settings where key = 'material_fields'),
  '["asking_price", "mileage_km", "documental_states", "findings", "transfer_impediments",
    "supplier_declarations", "commercial_conditions", "make", "model", "version", "manufacture_year",
    "model_year"]'::jsonb,
  '§2.16: material_fields é a lista da §6.7 mais a identidade do veículo (Q4)');

-- Rascunho (B13: versão a cada mudança material, inclusive no rascunho) ----------------

set local role authenticated;
select pg_temp.entrar('F2');
select is(
  pg_temp.efeito($$update public.offers set asking_price = 46000 where id = pg_temp.id('R')$$,
    'R', 'offers', 'asking_price'),
  'versão +1 (fields.asking_price), histórico +1',
  'B13: o preço no rascunho cria versão e histórico');
select is(
  pg_temp.efeito($$insert into public.supplier_declarations (offer_id, category, declared_value, detail)
    values (pg_temp.id('R'), 'lien', 'has_occurrence', 'Alienação fiduciária em nome de banco.')$$, 'R'),
  'versão +1 (categories.lien, notices), histórico +0',
  'B13: declaração que muda o estado da categoria cria versão, com as ressalvas exibidas');
select is(
  pg_temp.efeito($$update public.vehicles set plate = 'XYZ9A99' where id = pg_temp.id('veículo R')$$,
    'R', 'vehicles', 'plate'),
  'versão +0, histórico +1',
  'Q4: a placa no rascunho não é material; só histórico');
select is(
  pg_temp.efeito($$update public.vehicles set renavam = '98765432103' where id = pg_temp.id('veículo R')$$,
    'R', 'vehicles', 'renavam'),
  'versão +0, histórico +1',
  'Q4: o RENAVAM no rascunho não é material; só histórico');
select is(
  pg_temp.efeito($$update public.vehicles set chassis = '9BWZZZ377VT004252' where id = pg_temp.id('veículo R')$$,
    'R', 'vehicles', 'chassis'),
  'versão +0, histórico +1',
  'Q4: o chassi no rascunho não é material; só histórico');

-- Publicada: campos materiais (fields do snapshot) ------------------------------------------

select pg_temp.entrar('F1');
select is(
  pg_temp.efeito($$update public.offers set asking_price = 46000 where id = pg_temp.id('P')$$,
    'P', 'offers', 'asking_price'),
  'versão +1 (fields.asking_price), histórico +1',
  'preço: material, uma versão e histórico');
select is(
  pg_temp.efeito($$update public.offers set commercial_conditions = 'Financiamento aceito, retirada no pátio.'
    where id = pg_temp.id('P')$$, 'P', 'offers', 'commercial_conditions'),
  'versão +1 (fields.commercial_conditions), histórico +1',
  'condições comerciais: material, uma versão e histórico');
select is(
  pg_temp.efeito($$update public.vehicles set make = 'Fiat' where id = pg_temp.id('veículo P')$$,
    'P', 'vehicles', 'make'),
  'versão +1 (fields.make), histórico +1',
  'Q4: marca é material');
select is(
  pg_temp.efeito($$update public.vehicles set model = 'Uno' where id = pg_temp.id('veículo P')$$,
    'P', 'vehicles', 'model'),
  'versão +1 (fields.model), histórico +1',
  'Q4: modelo é material');
select is(
  pg_temp.efeito($$update public.vehicles set version = '1.0 Fire' where id = pg_temp.id('veículo P')$$,
    'P', 'vehicles', 'version'),
  'versão +1 (fields.version), histórico +1',
  'Q4: versão do veículo é material');
select is(
  pg_temp.efeito($$update public.vehicles set manufacture_year = 2021 where id = pg_temp.id('veículo P')$$,
    'P', 'vehicles', 'manufacture_year'),
  'versão +1 (fields.manufacture_year), histórico +1',
  'Q4: ano de fabricação é material');
select is(
  pg_temp.efeito($$update public.vehicles set model_year = 2022 where id = pg_temp.id('veículo P')$$,
    'P', 'vehicles', 'model_year'),
  'versão +1 (fields.model_year), histórico +1',
  'Q4: ano do modelo é material');
select is(
  pg_temp.efeito($$update public.vehicles set mileage_km = 46000 where id = pg_temp.id('veículo P')$$,
    'P', 'vehicles', 'mileage_km'),
  'versão +1 (fields.mileage_km), histórico +1',
  'quilometragem: material, uma versão e histórico');
select is(
  pg_temp.efeito($$insert into public.supplier_declarations (offer_id, category, declared_value)
    values (pg_temp.id('P'), 'casualty', 'no_known_occurrence')$$, 'P'),
  'versão +1 (categories.casualty), histórico +0',
  'declaração: material, uma versão; a tabela é só de inclusão e não tem field_history');

-- Publicada: campos não materiais (só histórico) ------------------------------------------

select is(
  pg_temp.efeito($$update public.offers set location_city = 'Jundiaí' where id = pg_temp.id('P')$$,
    'P', 'offers', 'location_city'),
  'versão +0, histórico +1',
  'A.4: cidade não é material; só histórico');
select is(
  pg_temp.efeito($$update public.offers set location_state = 'MG' where id = pg_temp.id('P')$$,
    'P', 'offers', 'location_state'),
  'versão +0, histórico +1',
  'A.4: UF não é material; só histórico');
select is(
  pg_temp.efeito($$update public.offers set valid_until = now() + interval '20 days' where id = pg_temp.id('P')$$,
    'P', 'offers', 'valid_until'),
  'versão +0, histórico +1',
  'T17: a validade estendida gera histórico, sem versão (§2.9)');
select is(
  pg_temp.efeito($$update public.vehicles set fuel_type = 'gasolina' where id = pg_temp.id('veículo P')$$,
    'P', 'vehicles', 'fuel_type'),
  'versão +0, histórico +1',
  'B14: combustível não é material; só histórico');
select is(
  pg_temp.efeito($$update public.vehicles set transmission = 'automático' where id = pg_temp.id('veículo P')$$,
    'P', 'vehicles', 'transmission'),
  'versão +0, histórico +1',
  'B14: câmbio não é material; só histórico');
select is(
  pg_temp.efeito($$update public.vehicles set color = 'preto' where id = pg_temp.id('veículo P')$$,
    'P', 'vehicles', 'color'),
  'versão +0, histórico +1',
  'B14: cor não é material; só histórico');
select is(
  pg_temp.efeito($$update public.vehicles set body_type = 'sedã' where id = pg_temp.id('veículo P')$$,
    'P', 'vehicles', 'body_type'),
  'versão +0, histórico +1',
  'B14: carroceria não é material; só histórico');
select is(
  pg_temp.efeito($$update public.offers set status = 'reserved' where id = pg_temp.id('P')$$,
    'P', 'offers', 'status'),
  'versão +0, histórico +1',
  'T08: a reserva muda o status com histórico, sem versão');
select is(
  pg_temp.efeito($$update public.offers set status = 'published' where id = pg_temp.id('P')$$,
    'P', 'offers', 'status'),
  'versão +0, histórico +1',
  'T09: a volta a publicada também, sem versão');
select pg_temp.entrar('F2');
select is(
  pg_temp.efeito($$update public.offers set availability_confirmed_at = now() where id = pg_temp.id('P')$$,
    'P', 'offers', 'availability_confirmed_at'),
  'versão +0, histórico +1',
  'T16: a confirmação de disponibilidade gera histórico, sem versão (§2.9)');

-- Fotos e documentos não são campo material (§6.7) -----------------------------------------

reset role;
select pg_temp.entrar(null);
select is(
  pg_temp.efeito($$select pg_temp.foto('FP', 'P', 'F1')$$, 'P'),
  'versão +0, histórico +0',
  'B22: foto nova não cria versão');
select is(
  pg_temp.efeito($$select pg_temp.documento('DP', 'P', 'F1')$$, 'P'),
  'versão +0, histórico +0',
  'documento novo não cria versão');
set local role authenticated;
select pg_temp.entrar('F1');
select is(
  pg_temp.efeito($$update public.offer_media set display_order = 2 where id = pg_temp.id('FP')$$, 'P'),
  'versão +0, histórico +0',
  'B22: reordenar a foto não cria versão');
select is(
  pg_temp.efeito($$update public.offer_media set removed_at = now() where id = pg_temp.id('FP')$$, 'P'),
  'versão +0, histórico +0',
  'B22: remover a foto não cria versão');

-- B13: várias mudanças materiais numa transação, em três tabelas, geram uma versão só --------

select pg_temp.marcar('P');
set constraints all deferred;
update public.offers
set asking_price = 47000, commercial_conditions = 'Financiamento aceito, entrega combinada.', location_city = 'Campinas'
where id = pg_temp.id('P');
update public.vehicles set mileage_km = 47000, make = 'Volkswagen', color = 'branco' where id = pg_temp.id('veículo P');
insert into public.supplier_declarations (offer_id, category, declared_value, detail)
values (pg_temp.id('P'), 'auction', 'has_occurrence', 'Leilão em 2023, com laudo cautelar.');
set constraints all immediate;
select is(
  pg_temp.desde_a_marca('P'),
  'versão +1 (categories.auction, fields.asking_price, fields.commercial_conditions, fields.make, fields.mileage_km)',
  'B13: preço, condições, marca, quilometragem e declaração na mesma transação geram uma versão só');

-- Transições do rascunho: status, autorização e suspensão não criam versão ------------------

select is(
  pg_temp.efeito($$update public.offers set status = 'under_review', publication_authorized_by = pg_temp.id('F1')
    where id = pg_temp.id('R')$$, 'R', 'offers', 'publication_authorized_by'),
  'versão +0, histórico +1',
  'T03: o envio grava a autorização com histórico, sem versão');
select pg_temp.entrar('O');
select pg_temp.api('{"x-audit-reason": "Risco grave apontado em teste."}');
select is(
  pg_temp.efeito($$update public.offers set status = 'suspended', suspended_category = 'serious_risk'
    where id = pg_temp.id('R')$$, 'R', 'offers', 'suspended_category'),
  'versão +0, histórico +1',
  'T14: a suspensão grava a categoria com histórico, sem versão');
select pg_temp.api(null);
reset role;
select pg_temp.entrar(null);

select * from finish();
rollback;
