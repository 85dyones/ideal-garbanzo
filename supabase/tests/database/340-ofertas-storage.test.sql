-- I2.4: Storage privado das ofertas (ADR-0003 §2.13; teste 6 da §7.4, parte
-- do banco: CT6.1, CT6.2, CT6.4, CT6.5 e CT6.6).
--
-- O pgTAP roda como postgres, então os objetos entram em storage.objects por
-- SQL, com o dono informado, como o Storage grava; a escrita com o papel
-- authenticated passa pelas mesmas políticas que o Storage aplica com o token
-- do usuário. A URL temporária, o registro de acesso e o endereço público
-- (CT6.1, CT6.3 e CT6.7) ficam no teste de integração.
begin;
select plan(30);
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
  values ($2, lower($1) || '-340@repasse-teste.invalid', now(),
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

-- Fixture ----------------------------------------------------------------------------

select pg_temp.usuario('X', '34000000-0000-4000-8000-000000000001');
select pg_temp.usuario('O', '34000000-0000-4000-8000-000000000002');
select pg_temp.usuario('F1', '34000000-0000-4000-8000-000000000003');
select pg_temp.usuario('F2', '34000000-0000-4000-8000-000000000004');
select pg_temp.usuario('G1', '34000000-0000-4000-8000-000000000005');
select pg_temp.usuario('C1', '34000000-0000-4000-8000-000000000006');
select pg_temp.admin('X');
select pg_temp.conceder('O', 'operator', 'X');
select pg_temp.empresa('F', 'F1', 'X', '34000001000158', 'supplier');
select pg_temp.empresa('G', 'G1', 'X', '34000002000100', 'supplier');
select pg_temp.empresa('C', 'C1', 'X', '34000003000147', 'buyer');
select pg_temp.vincular('F', 'F2', 'member', 'F1');

select pg_temp.oferta('R', 'F', 'F1');
select pg_temp.oferta('P', 'F', 'F1');
select pg_temp.publicar('P', 'F1', 'O');
select pg_temp.foto('FR', 'R', 'F2');
select pg_temp.documento('DR', 'R', 'F2');

-- Caminhos lidos como postgres, para as asserções não dependerem da RLS de quem lê.
create temporary table caminhos (nome text primary key, caminho text not null);
grant select on pg_temp.caminhos to authenticated, anon;
insert into pg_temp.caminhos
select 'FR', storage_path from public.offer_media where id = pg_temp.id('FR')
union all
select 'DR', storage_path from public.offer_documents where id = pg_temp.id('DR')
union all
select 'livre', pg_temp.id('F') || '/' || pg_temp.id('R') || '/' || '00000000-0000-4000-8000-0000000000aa.jpg'
union all
select 'de F1', pg_temp.id('F') || '/' || pg_temp.id('R') || '/' || '00000000-0000-4000-8000-0000000000bb.jpg'
union all
select 'contraste', pg_temp.id('F') || '/' || pg_temp.id('R') || '/' || '00000000-0000-4000-8000-0000000000cc.jpg';
-- Objetos enviados por F1: um que F2 tenta registrar como seu, e outro que o
-- próprio F1 registra (contraste independente do caso negativo).
insert into storage.objects (bucket_id, name, owner_id)
select 'offer-photos', caminho, pg_temp.id('F1')::text from pg_temp.caminhos where nome in ('de F1', 'contraste');

-- Buckets e políticas (ADR-0003 §2.13) -----------------------------------------------

select is(
  (select count(*)::int from storage.buckets where id in ('offer-photos', 'offer-documents') and not public),
  2,
  'CT6.1: os dois buckets das ofertas são privados');
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and cmd in ('UPDATE', 'DELETE', 'ALL')
      and (coalesce(qual, '') like '%offer-%' or coalesce(with_check, '') like '%offer-%')),
  0,
  'CT6.6: nenhuma política de UPDATE ou DELETE nos buckets das ofertas');
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and cmd = 'SELECT'
      and coalesce(qual, '') like '%offer-documents%'),
  0,
  'nenhuma política de SELECT no bucket de documentos: só o servidor gera a URL');
