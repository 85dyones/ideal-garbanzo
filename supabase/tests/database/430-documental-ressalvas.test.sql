-- I3.9: ressalvas da revisão independente do Inc. 3 (I3.7; ADR-0004 §8).
--
-- Leitura das tabelas novas e do bucket das evidências só pela empresa dona e
-- pela equipe (R-I3.7-01), com a política de inclusão isolada do gatilho;
-- details pela trava de chaves (R-I3.7-02); a busca de linguagem com a
-- normalização do servidor e nos três gatilhos (R-I3.7-03); a lista que falha
-- fechada (R-I3.7-04); a categoria que sai da configuração (R-I3.7-05); as
-- sequências (R-I3.7-08); e o veículo da oferta por chave (R-I3.7-11).
begin;
select plan(36);
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
  values ($2, lower($1) || '-430@repasse-teste.invalid', now(),
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

select pg_temp.usuario('X', '43000000-0000-4000-8000-000000000001');
select pg_temp.usuario('O', '43000000-0000-4000-8000-000000000002');
select pg_temp.usuario('F1', '43000000-0000-4000-8000-000000000003');
select pg_temp.usuario('G1', '43000000-0000-4000-8000-000000000005');
select pg_temp.usuario('C1', '43000000-0000-4000-8000-000000000006');
select pg_temp.admin('X');
select pg_temp.conceder('O', 'operator', 'X');
select pg_temp.empresa('F', 'F1', 'X', '43000001000149', 'supplier');
select pg_temp.empresa('G', 'G1', 'X', '43000002000193', 'supplier');
select pg_temp.empresa('C', 'C1', 'X', '43000003000138', 'buyer');

-- R e S: rascunhos (S sem declaração). P: publicada, com consulta, evidência,
-- revisão e impedimento.
select pg_temp.oferta('R', 'F', 'F1');
select pg_temp.oferta('S', 'F', 'F1', false);
select pg_temp.oferta('P', 'F', 'F1');
select pg_temp.publicar('P', 'F1', 'O');
select pg_temp.evidencia_da_consulta('evidência P', 'P', 'O');
select pg_temp.evidencia_da_consulta('evidência X', 'P', 'X');
select pg_temp.consulta('c1', 'P', 'O', 'lien', 'no_occurrence_in_source', null, 'evidência P');
select pg_temp.consulta('c2', 'P', 'O', 'transfer_conditions', 'has_occurrence');
select pg_temp.revisao('P', 'auction', 'open_review', 'O');
select pg_temp.consulta('c3', 'S', 'O', 'casualty', 'has_occurrence');

-- R-I3.7-01: leitura das tabelas novas só pela empresa dona e pela equipe ----------------

set local role authenticated;
select pg_temp.entrar('G1');
select is(
  (select count(*)::int from public.vehicle_checks where offer_id = pg_temp.id('P'))
    + (select count(*)::int from public.check_evidence_files where offer_id = pg_temp.id('P'))
    + (select count(*)::int from public.documental_reviews where offer_id = pg_temp.id('P'))
    + (select count(*)::int from public.transfer_impediments where offer_id = pg_temp.id('P')),
  0,
  'R-I3.7-01: outra empresa não lê consulta, evidência, revisão nem impedimento');
select pg_temp.entrar('C1');
select is(
  (select count(*)::int from public.vehicle_checks where offer_id = pg_temp.id('P'))
    + (select count(*)::int from public.check_evidence_files where offer_id = pg_temp.id('P'))
    + (select count(*)::int from public.documental_reviews where offer_id = pg_temp.id('P'))
    + (select count(*)::int from public.transfer_impediments where offer_id = pg_temp.id('P')),
  0,
  'R-I3.7-01: o comprador também não lê, antes do catálogo (Inc. 4)');
select pg_temp.entrar('F1');
select ok(
  (select count(*) from public.vehicle_checks where offer_id = pg_temp.id('P')) = 2
    and (select count(*) from public.check_evidence_files where offer_id = pg_temp.id('P')) = 2
    and (select count(*) from public.documental_reviews where offer_id = pg_temp.id('P')) = 1
    and (select count(*) from public.transfer_impediments where offer_id = pg_temp.id('P')) = 1,
  'contraste R-I3.7-01: a empresa dona lê as quatro tabelas');
select pg_temp.entrar('O');
select ok(
  (select count(*) from public.vehicle_checks where offer_id = pg_temp.id('P')) = 2
    and (select count(*) from public.transfer_impediments where offer_id = pg_temp.id('P')) = 1,
  'contraste R-I3.7-01: a equipe lê');
select pg_temp.entrar('F1');
select is(
  (select count(*)::int from storage.objects where bucket_id = 'check-evidence'),
  0,
  'R-I3.7-01: nem a empresa dona lê o objeto da evidência pelo Storage (só pelo servidor)');
select pg_temp.entrar(null);
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok(
  $$select count(*) from public.vehicle_checks$$,
  '42501', 'permission denied for table vehicle_checks',
  'R-I3.7-01: o anon não lê consulta');
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select public from storage.buckets where id = 'check-evidence'),
  false,
  'R-I3.7-01: o bucket das evidências é privado');
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and cmd <> 'INSERT'
      and coalesce(qual, '') || coalesce(with_check, '') like '%check-evidence%'),
  0,
  'R-I3.7-01: o bucket das evidências não tem política de leitura, alteração nem exclusão');
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and coalesce(qual, '') || coalesce(with_check, '') not like '%bucket_id%'),
  0,
  'R-I3.7-01: nenhuma política de storage.objects vale para todos os buckets');

