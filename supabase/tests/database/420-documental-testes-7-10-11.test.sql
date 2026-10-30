-- I3.4: testes 7, 10 e 11 do domínio documental (§7.4; ADR-0004 §2 e §3;
-- anexo A.8, com o CT7.4 negativo, o CT10.8 pela P1 e o CT10.12 novo).
--
-- Completa o 400-documental, sem repetir o que ele cobre. Cada negativo tem
-- contraste; a camada que recusa é conferida pelo nome da restrição ou pela
-- mensagem. Três blocos desligam um gatilho de proteção só para isolar a
-- chave estrangeira composta (README, "isolar uma camada") e o religam logo
-- depois, antes da asserção seguinte: CT7.3 e CT7.4 (vehicle_checks_proteger),
-- CT7.8 (transfer_impediments_proteger) e CT7.9 (offers_proteger). Os
-- contrastes do teste 7 rodam com os gatilhos ligados; o CT7.8 tem também um
-- contraste dentro da camada isolada (a chave aceita a mesma oferta).
--
-- Elenco (anexo A.8): F, fornecedora real, com f1 (org_admin); T, fornecedora
-- de teste, com t1; O, operador; X, administrador. Ofertas: P (publicada), R,
-- N e I (rascunhos) de F, e PT (rascunho de teste) de T, todas com "sem
-- ocorrência conhecida" em todas as categorias.
begin;
select plan(123);
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
  values ($2, lower($1) || '-420@repasse-teste.invalid', now(),
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

-- Oferta completa pela RPC criar_oferta, na sessão de quem cadastra, com "sem
-- ocorrência conhecida" em todas as categorias (anexo A.8, "Dados de
-- referência").
create function pg_temp.oferta(nome text, empresa text, quem text) returns void
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
  for categoria in
    select jsonb_array_elements_text(s.value) from public.platform_settings s where s.key = 'document_categories'
  loop
    insert into public.supplier_declarations (offer_id, category, declared_value)
    values (novo, categoria, 'no_known_occurrence');
  end loop;
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

-- Documento da oferta: o objeto entra no bucket como postgres, com o dono
-- informado, como o Storage grava; a linha entra na sessão de quem envia, no
-- caminho <empresa>/<oferta>/<uuid> (ADR-0003 §2.13).
create function pg_temp.documento(nome text, oferta text, quem text, tipo text) returns void
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
  values (pg_temp.id(oferta), tipo, caminho, repeat('b', 64))
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

-- Linhas guardadas para conferir que ficaram intactas, e contagens de antes.
create temporary table guardada (nome text primary key, linha jsonb not null);
grant select on pg_temp.guardada to authenticated, service_role;
create temporary table contagem (nome text primary key, total integer not null);

-- Fixture ----------------------------------------------------------------------------

select pg_temp.usuario('X', '42000000-0000-4000-8000-000000000001');
select pg_temp.usuario('O', '42000000-0000-4000-8000-000000000002');
select pg_temp.usuario('F1', '42000000-0000-4000-8000-000000000003');
select pg_temp.usuario('T1', '42000000-0000-4000-8000-000000000004');
select pg_temp.admin('X');
select pg_temp.conceder('O', 'operator', 'X');
select pg_temp.empresa('F', 'F1', 'X', '42000001000186', 'supplier');
select pg_temp.empresa('T', 'T1', 'X', '42000004000110', 'supplier');
-- T é empresa de teste: as ofertas dela nascem com is_test (B26).
select pg_temp.entrar('X');
update public.organizations set is_test = true where id = pg_temp.id('T');
select pg_temp.entrar(null);

select pg_temp.oferta('P', 'F', 'F1');
select pg_temp.oferta('R', 'F', 'F1');
select pg_temp.oferta('N', 'F', 'F1');
select pg_temp.oferta('I', 'F', 'F1');
select pg_temp.oferta('PT', 'T', 'T1');
select pg_temp.publicar('P', 'F1', 'O');
insert into pg_temp.fixture
select 'declaração PT', d.id from public.supplier_declarations d
where d.offer_id = pg_temp.id('PT') and d.category = 'lien';

select pg_temp.evidencia_da_consulta('evidência P', 'P', 'O');
select pg_temp.evidencia_da_consulta('evidência PT', 'PT', 'O');
select pg_temp.evidencia_da_consulta('evidência I', 'I', 'X');

select pg_temp.consulta('consulta PT', 'PT', 'O', 'lien', 'no_occurrence_in_source');
select pg_temp.consulta('real P', 'P', 'O', 'debts_ipva', 'awaiting_result');
select pg_temp.consulta('consulta F1', 'P', 'F1', 'debts_fines', 'no_occurrence_in_source');
select pg_temp.consulta('consulta R', 'R', 'O', 'auction', 'no_occurrence_in_source');
-- I: linhas nas três tabelas (CT11.12): a consulta com ocorrência em
-- transfer_conditions gera o impedimento (P3), e a revisão fica aberta.
select pg_temp.consulta('consulta I', 'I', 'O', 'transfer_conditions', 'has_occurrence');
select pg_temp.revisao('I', 'transfer_conditions', 'open_review', 'O');
insert into pg_temp.fixture
select 'impedimento I', t.id from public.transfer_impediments t where t.offer_id = pg_temp.id('I');
insert into pg_temp.fixture
select 'auditoria F1', a.id from public.audit_logs a
where a.entity_type = 'vehicle_checks' and a.entity_id = pg_temp.id('consulta F1');

insert into pg_temp.guardada select 'consulta PT', to_jsonb(c) from public.vehicle_checks c where c.id = pg_temp.id('consulta PT');
insert into pg_temp.guardada select 'consulta F1', to_jsonb(c) from public.vehicle_checks c where c.id = pg_temp.id('consulta F1');
insert into pg_temp.guardada select 'impedimento I', to_jsonb(t) from public.transfer_impediments t where t.id = pg_temp.id('impedimento I');
insert into pg_temp.guardada select 'auditoria F1', to_jsonb(a) from public.audit_logs a where a.id = pg_temp.id('auditoria F1');

-- Teste 7: consulta de teste não se liga a oferta real -----------------------------------

-- Contraste: t1 grava em PT uma consulta de teste, com estado e versão novos;
-- O grava uma consulta real em P (anexo A.8).
insert into pg_temp.contagem select 'versões de PT', count(*)::int from public.offer_versions where offer_id = pg_temp.id('PT');
select pg_temp.consulta('consulta T1', 'PT', 'T1', 'debts_fines', 'no_occurrence_in_source');
select is(
  (select c.is_test::text || '/' || c.recorded_as from public.vehicle_checks c where c.id = pg_temp.id('consulta T1')),
  'true/supplier',
  'contraste teste 7: t1 registra na oferta de teste uma consulta com a marca de teste');
select is(pg_temp.estado('PT', 'debts_fines'), 'no_findings_in_sources',
  'contraste teste 7: a consulta de teste muda o estado da oferta de teste');
select is(
  (select count(*)::int from public.offer_versions where offer_id = pg_temp.id('PT'))
    - (select total from pg_temp.contagem where nome = 'versões de PT'),
  1,
  'contraste teste 7: e gera versão nova na oferta de teste');
select is(
  (select c.is_test::text || '/' || c.recorded_as from public.vehicle_checks c where c.id = pg_temp.id('real P')),
  'false/platform',
  'contraste teste 7: o operador registra consulta real na oferta real');

-- CT7.7: evidência de outra oferta. O contraste vem antes da linha de base do CT7.11.
select pg_temp.entrar('O');
select is(
  pg_temp.resultado($$insert into public.vehicle_checks (offer_id, category, source_name, source_type, method,
      performed_at, result, result_summary, known_limitations, evidence_document_id)
    values (pg_temp.id('P'), 'debts_licensing', 'DETRAN-SP', 'official', 'manual', now() - interval '1 hour',
      'no_occurrence_in_source', 'Licenciamento em dia.', 'A fonte cobre só a UF consultada.',
      pg_temp.id('evidência P'))$$),
  'linhas: 1',
  'contraste CT7.7: a evidência da própria oferta se liga à consulta');
select throws_ok(
  $$insert into public.vehicle_checks (offer_id, category, source_name, source_type, method, performed_at, result,
      result_summary, known_limitations, evidence_document_id)
    values (pg_temp.id('P'), 'debts_licensing', 'DETRAN-SP', 'official', 'manual', now() - interval '1 hour',
      'no_occurrence_in_source', 'Licenciamento em dia.', 'A fonte cobre só a UF consultada.',
      pg_temp.id('evidência PT'))$$,
  '23503', 'insert or update on table "vehicle_checks" violates foreign key constraint "vehicle_checks_evidencia_da_oferta_fkey"',
  'CT7.7: a evidência da oferta de teste não se liga à consulta da oferta real, mesmo enviada por quem registra');
select pg_temp.entrar(null);

-- Linha de base do CT7.11: versões e estados de P antes das tentativas.
insert into pg_temp.contagem select 'versões de P', count(*)::int from public.offer_versions where offer_id = pg_temp.id('P');
insert into pg_temp.guardada
select 'estados de P', jsonb_object_agg(e.category, e.state) from private.estados_documentais_da_oferta(pg_temp.id('P')) e;

-- CT7.1 a CT7.4 pela API: o payload não leva a marca de teste (E15).
set local role authenticated;
select pg_temp.entrar('O');
select throws_ok(
  $$insert into public.vehicle_checks (offer_id, category, source_name, source_type, method, performed_at, result,
      result_summary, known_limitations, is_test)
    values (pg_temp.id('P'), 'casualty', 'DETRAN-SP', 'official', 'manual', now() - interval '1 hour',
      'no_occurrence_in_source', 'Resumo.', 'Limitação.', true)$$,
  '42501', 'permission denied for table vehicle_checks',
  'CT7.1: pela API, o operador não grava consulta com a marca de teste na oferta real');
select pg_temp.entrar('F1');
select throws_ok(
  $$insert into public.vehicle_checks (offer_id, category, source_name, source_type, method, performed_at, result,
      result_summary, known_limitations, is_test)
    values (pg_temp.id('P'), 'casualty', 'DETRAN-SP', 'official', 'manual', now() - interval '1 hour',
      'no_occurrence_in_source', 'Resumo.', 'Limitação.', true)$$,
  '42501', 'permission denied for table vehicle_checks',
  'CT7.2 (banco): o org_admin não manda a marca de teste no registro; o servidor recusa à parte (esquema estrito)');
select pg_temp.entrar('X');
select throws_ok(
  $$insert into public.vehicle_checks (offer_id, category, source_name, source_type, method, performed_at, result,
      result_summary, known_limitations, is_test)
    values (pg_temp.id('R'), 'debts_ipva', 'DETRAN-SP', 'official', 'manual', now() - interval '1 hour',
      'no_occurrence_in_source', 'Resumo.', 'Limitação.', true)$$,
  '42501', 'permission denied for table vehicle_checks',
  'CT7.3: pela API, o administrador também não, nem no rascunho');
select pg_temp.entrar('O');
select throws_ok(
  $$insert into public.vehicle_checks (offer_id, category, source_name, source_type, method, performed_at, result,
      result_summary, known_limitations, is_test)
    values (pg_temp.id('PT'), 'casualty', 'DETRAN-SP', 'official', 'manual', now() - interval '1 hour',
      'no_occurrence_in_source', 'Resumo.', 'Limitação.', false)$$,
  '42501', 'permission denied for table vehicle_checks',
  'CT7.4: pela API, consulta real não é gravada na oferta de teste');
reset role;
select pg_temp.entrar(null);

-- CT7.3 e CT7.4 no gatilho: a marca enviada é trocada pela da oferta, nos dois sentidos.
select pg_temp.entrar('X');
select is(
  pg_temp.resultado($$insert into public.vehicle_checks (offer_id, category, source_name, source_type, method,
      performed_at, result, result_summary, known_limitations, is_test)
    values (pg_temp.id('R'), 'debts_ipva', 'DETRAN-SP', 'official', 'manual', now() - interval '1 hour',
      'no_occurrence_in_source', 'Resumo.', 'Limitação.', true)$$),
  'linhas: 1',
  'CT7.3: como postgres, a consulta com a marca de teste enviada entra no rascunho real');
select pg_temp.entrar(null);
select is(
  (select bool_or(c.is_test) from public.vehicle_checks c
    where c.offer_id = pg_temp.id('R') and c.category = 'debts_ipva'),
  false,
  'CT7.3: e fica sem a marca, a da oferta real, em qualquer estado da oferta');
select pg_temp.entrar('O');
select is(
  pg_temp.resultado($$insert into public.vehicle_checks (offer_id, category, source_name, source_type, method,
      performed_at, result, result_summary, known_limitations, is_test)
    values (pg_temp.id('PT'), 'casualty', 'DETRAN-SP', 'official', 'manual', now() - interval '1 hour',
      'no_occurrence_in_source', 'Resumo.', 'Limitação.', false)$$),
  'linhas: 1',
  'CT7.4: como postgres, a consulta enviada como real entra na oferta de teste');
select pg_temp.entrar(null);
select is(
  (select bool_and(c.is_test) from public.vehicle_checks c
    where c.offer_id = pg_temp.id('PT') and c.category = 'casualty'),
  true,
  'CT7.4 (E15): e fica com a marca de teste da oferta; consulta real nunca se liga à oferta de teste');

-- Camada da chave composta sozinha: gatilho desligado só para estas asserções.
alter table public.vehicle_checks disable trigger vehicle_checks_proteger;
select throws_ok(
  $$insert into public.vehicle_checks (offer_id, vehicle_id, category, source_name, source_type, method, performed_at,
      performed_by, recorded_by, recorded_as, result, result_summary, known_limitations, is_test)
    values (pg_temp.id('R'), pg_temp.id('veículo R'), 'lien', 'DETRAN-SP', 'official', 'manual', now(),
      pg_temp.id('X'), pg_temp.id('X'), 'platform', 'no_occurrence_in_source', 'Resumo.', 'Limitação.', true)$$,
  '23503', 'insert or update on table "vehicle_checks" violates foreign key constraint "vehicle_checks_oferta_e_teste_fkey"',
  'CT7.3 (chave composta): consulta de teste no rascunho real é recusada mesmo sem o gatilho');
select throws_ok(
  $$insert into public.vehicle_checks (offer_id, vehicle_id, category, source_name, source_type, method, performed_at,
      performed_by, recorded_by, recorded_as, result, result_summary, known_limitations, is_test)
    values (pg_temp.id('PT'), pg_temp.id('veículo PT'), 'lien', 'DETRAN-SP', 'official', 'manual', now(),
      pg_temp.id('O'), pg_temp.id('O'), 'platform', 'no_occurrence_in_source', 'Resumo.', 'Limitação.', false)$$,
  '23503', 'insert or update on table "vehicle_checks" violates foreign key constraint "vehicle_checks_oferta_e_teste_fkey"',
  'CT7.4 (chave composta): consulta real na oferta de teste é recusada mesmo sem o gatilho');
alter table public.vehicle_checks enable trigger vehicle_checks_proteger;
select is(
  (select count(*)::int from public.vehicle_checks c where c.offer_id = pg_temp.id('PT') and not c.is_test),
  0,
  'CT7.4: nenhuma consulta real ligada à oferta de teste');

-- CT7.5 (o inverso do 400) e CT7.6.
select pg_temp.entrar('O');
select throws_ok(
  $$insert into public.vehicle_checks (offer_id, category, source_name, source_type, method, performed_at, result,
      result_summary, known_limitations, supersedes_check_id)
    values (pg_temp.id('PT'), 'debts_ipva', 'DETRAN-SP', 'official', 'manual', now() - interval '1 hour',
      'no_occurrence_in_source', 'Resumo.', 'Limitação.', pg_temp.id('real P'))$$,
  '23503', 'insert or update on table "vehicle_checks" violates foreign key constraint "vehicle_checks_substitui_da_mesma_oferta_fkey"',
  'CT7.5: a consulta da oferta de teste não substitui consulta da oferta real, na mesma categoria');
select is(
  pg_temp.resultado($$insert into public.vehicle_checks (offer_id, vehicle_id, category, source_name, source_type,
      method, performed_at, result, result_summary, known_limitations)
    values (pg_temp.id('PT'), pg_temp.id('veículo P'), 'auction', 'DETRAN-SP', 'official', 'manual',
      now() - interval '1 hour', 'no_occurrence_in_source', 'Resumo.', 'Limitação.')$$),
  'linhas: 1',
  'CT7.6: como postgres, a consulta com o veículo de P entra em PT');
select pg_temp.entrar(null);
select is(
  (select c.vehicle_id from public.vehicle_checks c where c.offer_id = pg_temp.id('PT') and c.category = 'auction'),
  pg_temp.id('veículo PT'),
  'CT7.6 (E34): e fica com o veículo da própria oferta, gravado pelo gatilho');

-- CT7.8: o impedimento só aponta para registro da mesma oferta (chave composta).
-- O gatilho barra a inclusão direta (400); desligado, sobra a chave estrangeira.
alter table public.transfer_impediments disable trigger transfer_impediments_proteger;
select throws_ok(
  $$insert into public.transfer_impediments (offer_id, basis, source_check_id, status)
    values (pg_temp.id('P'), 'Impedimento de teste.', pg_temp.id('consulta PT'), 'identified')$$,
  '23503', 'insert or update on table "transfer_impediments" violates foreign key constraint "transfer_impediments_consulta_da_oferta_fkey"',
  'CT7.8: impedimento em P não aponta para consulta de PT, mesmo sem o gatilho');
select throws_ok(
  $$insert into public.transfer_impediments (offer_id, basis, source_declaration_id, status)
    values (pg_temp.id('P'), 'Impedimento de teste.', pg_temp.id('declaração PT'), 'identified')$$,
  '23503', 'insert or update on table "transfer_impediments" violates foreign key constraint "transfer_impediments_declaracao_da_oferta_fkey"',
  'CT7.8: nem para declaração de PT');
select is(
  pg_temp.resultado($$insert into public.transfer_impediments (offer_id, basis, source_check_id, status)
    values (pg_temp.id('R'), 'Impedimento de teste.', pg_temp.id('consulta R'), 'identified')$$),
  'linhas: 1',
  'contraste CT7.8: sem o gatilho, a chave aceita o impedimento que aponta para consulta da mesma oferta');
alter table public.transfer_impediments enable trigger transfer_impediments_proteger;

-- CT7.9: a marca de teste da oferta com consultas ligadas não muda (B26).
set local role authenticated;
select pg_temp.entrar('X');
select throws_ok(
  $$update public.offers set is_test = false where id = pg_temp.id('PT')$$,
  '42501', 'permission denied for table offers',
  'CT7.9: pela API, o administrador não muda a marca de teste da oferta');
reset role;
select pg_temp.entrar(null);
select pg_temp.entrar('X');
select throws_ok(
  $$update public.offers set is_test = false where id = pg_temp.id('PT')$$,
  '42501', 'empresa, veículo, autor e marcação de teste da oferta não mudam',
  'CT7.9: como postgres, o gatilho recusa tirar a marca da oferta de teste');
select throws_ok(
  $$update public.offers set is_test = true where id = pg_temp.id('P')$$,
  '42501', 'empresa, veículo, autor e marcação de teste da oferta não mudam',
  'CT7.9: e pôr a marca na oferta real');
select pg_temp.entrar(null);
alter table public.offers disable trigger offers_proteger;
select throws_ok(
  $$update public.offers set is_test = false where id = pg_temp.id('PT')$$,
  '23503', 'update or delete on table "offers" violates foreign key constraint "vehicle_checks_oferta_e_teste_fkey" on table "vehicle_checks"',
  'CT7.9 (chave composta): sem o gatilho, a oferta com consultas ligadas não troca de lado');
alter table public.offers enable trigger offers_proteger;

-- CT7.10: a marca de teste da consulta não muda (só inclusão).
set local role authenticated;
select pg_temp.entrar('X');
select throws_ok(
  $$update public.vehicle_checks set is_test = false where id = pg_temp.id('consulta PT')$$,
  '42501', 'permission denied for table vehicle_checks',
  'CT7.10: o administrador não muda a marca da consulta');
reset role;
select pg_temp.entrar(null);
set local role service_role;
select set_config('request.jwt.claims', '{"role": "service_role"}', true);
select throws_ok(
  $$update public.vehicle_checks set is_test = false where id = pg_temp.id('consulta PT')$$,
  '42501', 'permission denied for table vehicle_checks',
  'CT7.10: service_role não muda a marca da consulta');
reset role;
select set_config('request.jwt.claims', '', true);
select throws_ok(
  $$update public.vehicle_checks set is_test = false where id = pg_temp.id('consulta PT')$$,
  'P0001', 'tabela só de inclusão: UPDATE não é permitido em public.vehicle_checks',
  'CT7.10: nem como postgres');
select is(
  (select to_jsonb(c) from public.vehicle_checks c where c.id = pg_temp.id('consulta PT')),
  (select g.linha from pg_temp.guardada g where g.nome = 'consulta PT'),
  'CT7.10: a consulta de teste continua intacta');

-- CT7.11: P não mudou com as tentativas.
select is(
  (select count(*)::int from public.offer_versions where offer_id = pg_temp.id('P')),
  (select total from pg_temp.contagem where nome = 'versões de P'),
  'CT7.11: as tentativas não geram versão em P');
select is(
  (select jsonb_object_agg(e.category, e.state) from private.estados_documentais_da_oferta(pg_temp.id('P')) e),
  (select g.linha from pg_temp.guardada g where g.nome = 'estados de P'),
  'CT7.11: os estados de P continuam os mesmos');
select is(pg_temp.estado('P', 'lien'), 'declared_unverified',
  'CT7.11: a consulta sem ocorrência de PT em lien não leva P a sem apontamentos nas fontes consultadas');
select is(
  (select count(*)::int from public.vehicle_checks c where c.offer_id = pg_temp.id('P') and c.is_test),
  0,
  'CT7.1 e CT7.11: nenhuma consulta de teste ligada a P');

-- Teste 10: no_findings_in_sources não existe sem consulta registrada ----------------------

select is((select count(*)::int from public.vehicle_checks c where c.offer_id = pg_temp.id('N')), 0,
  'preparo CT10.1: N não tem consulta');
select is(
  array(select distinct e.state from private.estados_documentais_da_oferta(pg_temp.id('N')) e),
  array['declared_unverified'],
  'CT10.1: "sem ocorrência conhecida" em todas as categorias, sem consulta: todas declaradas, sem comprovação (linha 11)');
select pg_temp.documento('certidão N', 'N', 'F1', 'certidao');
select pg_temp.documento('relatório N', 'N', 'F1', 'relatorio_de_consulta');
select is((select count(*)::int from public.offer_documents d where d.offer_id = pg_temp.id('N')), 2,
  'preparo CT10.4: certidão e relatório de consulta anexados a N');
select is(
  array(select distinct e.state from private.estados_documentais_da_oferta(pg_temp.id('N')) e),
  array['declared_unverified'],
  'CT10.4 (E9): documento anexado não muda o estado nem leva a sem apontamentos nas fontes consultadas');
select pg_temp.consulta('consulta N', 'N', 'O', 'lien', 'no_occurrence_in_source');
select is(pg_temp.estado('N', 'lien'), 'no_findings_in_sources',
  'contraste CT10.4: a consulta registrada leva a sem apontamentos nas fontes consultadas (linha 15)');

-- CT10.5: ninguém grava o estado (§6.4). O 350 confere que nenhuma tabela tem a coluna.
set local role authenticated;
select pg_temp.entrar('O');
select throws_ok(
  $$insert into public.vehicle_checks (offer_id, category, source_name, source_type, method, performed_at, result,
      result_summary, known_limitations, state)
    values (pg_temp.id('P'), 'lien', 'DETRAN-SP', 'official', 'manual', now() - interval '1 hour',
      'no_occurrence_in_source', 'Resumo.', 'Limitação.', 'no_findings_in_sources')$$,
  '42703', 'column "state" of relation "vehicle_checks" does not exist',
  'CT10.5: o estado não vai no registro da consulta');
select pg_temp.entrar('F1');
select throws_ok(
  $$update public.offer_versions
    set material_snapshot = jsonb_set(material_snapshot, '{categories,lien,state}', '"no_findings_in_sources"')
    where offer_id = pg_temp.id('P')$$,
  '42501', 'permission denied for table offer_versions',
  'CT10.5: o fornecedor não grava o estado no snapshot');
select pg_temp.entrar('O');
select throws_ok(
  $$update public.offer_versions
    set material_snapshot = jsonb_set(material_snapshot, '{categories,lien,state}', '"no_findings_in_sources"')
    where offer_id = pg_temp.id('P')$$,
  '42501', 'permission denied for table offer_versions',
  'CT10.5: nem o operador');
select throws_ok(
  $$insert into public.offer_versions (offer_id, version_number, material_snapshot, snapshot_hash, change_summary)
    select v.offer_id, v.version_number + 100, v.material_snapshot, v.snapshot_hash, 'estado gravado'
    from public.offer_versions v where v.offer_id = pg_temp.id('P')$$,
  '42501', 'permission denied for table offer_versions',
  'CT10.5: o operador não grava versão');
select throws_ok(
  $$select private.estado_documental(pg_temp.id('P'), 'lien')$$,
  '42501', 'permission denied for function estado_documental',
  'CT10.5: o operador não chama o cálculo do estado direto');
select pg_temp.entrar('F1');
select throws_ok(
  $$select private.versionar_oferta(pg_temp.id('P'))$$,
  '42501', 'permission denied for function versionar_oferta',
  'CT10.5: o fornecedor não chama o versionamento direto');
reset role;
select pg_temp.entrar(null);
select is(pg_temp.estado('P', 'lien'), 'declared_unverified', 'CT10.5: o estado de P em lien não mudou');

-- CT10.9: a consulta precisa de fonte, data e limitações (o 400 cobre a falta das limitações).
set local role authenticated;
select pg_temp.entrar('O');
select throws_ok(
  $$insert into public.vehicle_checks (offer_id, category, source_type, method, performed_at, result,
      result_summary, known_limitations)
    values (pg_temp.id('N'), 'theft_recovery', 'official', 'manual', now() - interval '1 hour',
      'no_occurrence_in_source', 'Resumo.', 'Limitação.')$$,
  '23502', 'null value in column "source_name" of relation "vehicle_checks" violates not-null constraint',
  'CT10.9: consulta sem fonte é recusada');
select throws_ok(
  $$insert into public.vehicle_checks (offer_id, category, source_name, source_type, method, result,
      result_summary, known_limitations)
    values (pg_temp.id('N'), 'theft_recovery', 'DETRAN-SP', 'official', 'manual',
      'no_occurrence_in_source', 'Resumo.', 'Limitação.')$$,
  '23502', 'null value in column "performed_at" of relation "vehicle_checks" violates not-null constraint',
  'CT10.9: consulta sem data é recusada');
select throws_ok(
  $$insert into public.vehicle_checks (offer_id, category, source_name, source_type, method, performed_at, result,
      result_summary, known_limitations)
    values (pg_temp.id('N'), 'theft_recovery', '', 'official', 'manual', now() - interval '1 hour',
      'no_occurrence_in_source', 'Resumo.', 'Limitação.')$$,
  '23514', 'new row for relation "vehicle_checks" violates check constraint "vehicle_checks_fonte"',
  'CT10.9: consulta com fonte vazia é recusada');
select throws_ok(
  $$insert into public.vehicle_checks (offer_id, category, source_name, source_type, method, performed_at, result,
      result_summary, known_limitations)
    values (pg_temp.id('N'), 'theft_recovery', 'DETRAN-SP', 'official', 'manual', now() - interval '1 hour',
      'no_occurrence_in_source', 'Resumo.', '')$$,
  '23514', 'new row for relation "vehicle_checks" violates check constraint "vehicle_checks_limitacoes"',
  'CT10.9: consulta com limitações vazias é recusada');
reset role;
select pg_temp.entrar(null);
select is(
  pg_temp.estado('N', 'theft_recovery') || '/'
    || (select count(*) from public.vehicle_checks c where c.offer_id = pg_temp.id('N') and c.category = 'theft_recovery'),
  'declared_unverified/0',
  'CT10.9: nenhuma consulta gravada, e o estado não mudou');

-- CT10.11 e CT10.12: cada versão de P mostra sem apontamentos nas fontes
-- consultadas só com consulta vigente sem ocorrência, com fonte e data.
select pg_temp.consulta('P lien 1', 'P', 'O', 'lien', 'no_occurrence_in_source');
insert into pg_temp.guardada select 'P lien 1', to_jsonb(c) from public.vehicle_checks c where c.id = pg_temp.id('P lien 1');
select pg_temp.consulta('P lien 2', 'P', 'O', 'lien', 'awaiting_result', 'P lien 1');
select pg_temp.consulta('P lien 3', 'P', 'O', 'lien', 'no_occurrence_in_source', 'P lien 2');
select is(
  (select count(*)::int
     from public.offer_versions v
     cross join lateral jsonb_each(v.material_snapshot -> 'categories') as c(categoria, dados)
    where v.offer_id = pg_temp.id('P')
      and c.dados ->> 'state' = 'no_findings_in_sources'
      and not case
        when jsonb_typeof(c.dados -> 'checks') = 'array' then
          jsonb_array_length(c.dados -> 'checks') > 0
          and not exists (
            select 1 from jsonb_array_elements(c.dados -> 'checks') as k(item)
            where k.item ->> 'result' is distinct from 'no_occurrence_in_source'
               or coalesce(k.item ->> 'source_name', '') = ''
               or coalesce(k.item ->> 'performed_at', '') = '')
        else false
      end),
  0,
  'CT10.11: em toda versão de P, sem apontamentos nas fontes consultadas só com consultas vigentes sem ocorrência, com fonte e data');
select is(
  (select count(*)::int from public.offer_versions v
    where v.offer_id = pg_temp.id('P')
      and v.material_snapshot -> 'categories' -> 'lien' ->> 'state' = 'no_findings_in_sources'),
  2,
  'CT10.11: lien aparece assim nas duas versões com consulta sem ocorrência vigente, e não na da consulta pendente');
select is(
  (select count(*)::int from public.offer_versions v
    where v.offer_id = pg_temp.id('P')
      and (v.material_snapshot -> 'notices' ? 'sem_apontamentos_nas_fontes_consultadas.v1')
          is distinct from exists (
            select 1 from jsonb_each(v.material_snapshot -> 'categories') as c(categoria, dados)
            where c.dados ->> 'state' = 'no_findings_in_sources')),
  0,
  'CT10.11: a ressalva das fontes consultadas aparece só nas versões que têm esse estado');
select is(
  (pg_temp.ultima_versao('P') -> 'categories' -> 'lien' ->> 'state') || '/'
    || (pg_temp.ultima_versao('P') -> 'categories' -> 'lien' -> 'checks' -> 0 ->> 'has_evidence') || '/'
    || jsonb_array_length(pg_temp.ultima_versao('P') -> 'categories' -> 'lien' -> 'checks'),
  'no_findings_in_sources/false/1',
  'CT10.12 (P2): sem evidência anexada, a consulta vigente leva ao estado, e o snapshot marca a falta da evidência');
select is(
  pg_temp.ultima_versao('P') -> 'categories' -> 'debts_licensing' -> 'checks' -> 0 ->> 'has_evidence',
  'true',
  'contraste CT10.12: com a evidência anexada, o snapshot marca que ela existe');

-- Teste 11: registros só de inclusão ---------------------------------------------------------

-- CT11.13: a consulta substituída continua legível e intacta (§6.3).
set local role authenticated;
select pg_temp.entrar('F1');
select is(
  (select to_jsonb(c) from public.vehicle_checks c where c.id = pg_temp.id('P lien 1')),
  (select g.linha from pg_temp.guardada g where g.nome = 'P lien 1'),
  'CT11.13: o fornecedor lê a consulta substituída, intacta');
select pg_temp.entrar('O');
select is(
  (select to_jsonb(c) from public.vehicle_checks c where c.id = pg_temp.id('P lien 1')),
  (select g.linha from pg_temp.guardada g where g.nome = 'P lien 1'),
  'CT11.13: o operador também');
reset role;
select pg_temp.entrar(null);
select is(
  array(select v.id from private.consultas_vigentes(pg_temp.id('P'), 'lien') v),
  array[pg_temp.id('P lien 3')],
  'contraste CT11.13: a consulta nova é a vigente, e as anteriores ficam no registro');

-- CT11.8: quem registrou a consulta não a altera, coluna por coluna.
create temporary table mudanca (coluna text primary key, atribuicao text not null);
grant select on pg_temp.mudanca to authenticated;
insert into pg_temp.mudanca values
  ('details', $v$details = '{"situacao": "alterada"}'$v$),
  ('evidence_document_id', format('evidence_document_id = %L', pg_temp.id('evidência P'))),
  ('is_test', 'is_test = true'),
  ('known_limitations', $v$known_limitations = 'Outra limitação.'$v$),
  ('result', $v$result = 'has_occurrence'$v$),
  ('supersedes_check_id', format('supersedes_check_id = %L', pg_temp.id('real P')));
set local role authenticated;
select pg_temp.entrar('F1');
select throws_ok(
  format('update public.vehicle_checks set %s where id = %L', m.atribuicao, pg_temp.id('consulta F1')),
  '42501', 'permission denied for table vehicle_checks',
  'CT11.8: quem registrou não altera ' || m.coluna || ' pela API')
from pg_temp.mudanca m
order by m.coluna;
reset role;
select pg_temp.entrar(null);
select throws_ok(
  format('update public.vehicle_checks set %s where id = %L', m.atribuicao, pg_temp.id('consulta F1')),
  'P0001', 'tabela só de inclusão: UPDATE não é permitido em public.vehicle_checks',
  'CT11.8: ' || m.coluna || ' não se altera nem como postgres')
from pg_temp.mudanca m
order by m.coluna;
select is(
  (select to_jsonb(c) from public.vehicle_checks c where c.id = pg_temp.id('consulta F1')),
  (select g.linha from pg_temp.guardada g where g.nome = 'consulta F1'),
  'CT11.8: a consulta continua intacta');

-- CT11.9: ninguém apaga consulta pela API (o 400 cobre o postgres).
set local role authenticated;
select pg_temp.entrar('F1');
select throws_ok(
  $$delete from public.vehicle_checks where id = pg_temp.id('consulta F1')$$,
  '42501', 'permission denied for table vehicle_checks',
  'CT11.9: quem registrou não apaga a consulta');
select pg_temp.entrar('O');
select throws_ok(
  $$delete from public.vehicle_checks where id = pg_temp.id('consulta F1')$$,
  '42501', 'permission denied for table vehicle_checks',
  'CT11.9: o operador não apaga');
select pg_temp.entrar('X');
select throws_ok(
  $$delete from public.vehicle_checks where id = pg_temp.id('consulta F1')$$,
  '42501', 'permission denied for table vehicle_checks',
  'CT11.9: o administrador não apaga');
reset role;
select pg_temp.entrar(null);

-- CT11.10: service_role e postgres (o 400 cobre o UPDATE e o DELETE de consulta e o
-- UPDATE de revisão como postgres).
set local role service_role;
select set_config('request.jwt.claims', '{"role": "service_role"}', true);
select throws_ok(
  $$update public.vehicle_checks set result = 'has_occurrence' where id = pg_temp.id('consulta F1')$$,
  '42501', 'permission denied for table vehicle_checks',
  'CT11.10: service_role não altera consulta');
select throws_ok(
  $$delete from public.vehicle_checks where id = pg_temp.id('consulta F1')$$,
  '42501', 'permission denied for table vehicle_checks',
  'CT11.10: service_role não apaga consulta');
select throws_ok(
  $$truncate public.vehicle_checks$$,
  '42501', 'permission denied for table vehicle_checks',
  'CT11.10: service_role não esvazia as consultas');
select throws_ok(
  $$update public.documental_reviews set reason = 'Outro motivo.' where offer_id = pg_temp.id('I')$$,
  '42501', 'permission denied for table documental_reviews',
  'CT11.10: service_role não altera revisão');
select throws_ok(
  $$delete from public.documental_reviews where offer_id = pg_temp.id('I')$$,
  '42501', 'permission denied for table documental_reviews',
  'CT11.10: service_role não apaga revisão');
select throws_ok(
  $$truncate public.documental_reviews$$,
  '42501', 'permission denied for table documental_reviews',
  'CT11.10: service_role não esvazia as revisões');
reset role;
select set_config('request.jwt.claims', '', true);
select throws_ok(
  $$delete from public.documental_reviews where offer_id = pg_temp.id('I')$$,
  'P0001', 'tabela só de inclusão: DELETE não é permitido em public.documental_reviews',
  'CT11.10: a revisão não se apaga, nem como postgres');
select throws_ok(
  $$truncate public.documental_reviews$$,
  'P0001', 'tabela só de inclusão: TRUNCATE não é permitido em public.documental_reviews',
  'CT11.10: as revisões não se esvaziam, nem como postgres');
-- transfer_impediments aponta para vehicle_checks: as duas entram no mesmo
-- TRUNCATE para a chave estrangeira não recusar antes do gatilho.
select throws_ok(
  $$truncate public.vehicle_checks, public.transfer_impediments$$,
  'P0001', 'tabela só de inclusão: TRUNCATE não é permitido em public.vehicle_checks',
  'CT11.10: as consultas não se esvaziam, nem como postgres');

-- CT11.11: a revisão não se altera nem se apaga pela API; reabrir é linha nova.
set local role authenticated;
select pg_temp.entrar('O');
select throws_ok(
  $$update public.documental_reviews set action = 'close_review' where offer_id = pg_temp.id('I')$$,
  '42501', 'permission denied for table documental_reviews',
  'CT11.11: o operador não fecha a revisão alterando a linha');
select pg_temp.entrar('X');
select throws_ok(
  $$update public.documental_reviews set reason = 'Outro motivo.' where offer_id = pg_temp.id('I')$$,
  '42501', 'permission denied for table documental_reviews',
  'CT11.11: o administrador não altera o motivo');
select pg_temp.entrar('O');
select throws_ok(
  $$delete from public.documental_reviews where offer_id = pg_temp.id('I')$$,
  '42501', 'permission denied for table documental_reviews',
  'CT11.11: o operador não apaga a revisão');
select pg_temp.entrar('X');
select throws_ok(
  $$delete from public.documental_reviews where offer_id = pg_temp.id('I')$$,
  '42501', 'permission denied for table documental_reviews',
  'CT11.11: o administrador não apaga a revisão');
reset role;
select pg_temp.entrar(null);
select pg_temp.revisao('P', 'casualty', 'open_review', 'O');
select pg_temp.revisao('P', 'casualty', 'close_review', 'O');
select pg_temp.revisao('P', 'casualty', 'open_review', 'O');
select is(
  array(select r.action from public.documental_reviews r
        where r.offer_id = pg_temp.id('P') and r.category = 'casualty' order by r.seq),
  array['open_review', 'close_review', 'open_review'],
  'contraste CT11.11: fechar e reabrir são linhas novas, e as anteriores ficam');
select is(pg_temp.estado('P', 'casualty'), 'under_review',
  'contraste CT11.11: reaberta, a categoria volta a em análise');

-- CT11.12: oferta e veículo com linhas nas três tabelas não se apagam, sem cascata.
select is(
  array[(select count(*)::int from public.vehicle_checks where offer_id = pg_temp.id('I')),
        (select count(*)::int from public.documental_reviews where offer_id = pg_temp.id('I')),
        (select count(*)::int from public.transfer_impediments where offer_id = pg_temp.id('I'))],
  array[1, 1, 1],
  'preparo CT11.12: I tem consulta, revisão e impedimento');
set local role authenticated;
select pg_temp.entrar('F1');
select throws_ok(
  $$delete from public.offers where id = pg_temp.id('I')$$,
  '42501', 'permission denied for table offers',
  'CT11.12: o dono não apaga a oferta com registros documentais');
select throws_ok(
  $$delete from public.vehicles where id = pg_temp.id('veículo I')$$,
  '42501', 'permission denied for table vehicles',
  'CT11.12: nem o veículo');
select pg_temp.entrar('X');
select throws_ok(
  $$delete from public.offers where id = pg_temp.id('I')$$,
  '42501', 'permission denied for table offers',
  'CT11.12: o administrador não apaga a oferta');
select throws_ok(
  $$delete from public.vehicles where id = pg_temp.id('veículo I')$$,
  '42501', 'permission denied for table vehicles',
  'CT11.12: nem o veículo');
reset role;
select pg_temp.entrar(null);
select throws_ok(
  $$delete from public.offers where id = pg_temp.id('I')$$,
  '42501', 'exclusão não é permitida em public.offers',
  'CT11.12: nem como postgres');
select throws_ok(
  $$delete from public.vehicles where id = pg_temp.id('veículo I')$$,
  '42501', 'exclusão não é permitida em public.vehicles',
  'CT11.12: o veículo, nem como postgres');
select is(
  (select array_agg(distinct c.confdeltype::text || c.confupdtype::text)
     from pg_constraint c
    where c.contype = 'f'
      and c.conrelid in ('public.vehicle_checks'::regclass, 'public.documental_reviews'::regclass,
                         'public.transfer_impediments'::regclass, 'public.check_evidence_files'::regclass)),
  array['ra'],
  'CT11.12: as chaves estrangeiras das tabelas documentais são restrict na exclusão e sem ação na atualização, sem cascata');
select is(
  (select count(*)::int
     from pg_constraint c
    where c.contype = 'f'
      and c.conrelid in ('public.vehicle_checks'::regclass, 'public.documental_reviews'::regclass,
                         'public.transfer_impediments'::regclass, 'public.check_evidence_files'::regclass)),
  15,
  'CT11.12: são as 15 chaves estrangeiras da migração 20261030120000');
select is(
  array[(select count(*)::int from public.vehicle_checks where offer_id = pg_temp.id('I')),
        (select count(*)::int from public.documental_reviews where offer_id = pg_temp.id('I')),
        (select count(*)::int from public.transfer_impediments where offer_id = pg_temp.id('I'))],
  array[1, 1, 1],
  'CT11.12: as linhas das três tabelas continuam');

-- CT11.14: o impedimento só passa de identificado a resolvido (E22).
set local role authenticated;
select pg_temp.entrar('O');
select throws_ok(
  $$update public.transfer_impediments set basis = 'Outra base.' where id = pg_temp.id('impedimento I')$$,
  '42501', 'permission denied for table transfer_impediments',
  'CT11.14: o operador não altera a base do impedimento');
select pg_temp.entrar('X');
select throws_ok(
  format('update public.transfer_impediments set offer_id = %L where id = %L', pg_temp.id('P'), pg_temp.id('impedimento I')),
  '42501', 'permission denied for table transfer_impediments',
  'CT11.14: o administrador não troca a oferta do impedimento');
select throws_ok(
  $$update public.transfer_impediments set basis = 'Outra base.' where id = pg_temp.id('impedimento I')$$,
  '42501', 'permission denied for table transfer_impediments',
  'CT11.14: nem a base');
select throws_ok(
  $$update public.transfer_impediments set source_check_id = null where id = pg_temp.id('impedimento I')$$,
  '42501', 'permission denied for table transfer_impediments',
  'CT11.14: nem a origem');
select throws_ok(
  $$delete from public.transfer_impediments where id = pg_temp.id('impedimento I')$$,
  '42501', 'permission denied for table transfer_impediments',
  'CT11.14: o administrador não apaga o impedimento');
reset role;
select pg_temp.entrar(null);
set local role service_role;
select set_config('request.jwt.claims', '{"role": "service_role"}', true);
select throws_ok(
  $$update public.transfer_impediments set basis = 'Outra base.' where id = pg_temp.id('impedimento I')$$,
  '42501', 'permission denied for table transfer_impediments',
  'CT11.14: service_role não altera o impedimento');
select throws_ok(
  $$delete from public.transfer_impediments where id = pg_temp.id('impedimento I')$$,
  '42501', 'permission denied for table transfer_impediments',
  'CT11.14: service_role não apaga o impedimento');
reset role;
select set_config('request.jwt.claims', '', true);
-- Camada do gatilho, como postgres na sessão do administrador.
select pg_temp.entrar('X');
select pg_temp.api('{"x-audit-reason": "Regularização apresentada."}');
select throws_ok(
  $$update public.transfer_impediments set basis = 'Outra base.' where id = pg_temp.id('impedimento I')$$,
  'P0001', 'o impedimento só passa de identificado a resolvido, uma vez',
  'CT11.14: como postgres, a base não muda sem a resolução');
select throws_ok(
  format($$update public.transfer_impediments set status = 'resolved', resolution_evidence_id = %L,
      basis = 'Outra base.' where id = %L$$, pg_temp.id('evidência I'), pg_temp.id('impedimento I')),
  '42501', 'do impedimento, só mudam a situação e a evidência da resolução',
  'CT11.14: nem junto com a resolução');
select throws_ok(
  format($$update public.transfer_impediments set status = 'resolved', resolution_evidence_id = %L,
      offer_id = %L where id = %L$$, pg_temp.id('evidência I'), pg_temp.id('P'), pg_temp.id('impedimento I')),
  '42501', 'do impedimento, só mudam a situação e a evidência da resolução',
  'CT11.14: nem a oferta junto com a resolução');
select pg_temp.api(null);
select pg_temp.entrar(null);
select throws_ok(
  format($$update public.transfer_impediments set status = 'resolved', resolution_evidence_id = %L
      where id = %L$$, pg_temp.id('evidência I'), pg_temp.id('impedimento I')),
  '42501', 'resolver impedimento exige sessão de usuário',
  'CT11.14: sem sessão de usuário, ninguém resolve');
-- A resolução pela API, com a evidência de outra oferta e depois com a própria.
set local role authenticated;
select pg_temp.entrar('X');
select pg_temp.api('{"x-audit-reason": "Regularização apresentada."}');
select throws_ok(
  $$update public.transfer_impediments set status = 'resolved', resolution_evidence_id = pg_temp.id('evidência PT')
    where id = pg_temp.id('impedimento I')$$,
  '23503', 'insert or update on table "transfer_impediments" violates foreign key constraint "transfer_impediments_evidencia_da_oferta_fkey"',
  'CT7.7 e CT11.14: a evidência de outra oferta não resolve o impedimento');
select is(
  pg_temp.resultado($$update public.transfer_impediments set status = 'resolved',
      resolution_evidence_id = pg_temp.id('evidência I') where id = pg_temp.id('impedimento I')$$),
  'linhas: 1',
  'contraste CT11.14: o administrador resolve com a evidência da própria oferta');
select pg_temp.api(null);
reset role;
select pg_temp.entrar(null);
set local role service_role;
select set_config('request.jwt.claims', '{"role": "service_role"}', true);
select throws_ok(
  $$update public.transfer_impediments set status = 'identified' where id = pg_temp.id('impedimento I')$$,
  '42501', 'permission denied for table transfer_impediments',
  'CT11.14: service_role não volta o impedimento a identificado');
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select to_jsonb(t) - array['status', 'resolved_by', 'resolved_at', 'resolution_reason', 'resolution_evidence_id']
     from public.transfer_impediments t where t.id = pg_temp.id('impedimento I')),
  (select g.linha - array['status', 'resolved_by', 'resolved_at', 'resolution_reason', 'resolution_evidence_id']
     from pg_temp.guardada g where g.nome = 'impedimento I'),
  'CT11.14: oferta, base, origem e data do impedimento continuam as mesmas');
