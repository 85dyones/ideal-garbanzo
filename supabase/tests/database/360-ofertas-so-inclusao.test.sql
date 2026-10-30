-- I2.7: teste 11 sistemático, registros só de inclusão do Inc. 2 (ADR-0003
-- §2.1, §2.6, §2.8 e §2.12; anexo A.6, CT11.1 a CT11.7).
--
-- Para cada tabela só de inclusão da oferta (supplier_declarations,
-- offer_versions, offer_documents e offer_reviews) e para as linhas de
-- field_history e audit_logs geradas por uma operação de oferta: UPDATE,
-- DELETE e TRUNCATE recusados para o dono (org_admin da empresa), o
-- administrador da plataforma, service_role e postgres. As linhas são
-- conferidas intactas no fim. Para authenticated e service_role, quem recusa
-- é o privilégio; para postgres, dono das tabelas, é o gatilho de só inclusão
-- (a mutação "gatilho desligado" cai nos casos de postgres). Contraste: a
-- inclusão continua funcionando.
begin;
select plan(99);
set constraints all immediate;

-- Apoio do arquivo (objetos temporários, desfeitos no rollback) -------------------

create temporary table fixture (nome text primary key, id uuid not null);
grant select on pg_temp.fixture to authenticated, anon, service_role;

-- Cópia de cada linha de registro, tirada no preparo, para conferir que nada mudou.
create temporary table guardada (nome text primary key, linha jsonb not null);
grant select on pg_temp.guardada to authenticated;

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

grant execute on function pg_temp.id(text), pg_temp.entrar(text) to authenticated, anon, service_role;