-- Camada da política de inclusão sozinha: gatilhos de proteção desligados só aqui.
alter table public.vehicle_checks disable trigger vehicle_checks_proteger;
alter table public.check_evidence_files disable trigger check_evidence_files_proteger;
alter table public.documental_reviews disable trigger documental_reviews_proteger;
set local role authenticated;
select pg_temp.entrar('G1');
select throws_ok(
  $$insert into public.vehicle_checks (offer_id, category, source_name, source_type, method, performed_at, result,
      result_summary, known_limitations)
    values (pg_temp.id('P'), 'lien', 'DETRAN-SP', 'official', 'manual', now(), 'no_occurrence_in_source',
      'Resumo.', 'Limitação.')$$,
  '42501', 'new row violates row-level security policy for table "vehicle_checks"',
  'R-I3.7-01 (política): outra empresa não registra consulta na oferta alheia');
select throws_ok(
  $$insert into public.check_evidence_files (offer_id, storage_path, sha256, content_type, size_bytes)
    values (pg_temp.id('P'), pg_temp.id('F') || '/' || pg_temp.id('P') || '/00000000-0000-4000-8000-0000000000f1.pdf',
      repeat('a', 64), 'application/pdf', 10)$$,
  '42501', 'new row violates row-level security policy for table "check_evidence_files"',
  'R-I3.7-01 (política): nem evidência');
select pg_temp.entrar('F1');
select pg_temp.api('{"x-audit-reason": "Motivo."}');
select throws_ok(
  $$insert into public.documental_reviews (offer_id, category, action, reason, actor)
    values (pg_temp.id('P'), 'lien', 'open_review', 'Motivo.', pg_temp.id('F1'))$$,
  '42501', 'permission denied for table documental_reviews',
  'R-I3.7-01 (política): o fornecedor não grava revisão, nem com as colunas do gatilho');
select throws_ok(
  $$insert into public.documental_reviews (offer_id, category, action)
    values (pg_temp.id('P'), 'lien', 'open_review')$$,
  '42501', 'new row violates row-level security policy for table "documental_reviews"',
  'R-I3.7-01 (política): o fornecedor não abre revisão pela API');
