-- I2.5: estado documental a partir das declarações (especificação v1.1, §6.4
-- e §6.5; ADR-0003 §2.6 e §2.12).
--
-- A função que calcula estado e origem por categoria é a mesma do snapshot e
-- da RPC da tela. No Inc. 2 só as declarações contam; a precedência já está
-- pronta para os candidatos do Inc. 3 (consultas, revisões, impedimentos).
begin;
select plan(22);
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
  values ($2, lower($1) || '-350@repasse-teste.invalid', now(),
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

select pg_temp.usuario('X', '35000000-0000-4000-8000-000000000001');
select pg_temp.usuario('O', '35000000-0000-4000-8000-000000000002');
select pg_temp.usuario('F1', '35000000-0000-4000-8000-000000000003');
select pg_temp.usuario('F2', '35000000-0000-4000-8000-000000000004');
select pg_temp.usuario('G1', '35000000-0000-4000-8000-000000000005');
select pg_temp.admin('X');
select pg_temp.conceder('O', 'operator', 'X');
select pg_temp.empresa('F', 'F1', 'X', '35000001000110', 'supplier');
select pg_temp.empresa('G', 'G1', 'X', '35000002000165', 'supplier');
select pg_temp.vincular('F', 'F2', 'member', 'F1');

-- N: sem declaração. R: apontamento em auction, "sem ocorrência conhecida" em
-- lien e "desconhece" nas demais (pg_temp.oferta).
select pg_temp.oferta('N', 'F', 'F2', false);
select pg_temp.oferta('R', 'F', 'F1');

-- Regras da §6.4 --------------------------------------------------------------------

select is(
  array(select e from unnest(array['not_checked', 'declared_unverified', 'pending', 'under_review',
                                   'with_findings', 'no_findings_in_sources']) as e
        order by private.precedencia_documental(e) desc),
  array['under_review', 'with_findings', 'pending', 'no_findings_in_sources', 'declared_unverified', 'not_checked'],
  'precedência da §6.4');
select is(
  array[private.aviso_do_estado('not_checked'), private.aviso_do_estado('declared_unverified'),
        private.aviso_do_estado('with_findings'), private.aviso_do_estado('pending'),
        private.aviso_do_estado('under_review'), private.aviso_do_estado('no_findings_in_sources')],
  array['categoria_nao_consultada.v1', 'declaracao_sem_comprovacao.v1', 'categoria_com_apontamentos.v1',
        'categoria_pendente.v1', 'categoria_em_analise.v1', 'sem_apontamentos_nas_fontes_consultadas.v1'],
  'ressalvas de todos os estados (a I3.3 acrescentou os três que dependem de consulta e revisão)');
select is(
  (select count(*)::int from information_schema.columns
    where table_schema = 'public' and column_name in ('state', 'documental_state')),
  0,
  '§6.4: nenhuma tabela guarda o estado documental; ele é calculado');

-- Estados a partir das declarações --------------------------------------------------------

select is(private.estado_documental(pg_temp.id('N'), 'auction'), 'not_checked',
  'B29: sem declaração, a categoria fica como não consultada');
select is(
  (select count(*)::int from private.estados_documentais_da_oferta(pg_temp.id('N'))
    where state = 'not_checked' and origin = 'unconfirmed' and declared_value is null),
  10,
  '§6.5: sem declaração, as dez categorias aparecem como não confirmadas');
select is(
  (select state || '/' || origin || '/' || declared_value
     from private.estados_documentais_da_oferta(pg_temp.id('R')) where category = 'auction'),
  'with_findings/supplier_declaration/has_occurrence',
  '§6.4: ocorrência declarada dá "com apontamentos", com a origem "declarada pelo fornecedor"');
select is(
  (select state from private.estados_documentais_da_oferta(pg_temp.id('R')) where category = 'lien'),
  'declared_unverified',
  '§6.4: "sem ocorrência conhecida" dá "informação declarada, sem comprovação"');
select is(
  (select state || '/' || origin from private.estados_documentais_da_oferta(pg_temp.id('R'))
    where category = 'debts_ipva'),
  'not_checked/supplier_declaration',
  '§6.4: "desconhece" dá "não consultado", e a origem continua sendo a declaração');

-- Quem lê (RPC public.estados_documentais) -------------------------------------------------

set local role authenticated;
select pg_temp.entrar('F2');
select is((select count(*)::int from public.estados_documentais(pg_temp.id('R'))), 10,
  'contraste: a empresa dona lê os estados das dez categorias');
select pg_temp.entrar('O');
select is((select count(*)::int from public.estados_documentais(pg_temp.id('R'))), 10,
  'contraste: o operador lê os estados');
select pg_temp.entrar('G1');
select throws_ok(
  $$select * from public.estados_documentais(pg_temp.id('R'))$$,
  '42501', 'sem permissão',
  'outra empresa não lê os estados da oferta alheia');
select throws_ok(
  $$select * from public.estados_documentais(gen_random_uuid())$$,
  '42501', 'sem permissão',
  'e a resposta é a mesma para id inexistente');
reset role;
select pg_temp.entrar(null);
select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select throws_ok(
  $$select * from public.estados_documentais(gen_random_uuid())$$,
  '42501', 'permission denied for function estados_documentais',
  'anônimo não chama a RPC');
reset role;
select set_config('request.jwt.claims', '', true);
select ok(not has_function_privilege('authenticated', 'private.estado_documental(uuid, text)', 'EXECUTE'),
  'usuário não chama o cálculo por categoria direto');

-- A declaração vigente é a mais recente ------------------------------------------------------

select pg_temp.entrar('F1');
insert into public.supplier_declarations (offer_id, category, declared_value)
values (pg_temp.id('R'), 'auction', 'no_known_occurrence');
select pg_temp.entrar(null);
select is(private.estado_documental(pg_temp.id('R'), 'auction'), 'declared_unverified',
  '§5.3: a declaração mais recente é a vigente');
select pg_temp.entrar('F1');
insert into public.supplier_declarations (offer_id, category, declared_value, detail)
values (pg_temp.id('R'), 'auction', 'has_occurrence', 'Leilão em 2023, com laudo.');
select pg_temp.entrar(null);
select is(private.estado_documental(pg_temp.id('R'), 'auction'), 'with_findings',
  '§5.3: a vigente é a mais recente, não a mais grave já declarada');

-- O snapshot usa os mesmos estados -----------------------------------------------------------

select ok(
  (select bool_and(v.material_snapshot -> 'categories' -> e.category ->> 'state' = e.state)
     from public.offers o
     join public.offer_versions v on v.offer_id = o.id and v.version_number = o.current_version,
     private.estados_documentais_da_oferta(o.id) e
    where o.id = pg_temp.id('R')),
  'o snapshot da versão vigente registra os estados que a tela mostra');
select is(
  (select v.material_snapshot -> 'notices' from public.offers o
     join public.offer_versions v on v.offer_id = o.id and v.version_number = o.current_version
    where o.id = pg_temp.id('R')),
  '["categoria_com_apontamentos.v1", "categoria_nao_consultada.v1", "declaracao_sem_comprovacao.v1"]'::jsonb,
  'as ressalvas do snapshot saem dos mesmos estados');
select ok(
  (select bool_and(v.snapshot_hash = private.hash_do_snapshot(v.material_snapshot))
     from public.offer_versions v where v.offer_id in (pg_temp.id('N'), pg_temp.id('R'))),
  'os hashes das versões continuam conferindo');

-- Mudanças na lista de categorias valem para frente -------------------------------------------

select pg_temp.entrar('X');
update public.platform_settings
set value = value - 'auction'
where key = 'document_categories';
select pg_temp.entrar(null);
select is(
  (select state from private.estados_documentais_da_oferta(pg_temp.id('R')) where category = 'auction'),
  'with_findings',
  'remover a categoria da configuração não esconde o que foi declarado');
select is((select count(*)::int from private.estados_documentais_da_oferta(pg_temp.id('N'))), 9,
  'oferta sem declaração na categoria removida deixa de listá-la');
select pg_temp.entrar('X');
update public.platform_settings
set value = value || '["auction", "chassis_condition"]'::jsonb
where key = 'document_categories';
select pg_temp.entrar(null);
select is(
  (select state || '/' || origin from private.estados_documentais_da_oferta(pg_temp.id('R'))
    where category = 'chassis_condition'),
  'not_checked/unconfirmed',
  'categoria nova aparece como não consultada e não confirmada (B29)');

select * from finish();
rollback;
