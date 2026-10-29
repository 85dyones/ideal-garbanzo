-- I2.3: isolamento das ofertas entre empresas (ADR-0003 §2.14; teste 2 da
-- §7.4, parte de ofertas e documentos: CT2.7 a CT2.15).
--
-- No Inc. 2, ninguém de fora da empresa dona lê oferta, nem a publicada: o
-- catálogo chega no Inc. 4. Os objetos no Storage (teste 6) ficam para a I2.4.
begin;
select plan(32);
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
  values ($2, lower($1) || '-330@repasse-teste.invalid', now(),
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

-- Documento e foto da oferta, na sessão de quem envia, no caminho
-- <empresa>/<oferta>/<uuid>. O objeto no Storage é conferido a partir da I2.4.
create function pg_temp.documento(nome text, oferta text, quem text) returns void
language plpgsql
as $f$
declare
  novo uuid;
begin
  perform pg_temp.entrar(quem);
  insert into public.offer_documents (offer_id, kind, storage_path, sha256)
  select o.id, 'crlv', o.supplier_organization_id || '/' || o.id || '/' || gen_random_uuid() || '.pdf', repeat('b', 64)
  from public.offers o where o.id = pg_temp.id(oferta)
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
begin
  perform pg_temp.entrar(quem);
  insert into public.offer_media (offer_id, storage_path, display_order)
  select o.id, o.supplier_organization_id || '/' || o.id || '/' || gen_random_uuid() || '.jpg', 1
  from public.offers o where o.id = pg_temp.id(oferta)
  returning id into novo;
  insert into pg_temp.fixture values (nome, novo);
  perform pg_temp.entrar(null);
end;
$f$;

-- Fixture ----------------------------------------------------------------------------

select pg_temp.usuario('X', '33000000-0000-4000-8000-000000000001');
select pg_temp.usuario('O', '33000000-0000-4000-8000-000000000002');
select pg_temp.usuario('F1', '33000000-0000-4000-8000-000000000003');
select pg_temp.usuario('F2', '33000000-0000-4000-8000-000000000004');
select pg_temp.usuario('FS', '33000000-0000-4000-8000-000000000005');
select pg_temp.usuario('G1', '33000000-0000-4000-8000-000000000006');
select pg_temp.usuario('C1', '33000000-0000-4000-8000-000000000007');
select pg_temp.usuario('A1', '33000000-0000-4000-8000-000000000008');
select pg_temp.admin('X');
select pg_temp.conceder('O', 'operator', 'X');
select pg_temp.empresa('F', 'F1', 'X', '33000001000195', 'supplier');
select pg_temp.empresa('G', 'G1', 'X', '33000002000130', 'supplier');
select pg_temp.empresa('C', 'C1', 'X', '33000003000184', 'buyer');
select pg_temp.empresa('A', 'A1', 'X', '33000004000129', 'both');
select pg_temp.vincular('F', 'F2', 'member', 'F1');
select pg_temp.vincular('F', 'FS', 'member', 'F1');

select pg_temp.oferta('R', 'F', 'F1');
select pg_temp.oferta('P', 'F', 'F1');
select pg_temp.oferta('S', 'G', 'G1');
select pg_temp.publicar('P', 'F1', 'O');
select pg_temp.documento('DR', 'R', 'F2');
select pg_temp.foto('FR', 'R', 'F2');
select pg_temp.documento('DP', 'P', 'F1');
select pg_temp.foto('FP', 'P', 'F1');
-- Preço alterado na publicada, para haver histórico.
select pg_temp.entrar('F1');
select public.atualizar_oferta(pg_temp.id('P'), '{}', '{"asking_price": "47000.00"}');
-- FS suspenso pelo org_admin, por SQL direto (sem request.headers).
update public.organization_members set status = 'suspended' where id = pg_temp.id('F/FS');
select pg_temp.entrar(null);

-- CT2.7 a CT2.12: fornecedor de outra empresa ----------------------------------------------

set local role authenticated;
select pg_temp.entrar('G1');
select is((select count(*)::int from public.offers where id = pg_temp.id('R')), 0,
  'CT2.7: fornecedor de outra empresa não lê o rascunho pelo id');
select is((select count(*)::int from public.offers where supplier_organization_id = pg_temp.id('F')), 0,
  'CT2.7: nem na listagem');
select is((select count(*)::int from public.vehicles where id = pg_temp.id('veículo R')), 0,
  'CT2.8: nem o veículo, com placa, RENAVAM e chassi');
select is((select count(*)::int from public.offer_versions where offer_id = pg_temp.id('R')), 0,
  'CT2.9: nem as versões');
select is((select count(*)::int from public.supplier_declarations where offer_id = pg_temp.id('R')), 0,
  'CT2.9: nem as declarações');
select is((select count(*)::int from public.offer_media where offer_id = pg_temp.id('R')), 0,
  'CT2.9: nem as fotos');
select is((select count(*)::int from public.offer_documents where offer_id = pg_temp.id('R')), 0,
  'CT2.9: nem os documentos');
select is((select count(*)::int from public.offer_reviews where offer_id = pg_temp.id('P')), 0,
  'CT2.9: nem as revisões');
select is(
  (select count(*)::int from public.field_history
    where entity_id in (pg_temp.id('P'), pg_temp.id('veículo P'))),
  0,
  'CT2.9: nem o histórico da oferta e do veículo');
select throws_ok(
  $$select public.pendencias_de_publicacao(pg_temp.id('R'))$$,
  '42501', 'sem permissão',
  'CT2.10: a operação responde "sem permissão" para a oferta alheia');
select throws_ok(
  $$select public.pendencias_de_publicacao(gen_random_uuid())$$,
  '42501', 'sem permissão',
  'CT2.10: e a mesma resposta para id inexistente');
select throws_ok(
  $$insert into public.supplier_declarations (offer_id, category, declared_value)
    values (pg_temp.id('R'), 'lien', 'unknown')$$,
  '42501', 'sem permissão',
  'CT2.11: não declara na oferta alheia');
select throws_ok(
  $$insert into public.supplier_declarations (offer_id, category, declared_value)
    values (gen_random_uuid(), 'lien', 'unknown')$$,
  '42501', 'sem permissão',
  'CT2.11: e a resposta não revela se a oferta existe');
select throws_ok(
  $$select public.criar_oferta(pg_temp.id('F'), '{"make": "Fiat"}', '{}')$$,
  '42501', 'só membro ativo da empresa fornecedora cadastra veículo',
  'CT2.11: não cria oferta em nome de outra empresa');
select throws_ok(
  $$insert into public.offer_media (offer_id, storage_path) values (pg_temp.id('R'), 'x/y/z.jpg')$$,
  '42501', 'sem permissão',
  'CT2.11: não envia foto para a oferta alheia');
select throws_ok(
  $$insert into public.offer_documents (offer_id, kind, storage_path, sha256)
    values (pg_temp.id('R'), 'crlv', 'x/y/z.pdf', repeat('d', 64))$$,
  '42501', 'sem permissão',
  'CT2.11: nem documento');
select is(
  (select count(*)::int from public.offers where id = pg_temp.id('P'))
  + (select count(*)::int from public.offer_documents where id = pg_temp.id('DP')),
  0,
  'CT2.12: fornecedor puro não lê a oferta publicada nem o documento dela');
select is((select count(*)::int from public.offers where id = pg_temp.id('S')), 1,
  'contraste: o fornecedor lê a própria oferta');

-- CT2.13 a CT2.15 -------------------------------------------------------------------------------

select pg_temp.entrar('A1');
select is(
  (select count(*)::int from public.offers where id in (pg_temp.id('R'), pg_temp.id('P')))
  + (select count(*)::int from public.offer_documents where id = pg_temp.id('DP')),
  0,
  'CT2.13: empresa both que não é dona não lê rascunho, publicada nem documento no Inc. 2');
select pg_temp.entrar('C1');
select is(
  (select count(*)::int from public.offer_documents where id = pg_temp.id('DP'))
  + (select count(*)::int from public.offers where id = pg_temp.id('P')),
  0,
  'CT2.14: comprador não lê o documento oculto nem a oferta antes do catálogo (Inc. 4)');
select pg_temp.entrar('FS');
select is((select count(*)::int from public.offers where id = pg_temp.id('R')), 0,
  'CT2.15: membro suspenso não lê o rascunho com o token antigo');

-- Contrastes ------------------------------------------------------------------------------------

select pg_temp.entrar('F2');
select is((select count(*)::int from public.offers where id in (pg_temp.id('R'), pg_temp.id('P'))), 2,
  'contraste: o member lê as ofertas da empresa');
select ok(
  exists (select 1 from public.offer_versions where offer_id = pg_temp.id('R'))
  and exists (select 1 from public.supplier_declarations where offer_id = pg_temp.id('R'))
  and exists (select 1 from public.offer_media where offer_id = pg_temp.id('R'))
  and exists (select 1 from public.offer_documents where offer_id = pg_temp.id('R'))
  and exists (select 1 from public.offer_reviews where offer_id = pg_temp.id('P')),
  'contraste: e os registros ligados a elas');
select is((select plate from public.vehicles where id = pg_temp.id('veículo R')), 'ABC1D23',
  'contraste: a empresa dona lê a placa (campo restrito)');
select is(
  (select count(*)::int from public.field_history
    where entity_type = 'offers' and entity_id = pg_temp.id('P') and field = 'asking_price'),
  1,
  'a empresa dona lê o histórico da própria oferta (ADR-0003 §2.14)');
select pg_temp.entrar('F1');
select is(public.pendencias_de_publicacao(pg_temp.id('R')), '{}'::text[],
  'a empresa dona vê o que falta para publicar (nada, na oferta completa)');
select pg_temp.entrar('O');
select is(
  (select count(*)::int from public.offers where id in (pg_temp.id('R'), pg_temp.id('P'), pg_temp.id('S'))),
  3,
  'contraste: o operador lê as ofertas de todas as empresas');
select is((select count(*)::int from public.offer_documents where id = pg_temp.id('DR')), 1,
  'o operador lê a linha do documento (§3.3)');
select is(
  (select count(*)::int from public.field_history where entity_type = 'offers' and entity_id = pg_temp.id('P')),
  0,
  'A18: sem can_read_audit, o operador não lê o histórico');
select pg_temp.entrar('X');
select cmp_ok(
  (select count(*)::int from public.field_history where entity_type = 'offers' and entity_id = pg_temp.id('P')),
  '>=', 1,
  'o administrador lê o histórico');
reset role;
select pg_temp.entrar(null);

-- Anônimo ------------------------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select throws_ok(
  $$select 1 from public.offers$$,
  '42501', 'permission denied for table offers',
  'anônimo não lê oferta');
select throws_ok(
  $$select public.criar_oferta(gen_random_uuid(), '{}', '{}')$$,
  '42501', 'permission denied for function criar_oferta',
  'anônimo não cria oferta');
reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
