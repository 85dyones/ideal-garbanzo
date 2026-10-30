-- I3.3: domínio documental (ADR-0004 §2; testes 7, 10 e 11 da §7.4).
--
-- Estado por candidatos e precedência, consulta vigente e substituição,
-- revisão aberta, divergência só pelo valor (P1), marca de teste por chave
-- composta, dado pessoal em details, impedimento automático (P3) e a oferta
-- com impedimento ativo fora do catálogo (P4). As 40 linhas da tabela de
-- decisão ficam na I3.4; aqui estão as que provam os testes 7 e 10.
begin;
select plan(71);
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
  values ($2, lower($1) || '-400@repasse-teste.invalid', now(),
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

-- Apoio do domínio documental ----------------------------------------------------------

-- Evidência da consulta: o objeto entra como postgres, com o dono informado; a
-- linha entra na sessão de quem envia.
create function pg_temp.evidencia_da_consulta(nome text, oferta text, quem text) returns void
language plpgsql
as $f$
declare
  novo uuid;
  caminho text;
begin
  perform pg_temp.entrar(null);
  select o.supplier_organization_id || '/' || o.id || '/' || gen_random_uuid() || '.pdf' into caminho
  from public.offers o where o.id = pg_temp.id(oferta);
  insert into storage.objects (bucket_id, name, owner_id) values ('check-evidence', caminho, pg_temp.id(quem)::text);
  perform pg_temp.entrar(quem);
  insert into public.check_evidence_files (offer_id, storage_path, sha256, content_type, size_bytes)
  values (pg_temp.id(oferta), caminho, repeat('e', 64), 'application/pdf', 2048)
  returning id into novo;
  insert into pg_temp.fixture values (nome, novo);
  perform pg_temp.entrar(null);
end;
$f$;

-- Consulta registrada na sessão de quem registra.
create function pg_temp.consulta(nome text, oferta text, quem text, categoria text, resultado text,
                                 substitui text default null, evidencia text default null) returns void
language plpgsql
as $f$
declare
  novo uuid;
begin
  perform pg_temp.entrar(quem);
  insert into public.vehicle_checks (offer_id, category, source_name, source_type, method, performed_at, result,
                                     result_summary, known_limitations, supersedes_check_id, evidence_document_id)
  values (pg_temp.id(oferta), categoria, 'DETRAN-SP', 'official', 'manual', now() - interval '1 hour', resultado,
          'Resumo da consulta de teste.', 'A fonte cobre só a UF consultada.',
          case when substitui is null then null else pg_temp.id(substitui) end,
          case when evidencia is null then null else pg_temp.id(evidencia) end)
  returning id into novo;
  insert into pg_temp.fixture values (nome, novo);
  perform pg_temp.entrar(null);
end;
$f$;

create function pg_temp.revisao(oferta text, categoria text, acao text, quem text) returns void
language plpgsql
as $f$
begin
  perform pg_temp.entrar(quem);
  perform pg_temp.api('{"x-audit-reason": "Divergência entre a declaração e o documento."}');
  insert into public.documental_reviews (offer_id, category, action) values (pg_temp.id(oferta), categoria, acao);
  perform pg_temp.api(null);
  perform pg_temp.entrar(null);
end;
$f$;

create function pg_temp.estado(oferta text, categoria text) returns text
language sql stable
as $f$ select private.estado_documental(pg_temp.id(oferta), categoria) $f$;

create function pg_temp.ultima_versao(oferta text) returns jsonb
language sql stable
as $f$
  select v.material_snapshot from public.offer_versions v
  where v.offer_id = pg_temp.id(oferta) order by v.version_number desc limit 1
$f$;

-- Fixture ----------------------------------------------------------------------------

select pg_temp.usuario('X', '40000000-0000-4000-8000-000000000001');
select pg_temp.usuario('O', '40000000-0000-4000-8000-000000000002');
select pg_temp.usuario('F1', '40000000-0000-4000-8000-000000000003');
select pg_temp.usuario('F2', '40000000-0000-4000-8000-000000000004');
select pg_temp.usuario('G1', '40000000-0000-4000-8000-000000000005');
select pg_temp.usuario('C1', '40000000-0000-4000-8000-000000000006');
select pg_temp.usuario('T1', '40000000-0000-4000-8000-000000000007');
select pg_temp.admin('X');
select pg_temp.conceder('O', 'operator', 'X');
select pg_temp.empresa('F', 'F1', 'X', '40000001000150', 'supplier');
select pg_temp.empresa('G', 'G1', 'X', '40000002000103', 'supplier');
select pg_temp.empresa('C', 'C1', 'X', '40000003000140', 'buyer');
select pg_temp.empresa('T', 'T1', 'X', '40000004000194', 'supplier');
select pg_temp.vincular('F', 'F2', 'member', 'F1');
-- T é empresa de teste: as ofertas dela nascem com is_test (B26).
select pg_temp.entrar('X');
update public.organizations set is_test = true where id = pg_temp.id('T');
select pg_temp.entrar(null);

-- R e S: rascunhos (S sem declaração). P e Q: publicadas. D: rascunho do
-- impedimento por declaração. PT: rascunho de teste.
select pg_temp.oferta('R', 'F', 'F1');
select pg_temp.oferta('S', 'F', 'F1', false);
select pg_temp.oferta('P', 'F', 'F1');
select pg_temp.oferta('Q', 'F', 'F1');
select pg_temp.oferta('D', 'F', 'F1');
select pg_temp.oferta('PT', 'T', 'T1');
select pg_temp.publicar('P', 'F1', 'O');
select pg_temp.publicar('Q', 'F1', 'O');
select pg_temp.evidencia_da_consulta('evidência R', 'R', 'O');
select pg_temp.evidencia_da_consulta('evidência Q', 'Q', 'X');
select pg_temp.consulta('consulta PT', 'PT', 'O', 'lien', 'no_occurrence_in_source');

-- Teste 10: no_findings_in_sources só com consulta registrada (ADR-0004 §2.1) ---------

select is(pg_temp.estado('R', 'lien'), 'declared_unverified',
  'CT10.1: sem ocorrência conhecida e sem consulta fica declarada, sem comprovação (linha 11)');
select is(pg_temp.estado('R', 'debts_ipva'), 'not_checked',
  'CT10.2: "desconhece" sem consulta fica não consultado (linha 31)');
select is(pg_temp.estado('R', 'auction'), 'with_findings',
  'linha 21: ocorrência declarada, sem consulta, fica com apontamentos');
select is(pg_temp.estado('S', 'lien'), 'not_checked',
  'CT10.3: sem declaração e sem consulta fica não consultado (linha 1)');
select is(pg_temp.estado('PT', 'lien'), 'no_findings_in_sources',
  'a consulta de teste vale na oferta de teste');

create temporary table contagem (nome text primary key, total integer not null);
insert into pg_temp.contagem select 'versões de P', count(*)::int from public.offer_versions where offer_id = pg_temp.id('P');
select pg_temp.consulta('c1', 'P', 'O', 'lien', 'no_occurrence_in_source');
select is(pg_temp.estado('P', 'lien'), 'no_findings_in_sources',
  'contraste CT10: consulta vigente sem ocorrência leva a sem apontamentos nas fontes consultadas (linha 15)');
select is(
  (select count(*)::int from public.offer_versions where offer_id = pg_temp.id('P'))
    - (select total from pg_temp.contagem where nome = 'versões de P'),
  1,
  'a consulta que muda o estado gera versão nova');
select is(
  pg_temp.ultima_versao('P') -> 'categories' -> 'lien' ->> 'state',
  'no_findings_in_sources',
  'o snapshot da versão nova tem o estado da consulta');
select is(
  pg_temp.ultima_versao('P') -> 'categories' -> 'lien' -> 'checks' -> 0 ->> 'source_name',
  'DETRAN-SP',
  'e a fonte da consulta vigente');
select is(
  pg_temp.ultima_versao('P') -> 'categories' -> 'debts_ipva' -> 'checks',
  null::jsonb,
  'categoria sem consulta não ganha a chave checks (o snapshot do Inc. 2 não muda)');
select pg_temp.consulta('c2', 'P', 'O', 'lien', 'awaiting_result', 'c1');
select is(pg_temp.estado('P', 'lien'), 'pending',
  'CT10.6: a consulta substituída deixa de contar; aguardando resultado fica pendente');
select pg_temp.consulta('c3', 'P', 'O', 'lien', 'no_occurrence_in_source', 'c2');
select is(pg_temp.estado('P', 'lien'), 'no_findings_in_sources',
  'CT10.6 (inverso): o resultado que chega substitui a consulta pendente, que deixa de contar');
select pg_temp.revisao('P', 'lien', 'open_review', 'O');
select is(pg_temp.estado('P', 'lien'), 'under_review',
  'CT10.7: com revisão aberta, a consulta sem ocorrência fica em análise (linha 16)');
select pg_temp.revisao('P', 'lien', 'close_review', 'O');
select is(pg_temp.estado('P', 'lien'), 'no_findings_in_sources',
  'CT10.7: fechada a revisão, volta a sem apontamentos nas fontes consultadas');
select pg_temp.consulta('c4', 'P', 'O', 'auction', 'no_occurrence_in_source');
select is(pg_temp.estado('P', 'auction'), 'with_findings',
  'CT10.8 (P1): ocorrência declarada com consulta sem ocorrência fica com apontamentos (linha 25)');
select pg_temp.consulta('c5', 'R', 'O', 'lien', 'has_occurrence');
select is(pg_temp.estado('R', 'lien'), 'under_review',
  'linha 17: sem ocorrência conhecida e consulta com ocorrência é divergência, em análise');
select pg_temp.consulta('c6', 'R', 'O', 'debts_ipva', 'inconclusive');
select is(pg_temp.estado('R', 'debts_ipva'), 'pending', 'linha 39: "desconhece" e consulta inconclusiva fica pendente');

-- Teste 7: consulta de teste não se liga a oferta real ---------------------------------

select is(
  (select is_test from public.vehicle_checks where id = pg_temp.id('consulta PT')),
  true,
  'CT7.4: a consulta copia a marca de teste da oferta de teste');
select pg_temp.entrar('O');
select is(
  pg_temp.resultado($$insert into public.vehicle_checks (offer_id, category, source_name, source_type, method,
      performed_at, result, result_summary, known_limitations, is_test)
    values (pg_temp.id('P'), 'debts_fines', 'DETRAN-SP', 'official', 'manual', now() - interval '1 hour',
      'awaiting_result', 'Resumo.', 'A fonte cobre só a UF consultada.', true)$$),
  'linhas: 1',
  'CT7.1: como postgres, a consulta com a marca de teste enviada entra');
select pg_temp.entrar(null);
select is(
  (select bool_or(is_test) from public.vehicle_checks where offer_id = pg_temp.id('P')),
  false,
  'CT7.1: a marca de teste enviada é trocada pela da oferta real, nem como postgres');

-- Camada da chave composta sozinha: gatilho desligado só para esta asserção.
alter table public.vehicle_checks disable trigger vehicle_checks_proteger;
select throws_ok(
  $$insert into public.vehicle_checks (offer_id, vehicle_id, category, source_name, source_type, method, performed_at,
      performed_by, recorded_by, recorded_as, result, result_summary, known_limitations, is_test)
    values (pg_temp.id('P'), pg_temp.id('veículo P'), 'lien', 'DETRAN-SP', 'official', 'manual', now(),
      pg_temp.id('O'), pg_temp.id('O'), 'platform', 'no_occurrence_in_source', 'Resumo.', 'Limitação.', true)$$,
  '23503', 'insert or update on table "vehicle_checks" violates foreign key constraint "vehicle_checks_oferta_e_teste_fkey"',
  'CT7.1 (chave composta): consulta de teste em oferta real é recusada mesmo sem o gatilho');
alter table public.vehicle_checks enable trigger vehicle_checks_proteger;

select pg_temp.entrar('O');
select throws_ok(
  $$insert into public.vehicle_checks (offer_id, category, source_name, source_type, method, performed_at, result,
      result_summary, known_limitations, supersedes_check_id)
    values (pg_temp.id('P'), 'lien', 'DETRAN-SP', 'official', 'manual', now(), 'no_occurrence_in_source',
      'Resumo.', 'Limitação.', pg_temp.id('consulta PT'))$$,
  '23503', 'insert or update on table "vehicle_checks" violates foreign key constraint "vehicle_checks_substitui_da_mesma_oferta_fkey"',
  'CT7.5: a consulta da oferta real não substitui consulta da oferta de teste');
select throws_ok(
  $$insert into public.vehicle_checks (offer_id, category, source_name, source_type, method, performed_at, result,
      result_summary, known_limitations, evidence_document_id)
    values (pg_temp.id('P'), 'lien', 'DETRAN-SP', 'official', 'manual', now(), 'no_occurrence_in_source',
      'Resumo.', 'Limitação.', pg_temp.id('evidência R'))$$,
  '23503', 'insert or update on table "vehicle_checks" violates foreign key constraint "vehicle_checks_evidencia_da_oferta_fkey"',
  'CT7.7: a evidência de outra oferta não se liga à consulta');
select pg_temp.entrar(null);

set local role authenticated;
select pg_temp.entrar('O');
select throws_ok(
  $$insert into public.vehicle_checks (offer_id, vehicle_id, category, source_name, source_type, method, performed_at,
      result, result_summary, known_limitations)
    values (pg_temp.id('P'), pg_temp.id('veículo R'), 'lien', 'DETRAN-SP', 'official', 'manual', now(),
      'no_occurrence_in_source', 'Resumo.', 'Limitação.')$$,
  '42501', 'permission denied for table vehicle_checks',
  'CT7.6: pela API, o veículo e a marca de teste não vêm do payload');

-- Registro: quem, em qual estado e com quais dados (ADR-0004 §2.9) -------------------------

select pg_temp.entrar('F2');
select is(
  pg_temp.resultado($$insert into public.vehicle_checks (offer_id, category, source_name, source_type, method,
      performed_at, result, result_summary, known_limitations)
    values (pg_temp.id('R'), 'debts_fines', 'Portal do DETRAN', 'official', 'manual', now() - interval '1 day',
      'no_occurrence_in_source', 'Sem multas na consulta.', 'A fonte cobre só a UF consultada.')$$),
  'linhas: 1',
  'o member registra consulta no rascunho');
select throws_ok(
  $$insert into public.vehicle_checks (offer_id, category, source_name, source_type, method, performed_at, result,
      result_summary, known_limitations)
    values (pg_temp.id('P'), 'debts_fines', 'Portal do DETRAN', 'official', 'manual', now(),
      'no_occurrence_in_source', 'Resumo.', 'Limitação.')$$,
  'P0001', 'a oferta em published não recebe consulta nem evidência',
  'o member não registra consulta na publicada (tabela de edição do ADR-0003)');
select pg_temp.entrar('F1');
select is(
  pg_temp.resultado($$insert into public.vehicle_checks (offer_id, category, source_name, source_type, method,
      performed_at, result, result_summary, known_limitations)
    values (pg_temp.id('P'), 'debts_fines', 'Portal do DETRAN', 'official', 'manual', now() - interval '1 day',
      'no_occurrence_in_source', 'Sem multas na consulta.', 'A fonte cobre só a UF consultada.')$$),
  'linhas: 1',
  'o org_admin registra consulta na publicada');
select is(
  (select recorded_as from public.vehicle_checks
    where offer_id = pg_temp.id('P') and category = 'debts_fines' and recorded_by = pg_temp.id('F1')),
  'supplier',
  'a consulta do fornecedor fica marcada como do fornecedor (nunca chega à origem 4)');
select throws_ok(
  $$insert into public.vehicle_checks (offer_id, category, source_name, source_type, method, performed_at, result,
      result_summary, known_limitations, supersedes_check_id)
    values (pg_temp.id('P'), 'lien', 'Portal do DETRAN', 'official', 'manual', now(), 'has_occurrence',
      'Resumo.', 'Limitação.', pg_temp.id('c3'))$$,
  '42501', 'o fornecedor não substitui consulta registrada pela plataforma',
  'E3: o fornecedor não substitui consulta da plataforma');
select pg_temp.entrar('G1');
select throws_ok(
  $$insert into public.vehicle_checks (offer_id, category, source_name, source_type, method, performed_at, result,
      result_summary, known_limitations)
    values (pg_temp.id('P'), 'lien', 'DETRAN-SP', 'official', 'manual', now(), 'no_occurrence_in_source',
      'Resumo.', 'Limitação.')$$,
  '42501', 'sem permissão',
  'CT10.10: outra empresa não registra consulta na oferta alheia');
select pg_temp.entrar('C1');
select throws_ok(
  $$insert into public.vehicle_checks (offer_id, category, source_name, source_type, method, performed_at, result,
      result_summary, known_limitations)
    values (pg_temp.id('P'), 'lien', 'DETRAN-SP', 'official', 'manual', now(), 'no_occurrence_in_source',
      'Resumo.', 'Limitação.')$$,
  '42501', 'sem permissão',
  'o comprador não registra consulta');
select pg_temp.entrar('O');
select throws_ok(
  $$insert into public.vehicle_checks (offer_id, category, source_name, source_type, method, performed_at, result,
      result_summary, known_limitations)
    values (pg_temp.id('P'), 'lien', 'DETRAN-SP', 'official', 'integration', now(), 'no_occurrence_in_source',
      'Resumo.', 'Limitação.')$$,
  'P0001', 'só o registro manual de consulta está disponível',
  'E34: integração automática só depois da C7');
select throws_ok(
  $$insert into public.vehicle_checks (offer_id, category, source_name, source_type, method, performed_at, result,
      result_summary, known_limitations)
    values (pg_temp.id('P'), 'lien', 'DETRAN-SP', 'official', 'manual', now() + interval '1 day',
      'no_occurrence_in_source', 'Resumo.', 'Limitação.')$$,
  'P0001', 'a data da consulta não pode estar no futuro',
  'E34: a data da consulta não fica no futuro');
select throws_ok(
  $$insert into public.vehicle_checks (offer_id, category, source_name, source_type, method, performed_at, result,
      result_summary, known_limitations)
    values (pg_temp.id('P'), 'categoria_inventada', 'DETRAN-SP', 'official', 'manual', now(),
      'no_occurrence_in_source', 'Resumo.', 'Limitação.')$$,
  'P0001', 'categoria documental fora da configuração: categoria_inventada',
  'E34: a categoria precisa estar na configuração');
select throws_ok(
  $$insert into public.vehicle_checks (offer_id, category, source_name, source_type, method, performed_at, result,
      result_summary)
    values (pg_temp.id('P'), 'lien', 'DETRAN-SP', 'official', 'manual', now(), 'no_occurrence_in_source', 'Resumo.')$$,
  '23502', 'null value in column "known_limitations" of relation "vehicle_checks" violates not-null constraint',
  'CT10.9: consulta sem limitações conhecidas é recusada');

-- Dado pessoal em details (ADR-0004 §2.10) ---------------------------------------------------
-- asserções a mais: 5 (o primeiro throws_ok da lista roda uma vez por linha)
-- Pela API, details nem é gravável (R-I3.7-02): a trava de chaves vale para
-- os caminhos de dentro do banco, e os casos da lista rodam como postgres.

select throws_ok(
  format($$insert into public.vehicle_checks (offer_id, category, source_name, source_type, method, performed_at,
      result, result_summary, known_limitations, details)
    values (%L, 'lien', 'DETRAN-SP', 'official', 'manual', now(), 'no_occurrence_in_source', 'Resumo.',
      'Limitação.', '{}')$$, pg_temp.id('P')),
  '42501', 'permission denied for table vehicle_checks',
  'R-I3.7-02: pela API, a consulta não leva details');
reset role;
select pg_temp.entrar('O');

select throws_ok(
  format($$insert into public.vehicle_checks (offer_id, category, source_name, source_type, method, performed_at,
      result, result_summary, known_limitations, details)
    values (%L, 'lien', 'DETRAN-SP', 'official', 'manual', now(), 'no_occurrence_in_source', 'Resumo.',
      'Limitação.', %L)$$, pg_temp.id('P'), d.valor),
  '23514', 'new row for relation "vehicle_checks" violates check constraint "vehicle_checks_sem_dado_pessoal"',
  'dado pessoal recusado: ' || d.caso)
from (values
  ('chave no primeiro nível', '{"cpf": "000.000.000-00"}'),
  ('aninhada em objeto', '{"resultado": {"proprietario": {"tipo": "PF"}}}'),
  ('dentro de lista, em camelCase', '{"itens": [{"nomeProprietario": "x"}]}'),
  ('com maiúscula e acento', '{"Endereço": "Rua A"}'),
  ('placa (E30)', '{"placa": "ABC1D23"}'),
  ('código de segurança do CRV', '{"crv_codigo_de_seguranca": "123"}')) as d(caso, valor);
select is(
  pg_temp.resultado(format($$insert into public.vehicle_checks (offer_id, category, source_name, source_type,
      method, performed_at, result, result_summary, known_limitations, details)
    values (%L, 'debts_licensing', 'DETRAN-SP', 'official', 'manual', now() - interval '1 hour',
      'no_occurrence_in_source', 'Resumo.', 'Limitação.', '{"situacao": "licenciado", "uf": "SP"}')$$,
    pg_temp.id('P'))),
  'linhas: 1',
  'contraste: details com chaves neutras é aceito');
select pg_temp.entrar(null);
reset role;
select pg_temp.entrar('O');
select throws_ok(
  format($$insert into public.vehicle_checks (offer_id, category, source_name, source_type, method, performed_at,
      result, result_summary, known_limitations, details)
    values (%L, 'lien', 'DETRAN-SP', 'official', 'manual', now(), 'no_occurrence_in_source', 'Resumo.',
      'Limitação.', '{"renavam": "12345678900"}')$$, pg_temp.id('P')),
  '23514', 'new row for relation "vehicle_checks" violates check constraint "vehicle_checks_sem_dado_pessoal"',
  'dado pessoal recusado também como postgres');
select pg_temp.entrar(null);

-- Teste 11: registros só de inclusão --------------------------------------------------------

select throws_ok(
  $$update public.vehicle_checks set result = 'has_occurrence' where id = pg_temp.id('c1')$$,
  'P0001', 'tabela só de inclusão: UPDATE não é permitido em public.vehicle_checks',
  'CT11.8: a consulta não se altera, nem como postgres');
select throws_ok(
  $$delete from public.vehicle_checks where id = pg_temp.id('c1')$$,
  'P0001', 'tabela só de inclusão: DELETE não é permitido em public.vehicle_checks',
  'CT11.9: a consulta não se apaga, nem como postgres');
select throws_ok(
  $$update public.documental_reviews set reason = 'outro' where offer_id = pg_temp.id('P')$$,
  'P0001', 'tabela só de inclusão: UPDATE não é permitido em public.documental_reviews',
  'CT11.11: a revisão não se altera; fechar é linha nova');
select is(
  (select count(*)::int from public.vehicle_checks where offer_id = pg_temp.id('P') and category = 'lien'),
  3,
  'CT11.13: as consultas substituídas continuam no registro');

-- Revisão documental (ADR-0004 §2.5) -----------------------------------------------------

set local role authenticated;
select pg_temp.entrar('F1');
select pg_temp.api('{"x-audit-reason": "Motivo."}');
select throws_ok(
  $$insert into public.documental_reviews (offer_id, category, action) values (pg_temp.id('R'), 'lien', 'open_review')$$,
  '42501', 'só o operador ou o administrador sem vínculo com a empresa dona revisa',
  'E19: o fornecedor não abre revisão documental');
select pg_temp.api(null);
select pg_temp.entrar('O');
select throws_ok(
  $$insert into public.documental_reviews (offer_id, category, action) values (pg_temp.id('R'), 'lien', 'open_review')$$,
  'P0001', 'informe o motivo',
  'E8: a revisão exige motivo');
select pg_temp.api('{"x-audit-reason": "Documento diverge da declaração."}');
select is(
  pg_temp.resultado($$insert into public.documental_reviews (offer_id, category, action)
    values (pg_temp.id('R'), 'auction', 'open_review')$$),
  'linhas: 1',
  'contraste E8: o operador abre a revisão com motivo');
select throws_ok(
  $$insert into public.documental_reviews (offer_id, category, action) values (pg_temp.id('R'), 'auction', 'open_review')$$,
  'P0001', 'a categoria já tem revisão aberta',
  'E8: não se abre uma revisão já aberta');
select throws_ok(
  $$insert into public.documental_reviews (offer_id, category, action) values (pg_temp.id('R'), 'casualty', 'close_review')$$,
  'P0001', 'a categoria não tem revisão aberta',
  'E8: não se fecha revisão que não foi aberta');
select pg_temp.api(null);

-- Evidência da consulta (ADR-0004 §2.8) ---------------------------------------------------

select pg_temp.entrar('F1');
select ok(
  private.pode_enviar_evidencia_da_consulta(
    pg_temp.id('F') || '/' || pg_temp.id('R') || '/00000000-0000-4000-8000-0000000000e1.pdf'),
  'o fornecedor envia evidência à própria oferta');
select throws_ok(
  format($$insert into public.check_evidence_files (offer_id, storage_path, sha256, content_type, size_bytes)
    values (%L, %L, repeat('f', 64), 'application/pdf', 100)$$,
    pg_temp.id('R'), pg_temp.id('F') || '/' || pg_temp.id('R') || '/00000000-0000-4000-8000-0000000000e2.pdf'),
  'P0001', 'o arquivo da evidência não está no armazenamento',
  'a linha da evidência exige o objeto no bucket');
select pg_temp.entrar('G1');
select ok(
  not private.pode_enviar_evidencia_da_consulta(
    pg_temp.id('F') || '/' || pg_temp.id('R') || '/00000000-0000-4000-8000-0000000000e3.pdf'),
  'outra empresa não envia evidência à oferta alheia');
select pg_temp.entrar(null);
reset role;

-- Impedimento de transferência (ADR-0004 §2.11; P3 e P4) -----------------------------------

select is(
  (select count(*)::int from public.transfer_impediments where offer_id = pg_temp.id('P')),
  0,
  'ocorrência declarada em outra categoria (leilão) não gera impedimento');
select pg_temp.entrar('F1');
insert into public.supplier_declarations (offer_id, category, declared_value, detail)
values (pg_temp.id('D'), 'transfer_conditions', 'has_occurrence', 'Dano de média monta sem regularização.');
select pg_temp.entrar(null);
select is(
  (select status from public.transfer_impediments where offer_id = pg_temp.id('D')),
  'identified',
  'P3: a ocorrência declarada em transfer_conditions gera o impedimento');
select ok(
  'transfer_impediment' = any (private.pendencias_de_publicacao(pg_temp.id('D'))),
  'D9: o impedimento entra nas pendências de publicação');
set local role authenticated;
select pg_temp.entrar('F1');
select throws_matching(
  $$update public.offers set status = 'under_review', publication_authorized_by = pg_temp.id('F1')
    where id = pg_temp.id('D')$$,
  'transfer_impediment',
  'D9: com impedimento ativo, a oferta não vai para revisão');
select pg_temp.entrar(null);
reset role;

select pg_temp.consulta('c7', 'Q', 'O', 'transfer_conditions', 'has_occurrence');
select ok(not private.oferta_aberta(pg_temp.id('Q')),
  'P4: a publicada com impedimento ativo sai do catálogo');
select ok(private.oferta_aberta(pg_temp.id('P')), 'contraste P4: a publicada sem impedimento continua aberta');
select ok(
  pg_temp.ultima_versao('Q') -> 'notices' ? 'impedimento_de_transferencia.v1'
    and jsonb_array_length(pg_temp.ultima_versao('Q') -> 'transfer_impediments') = 1,
  'o impedimento entra no snapshot e na ressalva da versão nova');
set local role authenticated;
select pg_temp.entrar('F1');
select throws_ok(
  $$update public.offers set status = 'reserved' where id = pg_temp.id('Q')$$,
  'P0001', 'a oferta tem impedimento de transferência ativo e não pode ser reservada',
  'P4: a oferta com impedimento ativo não é reservada (T08)');
select pg_temp.entrar('O');
select pg_temp.api('{"x-audit-reason": "Regularização apresentada."}');
select is(
  pg_temp.resultado($$update public.transfer_impediments set status = 'resolved', resolution_evidence_id = pg_temp.id('evidência Q')
    where offer_id = pg_temp.id('Q')$$),
  'linhas: 0',
  'E21: o operador não resolve impedimento');
select pg_temp.entrar('X');
select throws_ok(
  $$update public.transfer_impediments set status = 'resolved' where offer_id = pg_temp.id('Q')$$,
  'P0001', 'anexe a evidência da regularização',
  'E21: a resolução exige evidência');
select is(
  pg_temp.resultado($$update public.transfer_impediments set status = 'resolved', resolution_evidence_id = pg_temp.id('evidência Q')
    where offer_id = pg_temp.id('Q')$$),
  'linhas: 1',
  'E21: o administrador resolve com motivo e evidência');
select throws_ok(
  $$update public.transfer_impediments set status = 'identified' where offer_id = pg_temp.id('Q')$$,
  'P0001', 'o impedimento só passa de identificado a resolvido, uma vez',
  'E22: o impedimento resolvido não volta');
select pg_temp.api(null);
select pg_temp.entrar(null);
reset role;
select ok(private.oferta_aberta(pg_temp.id('Q')), 'P4: resolvido o impedimento, a oferta volta ao catálogo');
select throws_ok(
  $$insert into public.transfer_impediments (offer_id, basis, source_check_id) values (pg_temp.id('P'), 'manual', pg_temp.id('c1'))$$,
  '42501', 'o impedimento nasce do registro de origem, não por inclusão direta',
  'P3: o impedimento não entra por inclusão direta, nem como postgres');
select throws_ok(
  $$delete from public.transfer_impediments where offer_id = pg_temp.id('Q')$$,
  '42501', 'exclusão não é permitida em public.transfer_impediments',
  'E22: o impedimento não se apaga, nem como postgres');

select * from finish();
rollback;