select is(
  (select t.status || '/' || (t.resolved_by = pg_temp.id('X'))::text from public.transfer_impediments t
    where t.id = pg_temp.id('impedimento I')),
  'resolved/true',
  'CT11.14: a única mudança é a resolução, pelo administrador');

-- CT11.15: a auditoria das operações documentais não se altera (I0.6).
select is(
  (select a.action || '/' || (a.actor_profile_id = pg_temp.id('F1'))::text from public.audit_logs a
    where a.id = pg_temp.id('auditoria F1')),
  'vehicle_checks.insert/true',
  'preparo CT11.15: o registro da consulta de f1 está na auditoria');
set local role authenticated;
select pg_temp.entrar('F1');
select throws_ok(
  $$update public.audit_logs set metadata = '{}' where id = pg_temp.id('auditoria F1')$$,
  '42501', 'permission denied for table audit_logs',
  'CT11.15: f1 não altera a auditoria da própria consulta');
select throws_ok(
  $$delete from public.audit_logs where id = pg_temp.id('auditoria F1')$$,
  '42501', 'permission denied for table audit_logs',
  'CT11.15: nem a apaga');
reset role;
select pg_temp.entrar(null);
select throws_ok(
  $$update public.audit_logs set metadata = '{}' where id = pg_temp.id('auditoria F1')$$,
  'P0001', 'tabela só de inclusão: UPDATE não é permitido em public.audit_logs',
  'CT11.15: nem como postgres');
select throws_ok(
  $$delete from public.audit_logs where id = pg_temp.id('auditoria F1')$$,
  'P0001', 'tabela só de inclusão: DELETE não é permitido em public.audit_logs',
  'CT11.15: nem apagada como postgres');
select is(
  (select to_jsonb(a) from public.audit_logs a where a.id = pg_temp.id('auditoria F1')),
  (select g.linha from pg_temp.guardada g where g.nome = 'auditoria F1'),
  'CT11.15: a auditoria da consulta continua intacta');

select * from finish();
rollback;
