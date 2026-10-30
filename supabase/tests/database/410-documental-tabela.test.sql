-- I3.4: tabela de decisão do estado documental no banco (ADR-0004 §2.1 a
-- §2.5 e §3; anexo A.2, com a P1).
--
-- As 40 linhas do anexo A.2 entram como dados neste arquivo, escritas à mão,
-- e são gravadas de verdade: a declaração na sessão do fornecedor, a consulta
-- e a revisão na sessão do operador, com os gatilhos ligados. Uma oferta por
-- valor da declaração; em cada uma, uma categoria por combinação de consulta
-- e revisão. O estado de cada linha é conferido por private.estado_documental.
-- A linha 25 segue a P1: ocorrência declarada com consulta sem ocorrência,
-- sem revisão, fica com apontamentos.
--
-- Depois, os casos com mais de uma consulta vigente e com substituição (E1 a
-- E3, E7 e E8), os mesmos de rules/estados.decisao.test.ts, e as regras da
-- substituição (E3). O teste de integração estado-documental-paridade
-- compara o banco com rules/estados.ts nas mesmas linhas.
begin;
select plan(75);
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
  values ($2, lower($1) || '-410@repasse-teste.invalid', now(),
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

-- Oferta completa pela RPC criar_oferta, na sessão de quem cadastra. Com uma
-- declaração, o mesmo valor em todas as categorias (detalhe na ocorrência);
-- com null, nenhuma declaração.
create function pg_temp.oferta(nome text, empresa text, quem text, declaracao text) returns void
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
  if declaracao is not null then
    for categoria in
      select jsonb_array_elements_text(s.value) from public.platform_settings s where s.key = 'document_categories'
    loop
      insert into public.supplier_declarations (offer_id, category, declared_value, detail)
      values (novo, categoria, declaracao,
        case when declaracao = 'has_occurrence' then 'Ocorrência declarada pelo fornecedor.' end);
    end loop;
  end if;
  perform pg_temp.entrar(null);
end;
$f$;

-- Apoio da tabela de decisão ------------------------------------------------------------

-- Valor da declaração pela abreviação do anexo A.2 ('—' é a falta de declaração).
create function pg_temp.valor_declarado(abreviacao text) returns text
language sql immutable
as $f$
  select case $1 when 'nko' then 'no_known_occurrence' when 'dho' then 'has_occurrence' when 'unk' then 'unknown' end
$f$;

-- Categoria da linha n do anexo A.2 na sua oferta: as dez categorias da
-- configuração, na ordem, uma por combinação de consulta e revisão.
create function pg_temp.categoria(n integer) returns text
language sql stable
as $f$
  select s.value ->> (($1 - 1) % 10) from public.platform_settings s where s.key = 'document_categories'
$f$;

-- Declaração de uma categoria, na sessão do fornecedor.
create function pg_temp.declarar(oferta text, categoria text, abreviacao text) returns void
language plpgsql
as $f$
begin
  perform pg_temp.entrar('F1');
  insert into public.supplier_declarations (offer_id, category, declared_value, detail)
  values (pg_temp.id(oferta), categoria, pg_temp.valor_declarado(abreviacao),
    case when abreviacao = 'dho' then 'Ocorrência declarada pelo fornecedor.' end);
  perform pg_temp.entrar(null);
end;
$f$;

-- Consultas e revisão de uma categoria, na sessão do operador. As cadeias vêm
-- separadas por vírgula, uma por fonte; dentro da cadeia, "a > b" quer dizer
-- que b substitui a (E1 a E3). A revisão é a sequência de ações (E8):
-- 'aberta' abre; 'fechada' abre e fecha; 'reaberta' abre, fecha e abre.
-- Abreviação desconhecida deixa result nulo, e o arquivo falha.
create function pg_temp.gravar(oferta text, categoria text, cadeias text, revisao text) returns void
language plpgsql
as $f$
declare
  cadeia text;
  passo text;
  fonte integer := 0;
  anterior uuid;
  acao text;
begin
  perform pg_temp.entrar('O');
  foreach cadeia in array coalesce(string_to_array(cadeias, ','), '{}'::text[]) loop
    fonte := fonte + 1;
    anterior := null;
    foreach passo in array string_to_array(cadeia, '>') loop
      insert into public.vehicle_checks (offer_id, category, source_name, source_type, method, performed_at, result,
                                         result_summary, known_limitations, supersedes_check_id)
      values (pg_temp.id(oferta), categoria, 'Fonte ' || fonte, 'official', 'manual', now() - interval '1 hour',
              case btrim(passo) when 'aw' then 'awaiting_result' when 'nos' then 'no_occurrence_in_source'
                when 'cho' then 'has_occurrence' when 'inc' then 'inconclusive' end,
              'Resumo da consulta de teste.', 'A fonte cobre só a UF consultada.', anterior)
      returning id into anterior;
    end loop;
  end loop;
  if revisao is not null then
    perform pg_temp.api('{"x-audit-reason": "Revisão da tabela de decisão."}');
    foreach acao in array case revisao
        when 'aberta' then array['open_review']
        when 'fechada' then array['open_review', 'close_review']
        when 'reaberta' then array['open_review', 'close_review', 'open_review'] end loop
      insert into public.documental_reviews (offer_id, category, action) values (pg_temp.id(oferta), categoria, acao);
    end loop;
    perform pg_temp.api(null);
  end if;
  perform pg_temp.entrar(null);
end;
$f$;

-- Fixture ----------------------------------------------------------------------------

select pg_temp.usuario('X', '41000000-0000-4000-8000-000000000001');
select pg_temp.usuario('O', '41000000-0000-4000-8000-000000000002');
select pg_temp.usuario('F1', '41000000-0000-4000-8000-000000000003');
select pg_temp.usuario('F2', '41000000-0000-4000-8000-000000000004');
select pg_temp.admin('X');
select pg_temp.conceder('O', 'operator', 'X');
select pg_temp.empresa('F', 'F1', 'X', '41000001000113', 'supplier');
select pg_temp.vincular('F', 'F2', 'member', 'F1');

-- Anexo A.2, coluna "Estado"; linha 25 pela P1 (ADR-0004 §6). Declaração e
-- consulta pelas abreviações do anexo; '—' é a falta do registro.
create temporary table linha (
  n integer primary key,
  declaracao text not null,
  consulta text not null,
  revisao boolean not null,
  esperado text not null
);
insert into pg_temp.linha (n, declaracao, consulta, revisao, esperado) values
  (1, '—', '—', false, 'not_checked'),
  (2, '—', '—', true, 'under_review'),
  (3, '—', 'aw', false, 'pending'),
  (4, '—', 'aw', true, 'under_review'),
  (5, '—', 'nos', false, 'no_findings_in_sources'),
  (6, '—', 'nos', true, 'under_review'),
  (7, '—', 'cho', false, 'with_findings'),
  (8, '—', 'cho', true, 'under_review'),
  (9, '—', 'inc', false, 'pending'),
  (10, '—', 'inc', true, 'under_review'),
  (11, 'nko', '—', false, 'declared_unverified'),
  (12, 'nko', '—', true, 'under_review'),
  (13, 'nko', 'aw', false, 'pending'),
  (14, 'nko', 'aw', true, 'under_review'),
  (15, 'nko', 'nos', false, 'no_findings_in_sources'),
  (16, 'nko', 'nos', true, 'under_review'),
  (17, 'nko', 'cho', false, 'under_review'),
  (18, 'nko', 'cho', true, 'under_review'),
  (19, 'nko', 'inc', false, 'pending'),
  (20, 'nko', 'inc', true, 'under_review'),
  (21, 'dho', '—', false, 'with_findings'),
  (22, 'dho', '—', true, 'under_review'),
  (23, 'dho', 'aw', false, 'with_findings'),
  (24, 'dho', 'aw', true, 'under_review'),
  (25, 'dho', 'nos', false, 'with_findings'),
  (26, 'dho', 'nos', true, 'under_review'),
  (27, 'dho', 'cho', false, 'with_findings'),
  (28, 'dho', 'cho', true, 'under_review'),
  (29, 'dho', 'inc', false, 'with_findings'),
  (30, 'dho', 'inc', true, 'under_review'),
  (31, 'unk', '—', false, 'not_checked'),
  (32, 'unk', '—', true, 'under_review'),
  (33, 'unk', 'aw', false, 'pending'),
  (34, 'unk', 'aw', true, 'under_review'),
  (35, 'unk', 'nos', false, 'no_findings_in_sources'),
  (36, 'unk', 'nos', true, 'under_review'),
  (37, 'unk', 'cho', false, 'with_findings'),
  (38, 'unk', 'cho', true, 'under_review'),
  (39, 'unk', 'inc', false, 'pending'),
  (40, 'unk', 'inc', true, 'under_review');

-- Uma oferta em rascunho por valor da declaração, com a declaração em todas as
-- categorias (ou nenhuma).
select pg_temp.oferta('decl —', 'F', 'F1', null);
select pg_temp.oferta('decl nko', 'F', 'F1', 'no_known_occurrence');
select pg_temp.oferta('decl dho', 'F', 'F1', 'has_occurrence');
select pg_temp.oferta('decl unk', 'F', 'F1', 'unknown');
select pg_temp.gravar('decl ' || l.declaracao, pg_temp.categoria(l.n), nullif(l.consulta, '—'),
                      case when l.revisao then 'aberta' end)
from pg_temp.linha l
order by l.n;

-- As 40 linhas do anexo A.2 -----------------------------------------------------------

select is(
  (select jsonb_array_length(s.value) from public.platform_settings s where s.key = 'document_categories'),
  10,
  'preparo: dez categorias, uma por combinação de consulta e revisão em cada oferta');
select is(
  (select count(*)::int from (select distinct l.declaracao, l.consulta, l.revisao from pg_temp.linha l) d),
  40,
  'preparo: as 40 combinações do anexo A.2, cada uma uma vez');
select is(
  private.estado_documental(pg_temp.id('decl ' || l.declaracao), pg_temp.categoria(l.n)),
  l.esperado,
  format('linha %s (%s): declaração %s, consulta %s, %s', l.n, pg_temp.categoria(l.n), l.declaracao, l.consulta,
    case when l.revisao then 'com revisão aberta' else 'sem revisão' end)
    || case when l.n = 25 then ' (P1: sem divergência)' else '' end)
from pg_temp.linha l
order by l.n;
select is(
  array(select l.n from pg_temp.linha l
        where private.estado_documental(pg_temp.id('decl ' || l.declaracao), pg_temp.categoria(l.n))
              = 'no_findings_in_sources'
        order by l.n),
  array[5, 15, 35],
  'teste 10: sem apontamentos nas fontes consultadas só nas linhas 5, 15 e 35, todas com consulta registrada');
select is(
  (select count(*)::int from pg_temp.linha l
    where private.estado_documental(pg_temp.id('decl ' || l.declaracao), pg_temp.categoria(l.n))
          <> private.estado_pela_declaracao(pg_temp.valor_declarado(l.declaracao))),
  32,
  'em relação ao Inc. 2, só pela declaração, mudam 32 linhas (ADR-0004 §2.1)');

-- Mais de uma consulta vigente e substituição (E1 a E3, E7 e E8) -------------------------
-- Os mesmos casos de rules/estados.decisao.test.ts, com o estado calculado à mão.

create temporary table caso (
  id text primary key,
  oferta text not null,
  categoria text not null,
  declaracao text not null,
  cadeias text not null,
  revisao text,
  esperado text not null,
  regra text not null
);
insert into pg_temp.caso (id, oferta, categoria, declaracao, cadeias, revisao, esperado, regra) values
  ('A1', 'várias A', 'debts_ipva', 'nko', 'nos, cho', null, 'under_review',
   'E1 e R4b: duas fontes vigentes, uma com ocorrência, é divergência'),
  ('A2', 'várias A', 'debts_licensing', 'nko', 'nos, aw', null, 'pending',
   'E1: uma fonte aguardando deixa a categoria pendente'),
  ('A3', 'várias A', 'debts_fines', 'nko', 'nos, nos', null, 'no_findings_in_sources',
   'E1: todas as vigentes sem ocorrência'),
  ('A4', 'várias A', 'administrative_restrictions', 'nko', 'nos > aw', null, 'pending',
   'E2 e E3: a sem ocorrência substituída deixa de contar'),
  ('A5', 'várias A', 'judicial_restrictions', 'nko', 'aw > nos', null, 'no_findings_in_sources',
   'E2: a aguardando substituída pelo resultado deixa de ser pendente'),
  ('A6', 'várias A', 'lien', 'nko', 'aw > cho', null, 'under_review',
   'E2 e R4b: o resultado com ocorrência substitui a aguardando'),
  ('A7', 'várias A', 'theft_recovery', 'nko', 'cho > nos', null, 'no_findings_in_sources',
   'E7: a consulta nova que concorda acaba a divergência'),
  ('A8', 'várias A', 'casualty', 'dho', 'nos, nos', null, 'with_findings',
   'P1: duas fontes sem ocorrência não desfazem a ocorrência declarada'),
  ('A9', 'várias A', 'auction', 'unk', 'cho > nos', null, 'no_findings_in_sources',
   'E3: a consulta com ocorrência substituída não conta'),
  ('A10', 'várias A', 'transfer_conditions', 'unk', 'inc, nos', null, 'pending',
   'E1: inconclusiva e sem ocorrência ficam pendentes'),
  ('B1', 'várias B', 'debts_ipva', 'unk', 'inc, nos', 'aberta', 'under_review',
   'R4a: com revisão aberta, em análise'),
  ('B2', 'várias B', 'debts_licensing', '—', 'aw > inc > nos', null, 'no_findings_in_sources',
   'E3: numa cadeia de três, só a última conta'),
  ('B3', 'várias B', 'debts_fines', '—', 'nos, inc > cho', null, 'with_findings',
   'E1 e E3: a segunda fonte foi substituída por uma com ocorrência'),
  ('B4', 'várias B', 'administrative_restrictions', 'unk', 'nos > cho', null, 'with_findings',
   'E5: desconhece não diverge da consulta com ocorrência'),
  ('B5', 'várias B', 'judicial_restrictions', 'nko', 'nos, cho > nos', null, 'no_findings_in_sources',
   'E1 e E3: a ocorrência substituída de uma das fontes não conta'),
  ('B6', 'várias B', 'lien', 'dho', 'cho, nos', null, 'with_findings',
   'P1 e E6: ocorrência declarada com duas fontes não é divergência'),
  ('B7', 'várias B', 'theft_recovery', 'nko', 'nos, nos', 'aberta', 'under_review',
   'R4a: a R6 cai com a revisão aberta'),
  ('B8', 'várias B', 'casualty', 'nko', 'inc, inc', null, 'pending',
   'R3: duas inconclusivas'),
  ('B9', 'várias B', 'auction', '—', 'nos, nos, nos', null, 'no_findings_in_sources',
   'E1: três fontes sem ocorrência, sem declaração'),
  ('B10', 'várias B', 'transfer_conditions', 'nko', 'nos > nos, aw', null, 'pending',
   'E1 e E3: a substituta sem ocorrência e outra fonte aguardando'),
  ('C1', 'várias C', 'debts_ipva', 'nko', 'cho', 'fechada', 'under_review',
   'E7: fechar a revisão não desfaz a divergência'),
  ('C2', 'várias C', 'debts_licensing', '—', 'nos', 'fechada', 'no_findings_in_sources',
   'E8: fechada a revisão, a R6 volta'),
  ('C3', 'várias C', 'debts_fines', 'unk', 'nos', 'reaberta', 'under_review',
   'E8: a última ação é abrir');

select pg_temp.oferta('várias A', 'F', 'F1', null);
select pg_temp.oferta('várias B', 'F', 'F1', null);
select pg_temp.oferta('várias C', 'F', 'F1', null);
select pg_temp.declarar(c.oferta, c.categoria, c.declaracao)
from pg_temp.caso c
where c.declaracao <> '—'
order by c.id;
select pg_temp.gravar(c.oferta, c.categoria, c.cadeias, c.revisao)
from pg_temp.caso c
order by c.id;

select is(
  private.estado_documental(pg_temp.id(c.oferta), c.categoria),
  c.esperado,
  format('%s: declaração %s, consultas "%s"%s; %s', c.id, c.declaracao, c.cadeias,
    case when c.revisao is null then '' else ', revisão ' || c.revisao end, c.regra))
from pg_temp.caso c
order by left(c.id, 1), substr(c.id, 2)::integer;

-- Regras da substituição (E3) -----------------------------------------------------------

-- A consulta vigente de C2 (sem ocorrência, em debts_licensing) e a primeira
-- da cadeia de A4, que a segunda já substituiu.
insert into pg_temp.fixture
select 'vigente C2', c.id from public.vehicle_checks c
where c.offer_id = pg_temp.id('várias C') and c.category = 'debts_licensing';
insert into pg_temp.fixture
select 'substituída A4', c.supersedes_check_id from public.vehicle_checks c
where c.offer_id = pg_temp.id('várias A') and c.category = 'administrative_restrictions'
  and c.supersedes_check_id is not null;

select pg_temp.entrar('O');
select throws_ok(
  $$insert into public.vehicle_checks (offer_id, category, source_name, source_type, method, performed_at, result,
      result_summary, known_limitations, supersedes_check_id)
    values (pg_temp.id('várias C'), 'debts_fines', 'Fonte 1', 'official', 'manual', now() - interval '1 hour',
      'has_occurrence', 'Resumo.', 'A fonte cobre só a UF consultada.', pg_temp.id('vigente C2'))$$,
  '23503', 'insert or update on table "vehicle_checks" violates foreign key constraint "vehicle_checks_substitui_da_mesma_oferta_fkey"',
  'E3: a consulta não substitui consulta de outra categoria');
select throws_ok(
  $$insert into public.vehicle_checks (offer_id, category, source_name, source_type, method, performed_at, result,
      result_summary, known_limitations, supersedes_check_id)
    values (pg_temp.id('várias A'), 'administrative_restrictions', 'Fonte 1', 'official', 'manual',
      now() - interval '1 hour', 'no_occurrence_in_source', 'Resumo.', 'A fonte cobre só a UF consultada.',
      pg_temp.id('substituída A4'))$$,
  '23505', 'duplicate key value violates unique constraint "vehicle_checks_supersedes_check_id_key"',
  'E3: a consulta já substituída não é substituída de novo (só a vigente)');
select is(
  pg_temp.resultado($$insert into public.vehicle_checks (offer_id, category, source_name, source_type, method,
      performed_at, result, result_summary, known_limitations, supersedes_check_id)
    values (pg_temp.id('várias C'), 'debts_licensing', 'Fonte 1', 'official', 'manual', now() - interval '1 hour',
      'has_occurrence', 'Resumo.', 'A fonte cobre só a UF consultada.', pg_temp.id('vigente C2'))$$),
  'linhas: 1',
  'contraste E3: a mesma substituição, na categoria da consulta vigente, é aceita');
select pg_temp.entrar(null);
select is(private.estado_documental(pg_temp.id('várias C'), 'debts_licensing'), 'with_findings',
  'contraste E3: a substituta passa a valer, e a substituída deixa de contar');

-- O fornecedor substitui consulta da própria empresa, de outro membro; a
-- plataforma substitui consulta do fornecedor (ADR-0004 §2.3).
select pg_temp.entrar('F2');
insert into public.vehicle_checks (offer_id, category, source_name, source_type, method, performed_at, result,
                                   result_summary, known_limitations)
values (pg_temp.id('várias C'), 'judicial_restrictions', 'Portal do tribunal', 'official', 'manual',
        now() - interval '2 hours', 'no_occurrence_in_source', 'Sem processo na consulta.',
        'A fonte cobre só o tribunal consultado.');
select pg_temp.entrar(null);
insert into pg_temp.fixture
select 'consulta F2', c.id from public.vehicle_checks c
where c.offer_id = pg_temp.id('várias C') and c.category = 'judicial_restrictions';

select pg_temp.entrar('F1');
select is(
  pg_temp.resultado($$insert into public.vehicle_checks (offer_id, category, source_name, source_type, method,
      performed_at, result, result_summary, known_limitations, supersedes_check_id)
    values (pg_temp.id('várias C'), 'judicial_restrictions', 'Portal do tribunal', 'official', 'manual',
      now() - interval '1 hour', 'awaiting_result', 'Consulta refeita, aguardando.',
      'A fonte cobre só o tribunal consultado.', pg_temp.id('consulta F2'))$$),
  'linhas: 1',
  'E3: o org_admin substitui consulta registrada por outro membro da mesma empresa');
select pg_temp.entrar(null);
insert into pg_temp.fixture
select 'consulta F1', c.id from public.vehicle_checks c
where c.supersedes_check_id = pg_temp.id('consulta F2');
select is(
  (select array_agg(c.recorded_as order by c.seq) from public.vehicle_checks c
    where c.id in (pg_temp.id('consulta F2'), pg_temp.id('consulta F1'))),
  array['supplier', 'supplier'],
  'E3: as duas consultas são do fornecedor');

select pg_temp.entrar('O');
select is(
  pg_temp.resultado($$insert into public.vehicle_checks (offer_id, category, source_name, source_type, method,
      performed_at, result, result_summary, known_limitations, supersedes_check_id)
    values (pg_temp.id('várias C'), 'judicial_restrictions', 'Portal do tribunal', 'official', 'manual',
      now() - interval '30 minutes', 'no_occurrence_in_source', 'Resultado da consulta refeita.',
      'A fonte cobre só o tribunal consultado.', pg_temp.id('consulta F1'))$$),
  'linhas: 1',
  'E3: a equipe da plataforma substitui consulta registrada pelo fornecedor');
select pg_temp.entrar(null);
select is(private.estado_documental(pg_temp.id('várias C'), 'judicial_restrictions'), 'no_findings_in_sources',
  'E2 e E3: na cadeia de três autores, só a última conta, e a pendente substituída deixa de ser pendente');

select * from finish();
rollback;