select ok(
  (select not ('application/pdf' = any (allowed_mime_types)) from storage.buckets where id = 'offer-photos'),
  'o bucket de fotos não aceita PDF');

-- Quem envia (função da política de INSERT) ------------------------------------------

set local role authenticated;
select pg_temp.entrar('F2');
select ok(
  private.pode_enviar_arquivo_da_oferta(
    pg_temp.id('F') || '/' || pg_temp.id('R') || '/' || gen_random_uuid() || '.jpg', 'jpg|jpeg|png|webp'),
  'contraste: o member envia foto para o rascunho da empresa');
select ok(
  not private.pode_enviar_arquivo_da_oferta(
    pg_temp.id('F') || '/' || pg_temp.id('P') || '/' || gen_random_uuid() || '.jpg', 'jpg|jpeg|png|webp'),
  'Q2: o member não envia arquivo para a publicada');
select pg_temp.entrar('F1');
select ok(
  private.pode_enviar_arquivo_da_oferta(
    pg_temp.id('F') || '/' || pg_temp.id('P') || '/' || gen_random_uuid() || '.jpg', 'jpg|jpeg|png|webp'),
  'contraste: o org_admin envia arquivo para a publicada');
select ok(
  not private.pode_enviar_arquivo_da_oferta(
    pg_temp.id('F') || '/' || pg_temp.id('R') || '/foto.jpg', 'jpg|jpeg|png|webp'),
  'caminho sem o uuid do arquivo é recusado');
select ok(
  not private.pode_enviar_arquivo_da_oferta(
    pg_temp.id('G') || '/' || pg_temp.id('R') || '/' || gen_random_uuid() || '.jpg', 'jpg|jpeg|png|webp'),
  'caminho com a empresa errada é recusado');
select ok(
  not private.pode_enviar_arquivo_da_oferta(
    pg_temp.id('F') || '/' || pg_temp.id('R') || '/' || gen_random_uuid() || '.pdf', 'jpg|jpeg|png|webp'),
  'extensão fora da lista do bucket é recusada');
select pg_temp.entrar('G1');
select ok(
  not private.pode_enviar_arquivo_da_oferta(
    pg_temp.id('F') || '/' || pg_temp.id('R') || '/' || gen_random_uuid() || '.jpg', 'jpg|jpeg|png|webp'),
  'CT6.6: outra empresa não envia para a oferta alheia');
select pg_temp.entrar('C1');
select ok(
  not private.pode_enviar_arquivo_da_oferta(
    pg_temp.id('F') || '/' || pg_temp.id('R') || '/' || gen_random_uuid() || '.jpg', 'jpg|jpeg|png|webp'),
  'comprador não envia');
select pg_temp.entrar('O');
select ok(
  not private.pode_enviar_arquivo_da_oferta(
    pg_temp.id('F') || '/' || pg_temp.id('R') || '/' || gen_random_uuid() || '.jpg', 'jpg|jpeg|png|webp'),
  'Q3: o staff não envia arquivo');

-- Quem lê o objeto (política de SELECT) -------------------------------------------------

select pg_temp.entrar('F2');
select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'offer-photos' and name = (select caminho from pg_temp.caminhos where nome = 'FR')),
  1,
  'contraste: a empresa dona lê o objeto da foto');
select pg_temp.entrar('F1');
select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'offer-documents' and name = (select caminho from pg_temp.caminhos where nome = 'DR')),
  0,
  'nem o dono lê o objeto do documento direto: só pelo servidor, com registro');
select pg_temp.entrar('G1');
select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'offer-photos' and name = (select caminho from pg_temp.caminhos where nome = 'FR')),
  0,
  'CT6.2: outra empresa não lê o objeto da foto pelo caminho');
select is(
  (select count(*)::int from storage.objects where name like pg_temp.id('F') || '/%'),
  0,
  'CT6.5: nem lista o prefixo da empresa');