select pg_temp.api(null);
select pg_temp.entrar(null);
reset role;
alter table public.vehicle_checks enable trigger vehicle_checks_proteger;
alter table public.check_evidence_files enable trigger check_evidence_files_proteger;
alter table public.documental_reviews enable trigger documental_reviews_proteger;

-- R-I3.7-02: details pela trava de chaves, nos caminhos de dentro do banco ------------------
-- asserções a mais: 6 (o throws_ok da lista roda uma vez por linha)

select pg_temp.entrar('O');
select throws_ok(
  format($$insert into public.vehicle_checks (offer_id, category, source_name, source_type, method, performed_at,
      result, result_summary, known_limitations, details)
    values (%L, 'lien', 'DETRAN-SP', 'official', 'manual', now(), 'no_occurrence_in_source', 'Resumo.',
      'Limitação.', %L)$$, pg_temp.id('R'), d.valor),
  '23514', 'new row for relation "vehicle_checks" violates check constraint "vehicle_checks_sem_dado_pessoal"',
  'R-I3.7-02: chave recusada: ' || d.caso)
from (values
  ('composta sem separador', '{"cpfproprietario": "x"}'),
  ('composta em camelCase sem separador do identificador', '{"CPFProprietario": "x"}'),
  ('com hífen', '{"e-mail": "x"}'),
  ('no plural', '{"telefones": ["x"]}'),
  ('placa no plural', '{"placas": "x"}'),
  ('com sufixo numérico', '{"cpf1": "x"}'),
  ('em inglês, aninhada', '{"dados": {"owner": {"x": 1}}}')) as d(caso, valor);
select is(
  pg_temp.resultado(format($$insert into public.vehicle_checks (offer_id, category, source_name, source_type,
      method, performed_at, result, result_summary, known_limitations, details)
    values (%L, 'debts_fines', 'DETRAN-SP', 'official', 'manual', now() - interval '1 hour',
      'no_occurrence_in_source', 'Resumo.', 'Limitação.', '{"uf": "SP", "situacao": "regular", "fonte_oficial": true}')$$,
    pg_temp.id('R'))),
  'linhas: 1',
  'contraste R-I3.7-02: chaves neutras continuam aceitas');
select pg_temp.entrar(null);

-- R-I3.7-03: a busca do banco segue a normalização do servidor ---------------------------

select ok(
  private.termo_proibido('Sem ocorre' || chr(770) || 'ncias no DETRAN.') is not null,
  'R-I3.7-03: acento composto (marca combinante) não escapa da lista');
select ok(
  private.termo_proibido('verifi' || chr(847) || 'cado') is not null,
  'R-I3.7-03: marca invisível dentro da palavra não escapa');
select ok(
  private.termo_proibido('PROCEDÊNCIA GARANTIDA') is not null,
  'R-I3.7-03: maiúscula acentuada também');
select ok(
  private.termo_proibido('nada' || chr(160) || 'consta') is not null,
  'R-I3.7-03: espaço não separável entre as palavras também');
select ok(
  private.termo_proibido('x_verificado') is not null,
  'R-I3.7-03: o sublinhado é fronteira de palavra, como no servidor');
select ok(
  private.termo_proibido(E'Primeira linha limpa.\nnada consta') is not null,
  'R-I3.7-03: cada linha é conferida');
select ok(
  private.termo_proibido('Nada consta nas fontes consultadas, em 30/10/2026.') is null
    and private.termo_proibido('linguagem-permitida: nome do documento oficial; certificado de registro') is null
    and private.termo_proibido('Certificação do laudo; sem ocorrência conhecida.') is null
    and private.termo_proibido('nada_consta') is null,
  'contraste R-I3.7-03: qualificação, marcador, palavra parecida e termo colado por sublinhado passam');

set local role authenticated;
select pg_temp.entrar('O');
select pg_temp.api('{"x-audit-reason": "Documento garantido pelo fornecedor."}');
select throws_matching(
  $$insert into public.documental_reviews (offer_id, category, action) values (pg_temp.id('P'), 'lien', 'open_review')$$,
  'sem a qualificação exigida',
  'R-I3.7-03: o motivo da revisão passa pela lista');