create function pg_temp.usuario(nome text, id uuid) returns void
language sql
as $f$
  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data, aud, role)
  values ($2, lower($1) || '-360@repasse-teste.invalid', now(),
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

-- Envio e publicação pela plataforma (revisão exigida): a publicação grava a
-- decisão em offer_reviews.
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

-- Fixture ----------------------------------------------------------------------------

select pg_temp.usuario('X', '36000000-0000-4000-8000-000000000001');
select pg_temp.usuario('O', '36000000-0000-4000-8000-000000000002');
select pg_temp.usuario('F1', '36000000-0000-4000-8000-000000000003');
select pg_temp.usuario('F2', '36000000-0000-4000-8000-000000000004');
select pg_temp.admin('X');
select pg_temp.conceder('O', 'operator', 'X');
select pg_temp.empresa('F', 'F1', 'X', '36000001000183', 'supplier');
select pg_temp.vincular('F', 'F2', 'member', 'F1');

-- P: publicada pelo caminho da revisão (o operador publica a oferta em
-- under_review), com um documento e uma mudança de preço do org_admin, que
-- grava versão, histórico e auditoria.
select pg_temp.oferta('P', 'F', 'F1');
select pg_temp.publicar('P', 'F1', 'O');
select pg_temp.documento('DP', 'P', 'F1');
select pg_temp.entrar('F1');
select public.atualizar_oferta(pg_temp.id('P'), '{}', '{"asking_price": "47000.00"}');
select pg_temp.entrar(null);

-- Uma linha de cada registro, gerada pelas operações acima.
insert into pg_temp.fixture
select 'declaração', d.id from public.supplier_declarations d
where d.offer_id = pg_temp.id('P') and d.category = 'lien';
insert into pg_temp.fixture
select 'versão 1', v.id from public.offer_versions v
where v.offer_id = pg_temp.id('P') and v.version_number = 1;
insert into pg_temp.fixture
select 'revisão', r.id from public.offer_reviews r
where r.offer_id = pg_temp.id('P') and r.decision = 'published';
insert into pg_temp.fixture
select 'histórico', h.id from public.field_history h
where h.entity_type = 'offers' and h.entity_id = pg_temp.id('P') and h.field = 'asking_price';
insert into pg_temp.fixture
select 'auditoria', a.id from public.audit_logs a
where a.entity_type = 'offers' and a.entity_id = pg_temp.id('P') and a.action = 'offers.update'
  and a.metadata -> 'campos' ? 'asking_price';

insert into pg_temp.guardada
select 'declaração', to_jsonb(d) from public.supplier_declarations d where d.id = pg_temp.id('declaração')
union all
select 'versão 1', to_jsonb(v) from public.offer_versions v where v.id = pg_temp.id('versão 1')
union all
select 'DP', to_jsonb(t) from public.offer_documents t where t.id = pg_temp.id('DP')
union all
select 'revisão', to_jsonb(r) from public.offer_reviews r where r.id = pg_temp.id('revisão')
union all
select 'histórico', to_jsonb(h) from public.field_history h where h.id = pg_temp.id('histórico')
union all
select 'auditoria', to_jsonb(a) from public.audit_logs a where a.id = pg_temp.id('auditoria');

select is(
  (select array_agg(nome order by nome collate "C") from pg_temp.guardada),
  array['DP', 'auditoria', 'declaração', 'histórico', 'revisão', 'versão 1'],
  'preparo: uma linha de cada registro da oferta, inclusive a revisão');

-- CT11.1, CT11.2, CT11.5, CT11.6 e CT11.7: o dono (org_admin, authenticated) ----------

set local role authenticated;
select pg_temp.entrar('F1');
select throws_ok(
  $$update public.supplier_declarations set declared_value = 'unknown' where id = pg_temp.id('declaração')$$,
  '42501', 'permission denied for table supplier_declarations',
  'CT11.1: o dono não altera o valor da declaração');
select throws_ok(
  $$delete from public.supplier_declarations where id = pg_temp.id('declaração')$$,
  '42501', 'permission denied for table supplier_declarations',
  'CT11.2: o dono não apaga a declaração');
select throws_ok(
  $$truncate public.supplier_declarations$$,
  '42501', 'permission denied for table supplier_declarations',
  'CT11.2: o dono não esvazia as declarações');
select throws_ok(
  $$update public.offer_versions set snapshot_hash = repeat('0', 64) where id = pg_temp.id('versão 1')$$,
  '42501', 'permission denied for table offer_versions',
  'CT11.1: o dono não altera o hash da versão');
select throws_ok(
  $$delete from public.offer_versions where id = pg_temp.id('versão 1')$$,
  '42501', 'permission denied for table offer_versions',
  'CT11.2: o dono não apaga a versão');
select throws_ok(
  $$truncate public.offer_versions$$,
  '42501', 'permission denied for table offer_versions',
  'CT11.2: o dono não esvazia as versões');
select throws_ok(
  $$update public.offer_documents set storage_path = 'x' where id = pg_temp.id('DP')$$,
  '42501', 'permission denied for table offer_documents',
  'CT11.1: o dono não altera o caminho do documento');
select throws_ok(
  $$delete from public.offer_documents where id = pg_temp.id('DP')$$,
  '42501', 'permission denied for table offer_documents',
  'CT11.2: o dono não apaga o documento');
select throws_ok(
  $$truncate public.offer_documents$$,
  '42501', 'permission denied for table offer_documents',
  'CT11.2: o dono não esvazia os documentos');
select throws_ok(
  $$update public.offer_reviews set reason = 'x' where id = pg_temp.id('revisão')$$,
  '42501', 'permission denied for table offer_reviews',
  'CT11.1: o dono não altera a revisão');
select throws_ok(
  $$delete from public.offer_reviews where id = pg_temp.id('revisão')$$,
  '42501', 'permission denied for table offer_reviews',
  'CT11.2: o dono não apaga a revisão');
select throws_ok(
  $$truncate public.offer_reviews$$,
  '42501', 'permission denied for table offer_reviews',
  'CT11.2: o dono não esvazia as revisões');
select throws_ok(
  $$update public.field_history set new_value = '1' where id = pg_temp.id('histórico')$$,
  '42501', 'permission denied for table field_history',
  'CT11.7: o dono não altera o histórico do preço');
select throws_ok(
  $$delete from public.field_history where id = pg_temp.id('histórico')$$,
  '42501', 'permission denied for table field_history',
  'CT11.7: o dono não apaga o histórico do preço');
select throws_ok(
  $$truncate public.field_history$$,
  '42501', 'permission denied for table field_history',
  'CT11.7: o dono não esvazia o histórico');
select throws_ok(
  $$update public.audit_logs set metadata = '{}' where id = pg_temp.id('auditoria')$$,
  '42501', 'permission denied for table audit_logs',
  'CT11.7: o dono não altera a auditoria da mudança de preço');
select throws_ok(
  $$delete from public.audit_logs where id = pg_temp.id('auditoria')$$,
  '42501', 'permission denied for table audit_logs',
  'CT11.7: o dono não apaga a auditoria');
select throws_ok(
  $$truncate public.audit_logs$$,
  '42501', 'permission denied for table audit_logs',
  'CT11.7: o dono não esvazia a auditoria');
select throws_ok(
  $$insert into public.offer_versions (offer_id, version_number, material_snapshot, snapshot_hash, change_summary)
    select offer_id, version_number, material_snapshot, snapshot_hash, 'cópia' from public.offer_versions
    where id = pg_temp.id('versão 1')$$,
  '42501', 'permission denied for table offer_versions',
  'CT11.6: o dono não grava versão, nem com version_number repetido');
select throws_ok(
  $$delete from public.offers where id = pg_temp.id('P')$$,
  '42501', 'permission denied for table offers',
  'CT11.5: o dono não apaga a oferta com registros ligados');
select throws_ok(
  $$delete from public.vehicles where id = pg_temp.id('veículo P')$$,
  '42501', 'permission denied for table vehicles',
  'CT11.5: o dono não apaga o veículo da oferta');

-- CT11.3 e CT11.5: o administrador da plataforma ------------------------------------------

select pg_temp.entrar('X');
select throws_ok(
  $$update public.supplier_declarations set detail = 'x' where id = pg_temp.id('declaração')$$,
  '42501', 'permission denied for table supplier_declarations',
  'CT11.3: o administrador não altera a declaração');
select throws_ok(
  $$delete from public.supplier_declarations where id = pg_temp.id('declaração')$$,
  '42501', 'permission denied for table supplier_declarations',
  'CT11.3: o administrador não apaga a declaração');
select throws_ok(
  $$truncate public.supplier_declarations$$,
  '42501', 'permission denied for table supplier_declarations',
  'CT11.3: o administrador não esvazia as declarações');
select throws_ok(
  $$update public.offer_versions set material_snapshot = '{}' where id = pg_temp.id('versão 1')$$,
  '42501', 'permission denied for table offer_versions',
  'CT11.3: o administrador não altera o snapshot da versão');
select throws_ok(
  $$delete from public.offer_versions where id = pg_temp.id('versão 1')$$,
  '42501', 'permission denied for table offer_versions',
  'CT11.3: o administrador não apaga a versão');
select throws_ok(
  $$truncate public.offer_versions$$,
  '42501', 'permission denied for table offer_versions',
  'CT11.3: o administrador não esvazia as versões');
select throws_ok(
  $$update public.offer_documents set buyer_visibility = 'approved_buyers' where id = pg_temp.id('DP')$$,
  '42501', 'permission denied for table offer_documents',
  'CT11.3: o administrador não altera a visibilidade do documento');
select throws_ok(
  $$delete from public.offer_documents where id = pg_temp.id('DP')$$,
  '42501', 'permission denied for table offer_documents',
  'CT11.3: o administrador não apaga o documento');
select throws_ok(
  $$truncate public.offer_documents$$,
  '42501', 'permission denied for table offer_documents',
  'CT11.3: o administrador não esvazia os documentos');
select throws_ok(
  $$update public.offer_reviews set decision = 'returned' where id = pg_temp.id('revisão')$$,
  '42501', 'permission denied for table offer_reviews',
  'CT11.3: o administrador não altera a decisão da revisão');
select throws_ok(
  $$delete from public.offer_reviews where id = pg_temp.id('revisão')$$,
  '42501', 'permission denied for table offer_reviews',
  'CT11.3: o administrador não apaga a revisão');
select throws_ok(
  $$truncate public.offer_reviews$$,
  '42501', 'permission denied for table offer_reviews',
  'CT11.3: o administrador não esvazia as revisões');
select throws_ok(
  $$update public.field_history set old_value = null where id = pg_temp.id('histórico')$$,
  '42501', 'permission denied for table field_history',
  'CT11.3: o administrador não altera o histórico do preço');
select throws_ok(
  $$delete from public.field_history where id = pg_temp.id('histórico')$$,
  '42501', 'permission denied for table field_history',
  'CT11.3: o administrador não apaga o histórico');
select throws_ok(
  $$truncate public.field_history$$,
  '42501', 'permission denied for table field_history',
  'CT11.3: o administrador não esvazia o histórico');
select throws_ok(
  $$update public.audit_logs set actor_profile_id = null where id = pg_temp.id('auditoria')$$,
  '42501', 'permission denied for table audit_logs',
  'CT11.3: o administrador não altera a auditoria');
select throws_ok(
  $$delete from public.audit_logs where id = pg_temp.id('auditoria')$$,
  '42501', 'permission denied for table audit_logs',
  'CT11.3: o administrador não apaga a auditoria');
select throws_ok(
  $$truncate public.audit_logs$$,
  '42501', 'permission denied for table audit_logs',
  'CT11.3: o administrador não esvazia a auditoria');
select throws_ok(
  $$delete from public.offers where id = pg_temp.id('P')$$,
  '42501', 'permission denied for table offers',
  'CT11.5: o administrador não apaga a oferta');
select throws_ok(
  $$delete from public.vehicles where id = pg_temp.id('veículo P')$$,
  '42501', 'permission denied for table vehicles',
  'CT11.5: o administrador não apaga o veículo');
reset role;
select pg_temp.entrar(null);

-- CT11.4, CT11.5 e CT11.6: service_role ----------------------------------------------------

set local role service_role;
select set_config('request.jwt.claims', '{"role": "service_role"}', true);
select throws_ok(
  $$update public.supplier_declarations set category = 'auction' where id = pg_temp.id('declaração')$$,
  '42501', 'permission denied for table supplier_declarations',
  'CT11.4: service_role não altera a declaração');
select throws_ok(
  $$delete from public.supplier_declarations where id = pg_temp.id('declaração')$$,
  '42501', 'permission denied for table supplier_declarations',
  'CT11.4: service_role não apaga a declaração');
select throws_ok(
  $$truncate public.supplier_declarations$$,
  '42501', 'permission denied for table supplier_declarations',
  'CT11.4: service_role não esvazia as declarações');
select throws_ok(
  $$update public.offer_versions set change_summary = 'x' where id = pg_temp.id('versão 1')$$,
  '42501', 'permission denied for table offer_versions',
  'CT11.4: service_role não altera a versão');
select throws_ok(
  $$delete from public.offer_versions where id = pg_temp.id('versão 1')$$,
  '42501', 'permission denied for table offer_versions',
  'CT11.4: service_role não apaga a versão');
select throws_ok(
  $$truncate public.offer_versions$$,
  '42501', 'permission denied for table offer_versions',
  'CT11.4: service_role não esvazia as versões');
select throws_ok(
  $$update public.offer_documents set sha256 = repeat('0', 64) where id = pg_temp.id('DP')$$,
  '42501', 'permission denied for table offer_documents',
  'CT11.4: service_role não altera o documento');
select throws_ok(
  $$delete from public.offer_documents where id = pg_temp.id('DP')$$,
  '42501', 'permission denied for table offer_documents',
  'CT11.4: service_role não apaga o documento');
select throws_ok(
  $$truncate public.offer_documents$$,
  '42501', 'permission denied for table offer_documents',
  'CT11.4: service_role não esvazia os documentos');
select throws_ok(
  $$update public.offer_reviews set reviewed_by = pg_temp.id('X') where id = pg_temp.id('revisão')$$,
  '42501', 'permission denied for table offer_reviews',
  'CT11.4: service_role não altera a revisão');
select throws_ok(
  $$delete from public.offer_reviews where id = pg_temp.id('revisão')$$,
  '42501', 'permission denied for table offer_reviews',
  'CT11.4: service_role não apaga a revisão');
select throws_ok(
  $$truncate public.offer_reviews$$,
  '42501', 'permission denied for table offer_reviews',
  'CT11.4: service_role não esvazia as revisões');
select throws_ok(
  $$update public.field_history set changed_by = null where id = pg_temp.id('histórico')$$,
  '42501', 'permission denied for table field_history',
  'CT11.4: service_role não altera o histórico');
select throws_ok(
  $$delete from public.field_history where id = pg_temp.id('histórico')$$,
  '42501', 'permission denied for table field_history',
  'CT11.4: service_role não apaga o histórico');
select throws_ok(
  $$truncate public.field_history$$,
  '42501', 'permission denied for table field_history',
  'CT11.4: service_role não esvazia o histórico');
select throws_ok(
  $$update public.audit_logs set action = 'x' where id = pg_temp.id('auditoria')$$,
  '42501', 'permission denied for table audit_logs',
  'CT11.4: service_role não altera a auditoria');
select throws_ok(
  $$delete from public.audit_logs where id = pg_temp.id('auditoria')$$,
  '42501', 'permission denied for table audit_logs',
  'CT11.4: service_role não apaga a auditoria');
select throws_ok(
  $$truncate public.audit_logs$$,
  '42501', 'permission denied for table audit_logs',
  'CT11.4: service_role não esvazia a auditoria');
select throws_ok(
  $$insert into public.offer_versions (offer_id, version_number, material_snapshot, snapshot_hash, change_summary)
    select offer_id, version_number, material_snapshot, snapshot_hash, 'cópia' from public.offer_versions
    where id = pg_temp.id('versão 1')$$,
  '42501', 'permission denied for table offer_versions',
  'CT11.6: service_role não grava versão (§2.6)');
select throws_ok(
  $$delete from public.offers where id = pg_temp.id('P')$$,
  '42501', 'permission denied for table offers',
  'CT11.5: service_role não apaga a oferta');
select throws_ok(
  $$delete from public.vehicles where id = pg_temp.id('veículo P')$$,
  '42501', 'permission denied for table vehicles',
  'CT11.5: service_role não apaga o veículo');
reset role;
select set_config('request.jwt.claims', '', true);

-- CT11.4, CT11.5 e CT11.6: postgres, dono das tabelas (o gatilho recusa) -------------

select throws_ok(
  $$update public.supplier_declarations set declared_value = 'unknown' where id = pg_temp.id('declaração')$$,
  'P0001', 'tabela só de inclusão: UPDATE não é permitido em public.supplier_declarations',
  'CT11.4: a declaração não se altera, nem como postgres');
select throws_ok(
  $$delete from public.supplier_declarations where id = pg_temp.id('declaração')$$,
  'P0001', 'tabela só de inclusão: DELETE não é permitido em public.supplier_declarations',
  'CT11.4: a declaração não se apaga, nem como postgres');
-- Desde a I3.3, transfer_impediments aponta para a declaração; as duas entram
-- no mesmo TRUNCATE para a chave estrangeira não recusar antes do gatilho.
select throws_ok(
  $$truncate public.supplier_declarations, public.transfer_impediments$$,
  'P0001', 'tabela só de inclusão: TRUNCATE não é permitido em public.supplier_declarations',
  'CT11.4: as declarações não se esvaziam, nem como postgres');
select throws_ok(
  $$update public.offer_versions set snapshot_hash = repeat('0', 64) where id = pg_temp.id('versão 1')$$,
  'P0001', 'tabela só de inclusão: UPDATE não é permitido em public.offer_versions',
  'CT11.4: a versão não se altera, nem como postgres');
select throws_ok(
  $$delete from public.offer_versions where id = pg_temp.id('versão 1')$$,
  'P0001', 'tabela só de inclusão: DELETE não é permitido em public.offer_versions',
  'CT11.4: a versão não se apaga, nem como postgres');
-- offer_reviews referencia offer_versions: sem ela no mesmo comando, o
-- Postgres recusa pela chave estrangeira antes do gatilho.
select throws_ok(
  $$truncate public.offer_versions, public.offer_reviews$$,
  'P0001', 'tabela só de inclusão: TRUNCATE não é permitido em public.offer_versions',
  'CT11.4: as versões não se esvaziam, nem como postgres');
select throws_ok(
  $$update public.offer_documents set buyer_visibility = 'approved_buyers' where id = pg_temp.id('DP')$$,
  'P0001', 'tabela só de inclusão: UPDATE não é permitido em public.offer_documents',
  'CT11.4: o documento não se altera, nem como postgres');
select throws_ok(
  $$delete from public.offer_documents where id = pg_temp.id('DP')$$,
  'P0001', 'tabela só de inclusão: DELETE não é permitido em public.offer_documents',
  'CT11.4: o documento não se apaga, nem como postgres');
select throws_ok(
  $$truncate public.offer_documents$$,
  'P0001', 'tabela só de inclusão: TRUNCATE não é permitido em public.offer_documents',
  'CT11.4: os documentos não se esvaziam, nem como postgres');
select throws_ok(
  $$update public.offer_reviews set reason = 'x' where id = pg_temp.id('revisão')$$,
  'P0001', 'tabela só de inclusão: UPDATE não é permitido em public.offer_reviews',
  'CT11.4: a revisão não se altera, nem como postgres');
select throws_ok(
  $$delete from public.offer_reviews where id = pg_temp.id('revisão')$$,
  'P0001', 'tabela só de inclusão: DELETE não é permitido em public.offer_reviews',
  'CT11.4: a revisão não se apaga, nem como postgres');
select throws_ok(
  $$truncate public.offer_reviews$$,
  'P0001', 'tabela só de inclusão: TRUNCATE não é permitido em public.offer_reviews',
  'CT11.4: as revisões não se esvaziam, nem como postgres');
select throws_ok(
  $$update public.field_history set new_value = '1' where id = pg_temp.id('histórico')$$,
  'P0001', 'tabela só de inclusão: UPDATE não é permitido em public.field_history',
  'CT11.7: o histórico do preço não se altera, nem como postgres');
select throws_ok(
  $$delete from public.field_history where id = pg_temp.id('histórico')$$,
  'P0001', 'tabela só de inclusão: DELETE não é permitido em public.field_history',
  'CT11.7: o histórico do preço não se apaga, nem como postgres');
select throws_ok(
  $$truncate public.field_history$$,
  'P0001', 'tabela só de inclusão: TRUNCATE não é permitido em public.field_history',
  'CT11.7: o histórico não se esvazia, nem como postgres');
select throws_ok(
  $$update public.audit_logs set metadata = '{}' where id = pg_temp.id('auditoria')$$,
  'P0001', 'tabela só de inclusão: UPDATE não é permitido em public.audit_logs',
  'CT11.7: a auditoria da oferta não se altera, nem como postgres');
select throws_ok(
  $$delete from public.audit_logs where id = pg_temp.id('auditoria')$$,
  'P0001', 'tabela só de inclusão: DELETE não é permitido em public.audit_logs',
  'CT11.7: a auditoria da oferta não se apaga, nem como postgres');
select throws_ok(
  $$truncate public.audit_logs$$,
  'P0001', 'tabela só de inclusão: TRUNCATE não é permitido em public.audit_logs',
  'CT11.7: a auditoria não se esvazia, nem como postgres');
select throws_ok(
  $$insert into public.offer_versions (offer_id, version_number, material_snapshot, snapshot_hash, change_summary)
    select offer_id, version_number, material_snapshot, snapshot_hash, 'cópia' from public.offer_versions
    where id = pg_temp.id('versão 1')$$,
  '23505', 'duplicate key value violates unique constraint "offer_versions_offer_id_version_number_key"',
  'CT11.6: version_number repetido na mesma oferta, nem como postgres (índice único)');
select throws_ok(
  $$delete from public.offers where id = pg_temp.id('P')$$,
  '42501', 'exclusão não é permitida em public.offers',
  'CT11.5: sem exclusão de oferta, nem como postgres');
select throws_ok(
  $$delete from public.vehicles where id = pg_temp.id('veículo P')$$,
  '42501', 'exclusão não é permitida em public.vehicles',
  'CT11.5: sem exclusão de veículo, nem como postgres');
select is(
  (select array_agg(t.relname::text || ' ' || c.confdeltype::text order by t.relname::text collate "C")
     from pg_constraint c
     join pg_class t on t.oid = c.conrelid
    where c.contype = 'f' and c.confrelid in ('public.offers'::regclass, 'public.vehicles'::regclass)),
  array['check_evidence_files r', 'documental_reviews r', 'offer_documents r', 'offer_media r',
        'offer_reviews r', 'offer_versions r', 'offers r', 'supplier_declarations r',
        'transfer_impediments r', 'vehicle_checks r', 'vehicle_checks r'],
  'CT11.5: toda chave estrangeira para offers e vehicles é restrict, sem cascata');
select ok(
  exists (select 1 from public.offers where id = pg_temp.id('P'))
  and exists (select 1 from public.vehicles where id = pg_temp.id('veículo P')),
  'CT11.5: a oferta e o veículo continuam');

-- As seis linhas continuam como no preparo ---------------------------------------------------

select is(
  (select to_jsonb(d) from public.supplier_declarations d where d.id = pg_temp.id('declaração')),
  (select linha from pg_temp.guardada where nome = 'declaração'),
  'CT11.1 a CT11.4: a declaração continua intacta');
select is(
  (select to_jsonb(v) from public.offer_versions v where v.id = pg_temp.id('versão 1')),
  (select linha from pg_temp.guardada where nome = 'versão 1'),
  'CT11.1 a CT11.4: a versão 1 continua intacta');
select is(
  (select to_jsonb(t) from public.offer_documents t where t.id = pg_temp.id('DP')),
  (select linha from pg_temp.guardada where nome = 'DP'),
  'CT11.1 a CT11.4: o documento continua intacto');
select is(
  (select to_jsonb(r) from public.offer_reviews r where r.id = pg_temp.id('revisão')),
  (select linha from pg_temp.guardada where nome = 'revisão'),
  'CT11.1 a CT11.4: a revisão continua intacta');
select is(
  (select to_jsonb(h) from public.field_history h where h.id = pg_temp.id('histórico')),
  (select linha from pg_temp.guardada where nome = 'histórico'),
  'CT11.7: o histórico do preço continua intacto');
select is(
  (select to_jsonb(a) from public.audit_logs a where a.id = pg_temp.id('auditoria')),
  (select linha from pg_temp.guardada where nome = 'auditoria'),
  'CT11.7: a auditoria da mudança de preço continua intacta');

-- Contraste: a inclusão continua funcionando ------------------------------------------------

set local role authenticated;
select pg_temp.entrar('F1');
select lives_ok(
  $$insert into public.supplier_declarations (offer_id, category, declared_value, detail)
    values (pg_temp.id('P'), 'lien', 'has_occurrence', 'Alienação fiduciária em nome de banco.')$$,
  'contraste: o dono declara de novo a mesma categoria');
select is(
  (select e.declared_value || '/' || e.state from public.estados_documentais(pg_temp.id('P')) e
    where e.category = 'lien'),
  'has_occurrence/with_findings',
  'contraste (§5.3): a declaração nova é a vigente');
select is(
  (select to_jsonb(d) from public.supplier_declarations d where d.id = pg_temp.id('declaração')),
  (select linha from pg_temp.guardada where nome = 'declaração'),
  'contraste (§5.3): a anterior continua legível e igual');
reset role;
select pg_temp.entrar(null);
insert into pg_temp.guardada
select 'vigente', to_jsonb(v) from public.offer_versions v
join public.offers o on o.id = v.offer_id and v.version_number = o.current_version
where o.id = pg_temp.id('P');
set local role authenticated;
select pg_temp.entrar('F1');
select lives_ok(
  $$select public.atualizar_oferta(pg_temp.id('P'), '{}', '{"asking_price": "48000.00"}')$$,
  'contraste: o dono muda o preço da publicada');
select is(
  (select 'versão +' || (v.version_number - (g.linha ->> 'version_number')::integer) || ': ' || v.change_summary
     from public.offers o
     join public.offer_versions v on v.offer_id = o.id and v.version_number = o.current_version
     cross join pg_temp.guardada g
    where o.id = pg_temp.id('P') and g.nome = 'vigente'),
  'versão +1: fields.asking_price',
  'contraste: o preço novo cria exatamente uma versão nova');
select is(
  (select to_jsonb(v) from public.offer_versions v
    where v.id = (select (g.linha ->> 'id')::uuid from pg_temp.guardada g where g.nome = 'vigente')),
  (select linha from pg_temp.guardada where nome = 'vigente'),
  'contraste: a versão anterior fica intacta');
select is(
  (select count(*)::int from public.field_history
    where entity_type = 'offers' and entity_id = pg_temp.id('P') and field = 'asking_price'),
  2,
  'contraste: o histórico do preço ganha uma linha, e a anterior continua');
reset role;
select pg_temp.entrar(null);

select * from finish();
rollback;