select pg_temp.entrar('C1');
select is(
  (select count(*)::int from storage.objects
    where bucket_id in ('offer-photos', 'offer-documents') and name like pg_temp.id('F') || '/%'),
  0,
  'CT6.4: comprador não lê foto nem documento antes do catálogo');
select pg_temp.entrar('O');
select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'offer-photos' and name = (select caminho from pg_temp.caminhos where nome = 'FR')),
  1,
  'o operador lê o objeto da foto');
select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'offer-documents' and name = (select caminho from pg_temp.caminhos where nome = 'DR')),
  0,
  'o operador também abre documento só pelo servidor');

-- A linha exige o objeto no bucket, enviado pelo mesmo usuário ------------------------------

select pg_temp.entrar('F2');
select throws_ok(
  $$insert into public.offer_media (offer_id, storage_path)
    values (pg_temp.id('R'), (select caminho from pg_temp.caminhos where nome = 'livre'))$$,
  'P0001', 'o arquivo da foto não está no armazenamento',
  'a foto sem objeto no bucket não é registrada');
select throws_ok(
  $$insert into public.offer_documents (offer_id, kind, storage_path, sha256)
    values (pg_temp.id('R'), 'crlv', replace((select caminho from pg_temp.caminhos where nome = 'livre'), '.jpg', '.pdf'),
            repeat('e', 64))$$,
  'P0001', 'o arquivo do documento não está no armazenamento',
  'o documento sem objeto no bucket não é registrado');
select throws_ok(
  $$insert into public.offer_media (offer_id, storage_path)
    values (pg_temp.id('R'), (select caminho from pg_temp.caminhos where nome = 'de F1'))$$,
  'P0001', 'o arquivo da foto não está no armazenamento',
  'ninguém registra como seu o objeto enviado por outra pessoa');
select pg_temp.entrar('F1');
select is(
  pg_temp.resultado($$insert into public.offer_media (offer_id, storage_path)
    values (pg_temp.id('R'), (select caminho from pg_temp.caminhos where nome = 'contraste'))$$),
  'linhas: 1',
  'contraste: quem enviou o objeto registra a foto');

-- Escrita direta em storage.objects, como o Storage faz com o token do usuário ----------------

select pg_temp.entrar('F2');
select is(
  pg_temp.resultado($$insert into storage.objects (bucket_id, name, owner_id)
    values ('offer-photos', (select caminho from pg_temp.caminhos where nome = 'livre'), pg_temp.id('F2')::text)$$),
  'linhas: 1',
  'contraste: o envio do member ao rascunho passa pela política');
select pg_temp.entrar('G1');
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values ('offer-photos', pg_temp.id('F') || '/' || pg_temp.id('R') || '/' || gen_random_uuid() || '.jpg',
            pg_temp.id('G1')::text)$$,
  '42501', 'new row violates row-level security policy for table "objects"',
  'CT6.6: outra empresa não envia para o prefixo da oferta alheia');
select pg_temp.entrar('F1');
select is(
  pg_temp.resultado($$update storage.objects set name = name || '.x'
    where bucket_id = 'offer-photos' and name = (select caminho from pg_temp.caminhos where nome = 'FR')$$),
  'linhas: 0',
  'CT6.6: nem o dono sobrescreve a foto');
-- O Supabase recusa DELETE direto em storage.objects, com qualquer política;
-- a remoção pela API do Storage, que passa pela política, está no teste de
-- integração (CT6.6).
select matches(
  pg_temp.resultado($$delete from storage.objects
    where bucket_id = 'offer-photos' and name = (select caminho from pg_temp.caminhos where nome = 'FR')$$),
  '^erro ',
  'CT6.6: DELETE direto no objeto é recusado');
reset role;
select pg_temp.entrar(null);
select is(
  (select count(*)::int from storage.objects
    where name in (select caminho from pg_temp.caminhos where nome in ('FR', 'DR'))),
  2,
  'CT6.6: os objetos continuam no bucket');

select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select is(
  (select count(*)::int from storage.objects where bucket_id in ('offer-photos', 'offer-documents')),
  0,
  'CT6.1: anônimo não vê objeto das ofertas');
reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