select pg_temp.api('{"x-audit-reason": "Documento diverge da declaração."}');
select is(
  pg_temp.resultado($$insert into public.documental_reviews (offer_id, category, action)
    values (pg_temp.id('P'), 'lien', 'open_review')$$),
  'linhas: 1',
  'contraste R-I3.7-03: o motivo sem termo da lista entra');
select pg_temp.entrar('X');
select pg_temp.api('{"x-audit-reason": "Veículo livre de problemas."}');
select throws_matching(
  $$update public.transfer_impediments set status = 'resolved', resolution_evidence_id = pg_temp.id('evidência X')
    where offer_id = pg_temp.id('P')$$,
  'sem a qualificação exigida',
  'R-I3.7-03: o motivo da resolução do impedimento também');
select pg_temp.api('{"x-audit-reason": "Regularização apresentada."}');
select is(
  pg_temp.resultado($$update public.transfer_impediments set status = 'resolved', resolution_evidence_id = pg_temp.id('evidência X')
    where offer_id = pg_temp.id('P')$$),
  'linhas: 1',
  'contraste R-I3.7-03: a resolução com motivo sem termo da lista entra');
select pg_temp.api(null);
select pg_temp.entrar(null);
reset role;

-- R-I3.7-05: categoria que sai da configuração continua na ficha --------------------------

update public.platform_settings set value = value - 'casualty' where key = 'document_categories';
select is(
  (select state from private.estados_documentais_da_oferta(pg_temp.id('S')) where category = 'casualty'),
  'with_findings',
  'R-I3.7-05: a consulta com ocorrência numa categoria tirada da configuração continua na ficha');

-- R-I3.7-08 e R-I3.7-11 -------------------------------------------------------------------

select ok(
  not has_sequence_privilege('authenticated', 'public.vehicle_checks_seq_seq', 'USAGE')
    and not has_sequence_privilege('anon', 'public.vehicle_checks_seq_seq', 'USAGE')
    and not has_sequence_privilege('service_role', 'public.vehicle_checks_seq_seq', 'USAGE')
    and not has_sequence_privilege('authenticated', 'public.documental_reviews_seq_seq', 'USAGE')
    and not has_sequence_privilege('service_role', 'public.documental_reviews_seq_seq', 'USAGE'),
  'R-I3.7-08: as sequências de seq não têm privilégio para os papéis da API');

alter table public.vehicle_checks disable trigger vehicle_checks_proteger;
select throws_ok(
  $$insert into public.vehicle_checks (offer_id, vehicle_id, category, source_name, source_type, method, performed_at,
      performed_by, recorded_by, recorded_as, result, result_summary, known_limitations, is_test)
    values (pg_temp.id('P'), pg_temp.id('veículo R'), 'lien', 'DETRAN-SP', 'official', 'manual', now(),
      pg_temp.id('O'), pg_temp.id('O'), 'platform', 'no_occurrence_in_source', 'Resumo.', 'Limitação.', false)$$,
  '23503', 'insert or update on table "vehicle_checks" violates foreign key constraint "vehicle_checks_veiculo_da_oferta_fkey"',
  'R-I3.7-11: o veículo de outra oferta é recusado mesmo sem o gatilho');
alter table public.vehicle_checks enable trigger vehicle_checks_proteger;

-- R-I3.7-04: lista ausente ou fora do formato falha fechada (por último: muda a configuração) -

update public.platform_settings set value = '{}'::jsonb where key = 'forbidden_terms';
select throws_ok(
  $$select private.termo_proibido('texto qualquer')$$,
  'P0001', 'a lista de linguagem proibida (forbidden_terms) está ausente ou fora do formato',
  'R-I3.7-04: sem a lista, o texto não passa em silêncio');

select * from finish();
rollback;
