-- I2.3: versões, histórico e registros só de inclusão da oferta (ADR-0003
-- §2.6 a §2.8 e §2.11 a §2.13; testes 11 e 12 da §7.4: CT11.1 a CT11.7 e
-- CT12.1 a CT12.9).
--
-- Os gatilhos de versão são adiados; o arquivo os torna imediatos para cada
-- comando gravar a própria versão, e volta a adiá-los só no caso que confere
-- uma versão por transação. As asserções do snapshot e do hash rodam como
-- postgres, porque as funções do private não são executáveis por usuário.
begin;
select plan(82);
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
  values ($2, lower($1) || '-320@repasse-teste.invalid', now(),
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

select pg_temp.usuario('X', '32000000-0000-4000-8000-000000000001');
select pg_temp.usuario('O', '32000000-0000-4000-8000-000000000002');
select pg_temp.usuario('F1', '32000000-0000-4000-8000-000000000003');
select pg_temp.usuario('F2', '32000000-0000-4000-8000-000000000004');
select pg_temp.usuario('FS', '32000000-0000-4000-8000-000000000005');
select pg_temp.usuario('G1', '32000000-0000-4000-8000-000000000006');
select pg_temp.usuario('C1', '32000000-0000-4000-8000-000000000007');
select pg_temp.usuario('A1', '32000000-0000-4000-8000-000000000008');
select pg_temp.admin('X');
select pg_temp.conceder('O', 'operator', 'X');
select pg_temp.empresa('F', 'F1', 'X', '32000001000122', 'supplier');
select pg_temp.empresa('G', 'G1', 'X', '32000002000177', 'supplier');
select pg_temp.empresa('C', 'C1', 'X', '32000003000111', 'buyer');
select pg_temp.empresa('A', 'A1', 'X', '32000004000166', 'both');
select pg_temp.vincular('F', 'F2', 'member', 'F1');
select pg_temp.vincular('F', 'FS', 'member', 'F1');
-- FS suspenso pelo org_admin, por SQL direto (sem request.headers).
select pg_temp.entrar('F1');
update public.organization_members set status = 'suspended' where id = pg_temp.id('F/FS');
select pg_temp.entrar(null);

select pg_temp.oferta('N', 'F', 'F2', false);
select pg_temp.oferta('R', 'F', 'F1');
select pg_temp.oferta('P', 'F', 'F1');
select pg_temp.oferta('K', 'F', 'F1');
select pg_temp.publicar('P', 'F1', 'O');
select pg_temp.publicar('K', 'F1', 'O');
select pg_temp.documento('DR', 'R', 'F2');
select pg_temp.foto('FR', 'R', 'F2');
-- V: oferta só com a marca do veículo, sem preço nem condições.
select pg_temp.entrar('F2');
insert into pg_temp.fixture select 'V', public.criar_oferta(pg_temp.id('F'), '{"make": "Fiat"}'::jsonb, '{}'::jsonb);
select pg_temp.entrar(null);
-- K suspensa pelo operador.
select pg_temp.entrar('O');
select pg_temp.api('{"x-audit-reason": "Indício de fraude em teste."}');
update public.offers set status = 'suspended', suspended_category = 'fraud_indication' where id = pg_temp.id('K');
select pg_temp.api(null);
select pg_temp.entrar(null);

-- B13: a versão 1 e o snapshot (ADR-0003 §2.6) -------------------------------------------

select is((select current_version from public.offers where id = pg_temp.id('N')), 1,
  'B13: a oferta nasce na versão 1');
select is(
  (select change_summary || '/' || (created_by = pg_temp.id('F2'))::text
     from public.offer_versions where offer_id = pg_temp.id('N') and version_number = 1),
  'versão inicial/true',
  'B13: a versão 1 é a inicial, com quem cadastrou como autor');
select ok(
  (select snapshot_hash = private.hash_do_snapshot(material_snapshot) and material_snapshot ->> 'version_number' = '1'
     from public.offer_versions where offer_id = pg_temp.id('N') and version_number = 1),
  'o hash gravado é o do snapshot, que leva o número da versão');
select is(
  (select array_agg(k order by k) from public.offer_versions v, jsonb_object_keys(v.material_snapshot -> 'fields') k
    where v.offer_id = pg_temp.id('N') and v.version_number = 1),
  array['asking_price', 'commercial_conditions', 'make', 'manufacture_year', 'mileage_km', 'model', 'model_year', 'version'],
  'Q4: os campos do snapshot são os materiais da configuração, com a identidade do veículo');
select ok(
  (select material_snapshot::text not like '%ABC1D23%' and material_snapshot::text not like '%12345678900%'
          and material_snapshot::text not like '%9BWZZZ377VT004251%'
     from public.offer_versions where offer_id = pg_temp.id('N') and version_number = 1),
  '§7.2: placa, RENAVAM e chassi nunca entram no snapshot');
select is(
  (select count(*)::int from public.offer_versions v, jsonb_each(v.material_snapshot -> 'categories') e
    where v.offer_id = pg_temp.id('N') and v.version_number = 1
      and e.value = '{"declaration": null, "state": "not_checked"}'::jsonb),
  10,
  'as dez categorias entram no snapshot, sem declaração e como não consultadas');
select is(
  (select material_snapshot -> 'notices' from public.offer_versions where offer_id = pg_temp.id('N') and version_number = 1),
  '["categoria_nao_consultada.v1"]'::jsonb,
  'as ressalvas exibidas entram como códigos com a versão do texto');

set local role authenticated;
select pg_temp.entrar('F2');
insert into public.supplier_declarations (offer_id, category, declared_value, detail)
values (pg_temp.id('N'), 'auction', 'has_occurrence', 'Leilão em 2022.');
select is((select current_version from public.offers where id = pg_temp.id('N')), 2,
  'B13: declarar cria versão nova');
select is(
  (select change_summary from public.offer_versions where offer_id = pg_temp.id('N') and version_number = 2),
  'categories.auction, notices',
  'change_summary lista o que mudou');
insert into public.supplier_declarations (offer_id, category, declared_value, detail)
values (pg_temp.id('N'), 'auction', 'has_occurrence', 'Leilão em 2022.');
select is((select current_version from public.offers where id = pg_temp.id('N')), 2,
  'repetir a mesma declaração não cria versão');
select is(
  (select count(*)::int from public.supplier_declarations where offer_id = pg_temp.id('N') and category = 'auction'),
  2,
  'teste 11: a declaração repetida é linha nova, e a anterior continua (§5.3)');
insert into public.supplier_declarations (offer_id, category, declared_value, detail)
values (pg_temp.id('N'), 'auction', 'has_occurrence', 'Leilão em 2022, com laudo.');
select is((select current_version from public.offers where id = pg_temp.id('N')), 3,
  'mudar o detalhe da declaração cria versão nova');
select is((select count(*)::int from public.offer_versions where offer_id = pg_temp.id('N')), 3,
  'a empresa dona lê as versões');

-- Teste 12, contraste: o org_admin muda o preço da publicada --------------------------

select pg_temp.entrar('F1');
select lives_ok(
  $$select public.atualizar_oferta(pg_temp.id('P'), '{}', '{"asking_price": "47000.00"}')$$,
  'CT12 contraste: o org_admin altera o preço da publicada');
select is(
  (select v.change_summary from public.offer_versions v
     join public.offers o on o.id = v.offer_id and v.version_number = o.current_version
    where o.id = pg_temp.id('P')),
  'fields.asking_price',
  'CT12: o preço novo gera versão nova');
select is(
  (select v.material_snapshot -> 'fields' ->> 'asking_price' from public.offer_versions v
     join public.offers o on o.id = v.offer_id and v.version_number = o.current_version - 1
    where o.id = pg_temp.id('P')),
  '45000.00',
  'CT12: a versão anterior continua com o preço antigo');
select is(
  (select old_value::text || '>' || new_value::text || '/' || (changed_by = pg_temp.id('F1'))::text
     from public.field_history
    where entity_type = 'offers' and entity_id = pg_temp.id('P') and field = 'asking_price'),
  '45000.00>47000.00/true',
  'CT12: field_history com valor anterior, novo e autor');
select is(
  pg_temp.resultado($$update public.offers set asking_price = 48000 where id = pg_temp.id('P')$$),
  'linhas: 1',
  'CT12.6: a mudança direta pela API com o token do dono é aceita');
select is(
  (select count(*)::int from public.field_history
    where entity_type = 'offers' and entity_id = pg_temp.id('P') and field = 'asking_price'),
  2,
  'CT12.6: com histórico');
select is(
  (select v.material_snapshot -> 'fields' ->> 'asking_price' from public.offer_versions v
     join public.offers o on o.id = v.offer_id and v.version_number = o.current_version
    where o.id = pg_temp.id('P')),
  '48000.00',
  'CT12.6: e com versão nova, como pela operação');
set constraints all deferred;
select public.atualizar_oferta(pg_temp.id('P'), '{"mileage_km": 46000}', '{"asking_price": "49000.00"}');
set constraints all immediate;
select is(
  (select v.change_summary from public.offer_versions v
     join public.offers o on o.id = v.offer_id and v.version_number = o.current_version
    where o.id = pg_temp.id('P')),
  'fields.asking_price, fields.mileage_km',
  'B13: preço e quilometragem na mesma transação geram uma versão só');

-- Q4: identidade do veículo -------------------------------------------------------------

select lives_ok(
  $$select public.atualizar_oferta(pg_temp.id('P'), '{"make": "Fiat", "model": "Uno"}')$$,
  'Q4: o org_admin muda marca e modelo da publicada');
select is(
  (select v.change_summary from public.offer_versions v
     join public.offers o on o.id = v.offer_id and v.version_number = o.current_version
    where o.id = pg_temp.id('P')),
  'fields.make, fields.model',
  'Q4: a identidade do veículo gera versão nova');
select throws_ok(
  $$select public.atualizar_oferta(pg_temp.id('P'), '{"plate": "XYZ9A99"}')$$,
  'P0001', 'placa, RENAVAM e chassi não mudam depois da primeira publicação',
  'X19/Q4: a placa não muda depois da publicação');
select throws_ok(
  $$select public.atualizar_oferta(pg_temp.id('P'), '{"renavam": "98765432103"}')$$,
  'P0001', 'placa, RENAVAM e chassi não mudam depois da primeira publicação',
  'X19/Q4: nem o RENAVAM');
select throws_ok(
  $$select public.atualizar_oferta(pg_temp.id('P'), '{"make": null}')$$,
  'P0001', 'a oferta publicada ou reservada precisa dos dados do veículo: make',
  'B16: a publicada não perde dado do veículo pela RPC');
select throws_ok(
  $$update public.vehicles set version = null, color = null where id = pg_temp.id('veículo P')$$,
  'P0001', 'a oferta publicada ou reservada precisa dos dados do veículo: version, color',
  'B16: nem pela API direta');
select pg_temp.entrar('F2');
select lives_ok(
  $$select public.atualizar_oferta(pg_temp.id('R'), '{"plate": "XYZ9A99"}')$$,
  'Q4: no rascunho nunca publicado, a placa muda (contraste)');
select lives_ok(
  $$select public.atualizar_oferta(pg_temp.id('R'), '{"color": null}')$$,
  'B16: no rascunho, o dado do veículo pode ficar vazio (contraste)');
select throws_ok(
  $$select public.atualizar_oferta(pg_temp.id('P'), '{"mileage_km": 47000}')$$,
  '42501', 'só o administrador da empresa altera oferta publicada ou reservada',
  'Q2: o member não muda a quilometragem da publicada');

-- Teste 12: quem não pode, e o que não passa ---------------------------------------------

select pg_temp.entrar('G1');
select is(
  pg_temp.resultado($$update public.offers set asking_price = 1 where id = pg_temp.id('P')$$),
  'linhas: 0',
  'CT12.1: fornecedor de outra empresa não altera o preço pela API');
select throws_ok(
  $$select public.atualizar_oferta(pg_temp.id('P'), '{}', '{"asking_price": "1.00"}')$$,
  '42501', 'sem permissão',
  'CT12.1: nem pela operação');
select pg_temp.entrar('C1');
select is(
  pg_temp.resultado($$update public.offers set asking_price = 1 where id = pg_temp.id('P')$$),
  'linhas: 0',
  'CT12.2: comprador não altera o preço');
select pg_temp.entrar('A1');
select is(
  pg_temp.resultado($$update public.offers set asking_price = 1 where id = pg_temp.id('P')$$),
  'linhas: 0',
  'CT12.3: empresa both que não é dona não altera o preço');
select pg_temp.entrar('FS');
select is(
  pg_temp.resultado($$update public.offers set asking_price = 1 where id = pg_temp.id('P')$$),
  'linhas: 0',
  'CT12.4: membro suspenso não altera o preço com o token antigo');
select pg_temp.entrar('F1');
select is((select asking_price from public.offers where id = pg_temp.id('P')), 49000.00::numeric,
  'CT12.1 a CT12.4: o preço continua o mesmo');
select throws_ok(
  $$update public.offers set published_at = now() where id = pg_temp.id('P')$$,
  '42501', 'permission denied for table offers',
  'CT12.5: published_at fica fora do GRANT');
select throws_ok(
  $$update public.offers set asking_price = 50000, current_version = 1 where id = pg_temp.id('P')$$,
  '42501', 'permission denied for table offers',
  'CT12.5: o preço junto com current_version é recusado inteiro');
select throws_ok(
  $$select public.atualizar_oferta(pg_temp.id('P'), '{}', '{"asking_price": "50000.00", "status": "draft"}')$$,
  '22023', 'campo não permitido na alteração da oferta',
  'CT12.5: a operação recusa campo a mais');
select throws_ok(
  $$update public.offers set asking_price = 0 where id = pg_temp.id('P')$$,
  '23514', 'new row for relation "offers" violates check constraint "offers_asking_price_check"',
  'CT12.7: preço zero');
select throws_ok(
  $$update public.offers set asking_price = -1 where id = pg_temp.id('P')$$,
  '23514', 'new row for relation "offers" violates check constraint "offers_asking_price_check"',
  'CT12.7: preço negativo');
select throws_ok(
  $$select public.atualizar_oferta(pg_temp.id('P'), '{}', '{"asking_price": "abc"}')$$,
  '22P02', 'invalid input syntax for type numeric: "abc"',
  'CT12.7: preço não numérico');
select throws_ok(
  $$select public.atualizar_oferta(pg_temp.id('P'), '{}', '{"asking_price": "100.005"}')$$,
  '22023', 'o preço tem no máximo duas casas decimais',
  'CT12.7: preço com mais de duas casas');
select throws_ok(
  $$update public.offers set asking_price = 46000 where id = pg_temp.id('K')$$,
  'P0001', 'a oferta em suspended não pode ser editada',
  'CT12.8: o preço da suspensa não muda');
select pg_temp.entrar('O');
select throws_ok(
  $$update public.offers set asking_price = 46000 where id = pg_temp.id('P')$$,
  '42501', 'a equipe da plataforma não edita o conteúdo da oferta',
  'CT12.9/Q3: o operador não altera o preço');

-- Teste 11: registros só de inclusão --------------------------------------------------------

select pg_temp.entrar('F1');
select throws_ok(
  $$update public.supplier_declarations set declared_value = 'unknown' where offer_id = pg_temp.id('R')$$,
  '42501', 'permission denied for table supplier_declarations',
  'CT11.1: o dono não altera declaração');
select throws_ok(
  $$update public.offer_versions set snapshot_hash = repeat('0', 64) where offer_id = pg_temp.id('P')$$,
  '42501', 'permission denied for table offer_versions',
  'CT11.1: nem versão');
select throws_ok(
  $$delete from public.supplier_declarations where offer_id = pg_temp.id('R')$$,
  '42501', 'permission denied for table supplier_declarations',
  'CT11.2: o dono não apaga declaração');
select throws_ok(
  $$delete from public.offers where id = pg_temp.id('R')$$,
  '42501', 'permission denied for table offers',
  'CT11.5: o dono não apaga a oferta');
select throws_ok(
  $$update public.field_history set new_value = '1' where entity_id = pg_temp.id('P')$$,
  '42501', 'permission denied for table field_history',
  'CT11.7: nem o histórico da oferta');
select pg_temp.entrar('X');
select throws_ok(
  $$update public.offer_documents set description = 'x' where offer_id = pg_temp.id('R')$$,
  '42501', 'permission denied for table offer_documents',
  'CT11.3: o administrador não altera documento');
select throws_ok(
  $$delete from public.offer_reviews where offer_id = pg_temp.id('P')$$,
  '42501', 'permission denied for table offer_reviews',
  'CT11.3: nem apaga revisão');
reset role;
select pg_temp.entrar(null);

set local role service_role;
select set_config('request.jwt.claims', '{"role": "service_role"}', true);
select throws_ok(
  $$update public.offer_versions set change_summary = 'x'$$,
  '42501', 'permission denied for table offer_versions',
  'CT11.4: service_role não altera versão');
select throws_ok(
  $$delete from public.supplier_declarations$$,
  '42501', 'permission denied for table supplier_declarations',
  'CT11.4: nem apaga declaração');
reset role;
select set_config('request.jwt.claims', '', true);

-- O gatilho recusa até o dono do banco (CT11.4 e CT11.5).
select throws_ok(
  $$update public.offer_versions set change_summary = 'x' where offer_id = pg_temp.id('P')$$,
  'P0001', 'tabela só de inclusão: UPDATE não é permitido em public.offer_versions',
  'CT11.4: versão não se altera, nem como postgres');
select throws_ok(
  $$delete from public.supplier_declarations where offer_id = pg_temp.id('R')$$,
  'P0001', 'tabela só de inclusão: DELETE não é permitido em public.supplier_declarations',
  'CT11.4: declaração não se apaga, nem como postgres');
select throws_ok(
  $$truncate public.offer_documents$$,
  'P0001', 'tabela só de inclusão: TRUNCATE não é permitido em public.offer_documents',
  'CT11.4: documento não se esvazia por TRUNCATE');
select throws_ok(
  $$update public.offer_reviews set reason = 'x' where offer_id = pg_temp.id('P')$$,
  'P0001', 'tabela só de inclusão: UPDATE não é permitido em public.offer_reviews',
  'CT11.4: revisão não se altera');
select throws_ok(
  $$delete from public.offers where id = pg_temp.id('P')$$,
  '42501', 'exclusão não é permitida em public.offers',
  'CT11.5: sem exclusão de oferta, para ninguém');
select throws_ok(
  $$delete from public.vehicles where id = pg_temp.id('veículo P')$$,
  '42501', 'exclusão não é permitida em public.vehicles',
  'CT11.5: nem de veículo');
select throws_ok(
  $$insert into public.offer_versions (offer_id, version_number, material_snapshot, snapshot_hash, change_summary)
    select offer_id, 1, material_snapshot, snapshot_hash, 'cópia' from public.offer_versions
    where offer_id = pg_temp.id('P') and version_number = 1$$,
  '23505', 'duplicate key value violates unique constraint "offer_versions_offer_id_version_number_key"',
  'CT11.6: version_number repetido na mesma oferta');
select throws_ok(
  $$insert into public.offer_versions (offer_id, version_number, material_snapshot, snapshot_hash, change_summary)
    values (pg_temp.id('P'), 99, '{"schema_version": "1"}', repeat('0', 64), 'forjada')$$,
  '23514', 'new row for relation "offer_versions" violates check constraint "offer_versions_hash_confere"',
  'o banco recusa versão com hash que não confere');

-- Declarações, documentos e fotos --------------------------------------------------------

set local role authenticated;
select pg_temp.entrar('F2');
select throws_ok(
  $$insert into public.supplier_declarations (offer_id, category, declared_value)
    values (pg_temp.id('R'), 'casualty', 'has_occurrence')$$,
  '23514', 'new row for relation "supplier_declarations" violates check constraint "supplier_declarations_detalhe_com_ocorrencia"',
  'B28: com ocorrência, o detalhe é obrigatório');
select throws_ok(
  $$insert into public.supplier_declarations (offer_id, category, declared_value)
    values (pg_temp.id('R'), 'inventada', 'unknown')$$,
  'P0001', 'categoria documental fora da configuração: inventada',
  'a categoria precisa estar na configuração');
select pg_temp.entrar('O');
select throws_ok(
  $$insert into public.supplier_declarations (offer_id, category, declared_value)
    values (pg_temp.id('R'), 'lien', 'unknown')$$,
  '42501', 'sem permissão',
  'B5: o staff não declara');
select pg_temp.entrar('F1');
select throws_ok(
  $$insert into public.offer_documents (offer_id, kind, storage_path, sha256, buyer_visibility)
    values (pg_temp.id('R'), 'crlv', 'x', repeat('c', 64), 'approved_buyers')$$,
  '42501', 'permission denied for table offer_documents',
  'X18: o fornecedor não abre o documento ao comprador (D5)');
select throws_ok(
  $$insert into public.offer_documents (offer_id, kind, storage_path, sha256)
    values (pg_temp.id('R'), 'crlv', 'outra/pasta/arquivo.pdf', repeat('c', 64))$$,
  'P0001', 'caminho do documento fora do padrão da oferta',
  'o caminho do documento segue <empresa>/<oferta>/<uuid>');
select pg_temp.entrar('F2');
select is(
  pg_temp.resultado($$update public.offer_media set display_order = 2 where id = pg_temp.id('FR')$$),
  'linhas: 1',
  'B22: o member reordena a foto do rascunho');
select is(
  pg_temp.resultado($$update public.offer_media set removed_at = '2000-01-01' where id = pg_temp.id('FR')$$),
  'linhas: 1',
  'B22: o member remove a foto');
select ok(
  (select removed_by = pg_temp.id('F2') and removed_at > now() - interval '1 minute'
     from public.offer_media where id = pg_temp.id('FR')),
  'B22: autor e data da remoção vêm do banco, e a linha continua');
select throws_ok(
  $$update public.offer_media set display_order = 3 where id = pg_temp.id('FR')$$,
  'P0001', 'foto removida não muda',
  'B22: foto removida não muda');
select throws_ok(
  $$update public.offer_media set storage_path = 'x' where id = pg_temp.id('FR')$$,
  '42501', 'permission denied for table offer_media',
  'o caminho da foto não muda');
reset role;
select pg_temp.entrar(null);

-- CHECKs: a restrição certa recusa, mesmo fora do GRANT e do gatilho ---------------------

-- Objeto no bucket para o documento do caso X18, como o Storage grava.
insert into storage.objects (bucket_id, name, owner_id)
select 'offer-documents', o.supplier_organization_id || '/' || o.id || '/00000000-0000-4000-8000-0000000000d5.pdf',
       pg_temp.id('F1')::text
from public.offers o where o.id = pg_temp.id('R');
select pg_temp.entrar('F1');
select throws_ok(
  $$insert into public.offer_documents (offer_id, kind, storage_path, sha256, buyer_visibility)
    select o.id, 'crlv', o.supplier_organization_id || '/' || o.id || '/00000000-0000-4000-8000-0000000000d5.pdf',
           repeat('c', 64), 'approved_buyers'
    from public.offers o where o.id = pg_temp.id('R')$$,
  '23514', 'new row for relation "offer_documents" violates check constraint "offer_documents_oculto_ate_d5"',
  'X18: o CHECK segura a visibilidade até a D5');
select pg_temp.entrar(null);
alter table public.offers disable trigger offers_proteger;
select throws_ok(
  $$update public.offers set published_at = null where id = pg_temp.id('P')$$,
  '23514', 'new row for relation "offers" violates check constraint "offers_publicada_com_data"',
  'CHECK por estado: publicada sem data');
select throws_ok(
  $$update public.offers set status = 'under_review', publication_authorized_by = pg_temp.id('F2'),
    publication_authorized_at = now() where id = pg_temp.id('V')$$,
  '23514', 'new row for relation "offers" violates check constraint "offers_enviada_completa"',
  'CHECK por estado: oferta sem preço e condições não fica em revisão');
select throws_ok(
  $$update public.offers set status = 'suspended' where id = pg_temp.id('R')$$,
  '23514', 'new row for relation "offers" violates check constraint "offers_suspensa_com_motivo"',
  'CHECK por estado: suspensa sem motivo');
alter table public.offers enable trigger offers_proteger;

-- Auditoria e histórico (ADR-0003 §2.8) ------------------------------------------------------

select ok(
  exists (
    select 1 from public.audit_logs
    where entity_type = 'offers' and entity_id = pg_temp.id('P') and action = 'offers.update'
      and metadata -> 'campos' ? 'asking_price' and actor_profile_id = pg_temp.id('F1')),
  'auditoria da mudança de preço, com o autor');
select is(
  (select count(*)::int from public.audit_logs
    where entity_type = 'offer_versions' and actor_organization_id = pg_temp.id('F')
      and entity_id in (select id from public.offer_versions where offer_id = pg_temp.id('P'))),
  (select count(*)::int from public.offer_versions where offer_id = pg_temp.id('P')),
  'cada versão tem auditoria, com a empresa dona');
select is(
  (select count(*)::int from public.field_history where entity_type = 'offers' and field = 'current_version'),
  0,
  'current_version não entra no histórico; a versão tem registro próprio');
select is(
  (select count(*)::int from public.field_history
    where entity_type = 'vehicles' and entity_id = pg_temp.id('veículo P') and field in ('make', 'model', 'mileage_km')),
  3,
  '§5.6: os dados do veículo têm histórico');
select ok(
  not exists (
    select 1 from public.audit_logs
    where entity_type = 'vehicles' and (metadata::text like '%ABC1D23%' or metadata::text like '%XYZ9A99%')),
  'a auditoria não leva a placa');

-- CT12.4: empresa suspensa -----------------------------------------------------------------

select pg_temp.entrar('X');
update public.organizations set status = 'suspended' where id = pg_temp.id('F');
set local role authenticated;
select pg_temp.entrar('F1');
select is(
  pg_temp.resultado($$update public.offers set asking_price = 50000 where id = pg_temp.id('P')$$),
  'linhas: 0',
  'CT12.4: com a empresa suspensa, o org_admin não altera o preço');
reset role;
select pg_temp.entrar(null);

select * from finish();
rollback;
