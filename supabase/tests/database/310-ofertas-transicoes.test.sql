-- I2.3: transições da oferta (ADR-0003 §2.2, §2.3, §2.9 e §2.10; anexo A.2,
-- X01 a X19).
--
-- Camadas em offers: privilégio por coluna; a política de UPDATE filtra as
-- linhas de quem não é da empresa dona nem da plataforma (0 linhas, sem erro);
-- o gatilho proteger_oferta decide o par (de, para) e o autor. Os testes
-- rodam primeiro com a revisão exigida (valor provisório da D10) e, no fim,
-- com ela desligada. A expiração roda como postgres, sem sessão, como o
-- pg_cron.
begin;
select plan(70);
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
  values ($2, lower($1) || '-310@repasse-teste.invalid', now(),
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

-- Fixture ----------------------------------------------------------------------------

select pg_temp.usuario('X', '31000000-0000-4000-8000-000000000001');
select pg_temp.usuario('O', '31000000-0000-4000-8000-000000000002');
select pg_temp.usuario('F1', '31000000-0000-4000-8000-000000000003');
select pg_temp.usuario('F2', '31000000-0000-4000-8000-000000000004');
select pg_temp.usuario('G1', '31000000-0000-4000-8000-000000000005');
select pg_temp.usuario('C1', '31000000-0000-4000-8000-000000000006');
select pg_temp.usuario('A1', '31000000-0000-4000-8000-000000000007');
select pg_temp.usuario('OF', '31000000-0000-4000-8000-000000000008');
select pg_temp.admin('X');
select pg_temp.conceder('O', 'operator', 'X');
select pg_temp.conceder('OF', 'operator', 'X');
select pg_temp.empresa('F', 'F1', 'X', '31000001000160', 'supplier');
select pg_temp.empresa('G', 'G1', 'X', '31000002000104', 'supplier');
select pg_temp.empresa('C', 'C1', 'X', '31000003000159', 'buyer');
select pg_temp.empresa('A', 'A1', 'X', '31000004000101', 'both');
select pg_temp.vincular('F', 'F2', 'member', 'F1');
select pg_temp.vincular('F', 'OF', 'member', 'F1');

select pg_temp.oferta('R', 'F', 'F1');
select pg_temp.oferta('S', 'F', 'F2', false);
select pg_temp.oferta('D', 'F', 'F1');
select pg_temp.oferta('Q', 'F', 'F1');
select pg_temp.oferta('W', 'F', 'F1');
select pg_temp.oferta('E', 'F', 'F1');
select pg_temp.publicar('Q', 'F1', 'O');
select pg_temp.publicar('W', 'F1', 'O');
select pg_temp.publicar('E', 'F1', 'O');

-- T03, X11 e Q2: envio à revisão ------------------------------------------------------

set local role authenticated;
select pg_temp.entrar('F1');
select throws_ok(
  $$update public.offers set status = 'published', publication_authorized_by = pg_temp.id('F1')
    where id = pg_temp.id('R')$$,
  'P0001', 'com revisão exigida, a oferta vai para revisão antes de publicar',
  'X11: com revisão exigida, o org_admin não publica direto do rascunho');
select pg_temp.entrar('F2');
select throws_ok(
  $$update public.offers set status = 'under_review', publication_authorized_by = pg_temp.id('F2')
    where id = pg_temp.id('R')$$,
  '42501', 'só o administrador da empresa envia ou publica a oferta',
  'Q2: o member não envia a oferta para revisão');
select pg_temp.entrar('F1');
select throws_ok(
  $$update public.offers set status = 'under_review' where id = pg_temp.id('R')$$,
  'P0001', 'declare a autorização de divulgação no envio',
  'B30: o envio exige a autorização de divulgação');
select throws_ok(
  $$update public.offers set status = 'under_review', publication_authorized_by = pg_temp.id('F2')
    where id = pg_temp.id('R')$$,
  'P0001', 'declare a autorização de divulgação no envio',
  'B30: a autorização é de quem envia');
select throws_matching(
  $$update public.offers set status = 'under_review', publication_authorized_by = pg_temp.id('F1')
    where id = pg_temp.id('S')$$,
  '^oferta incompleta para publicar: declaration:administrative_restrictions, declaration:auction, ',
  'X05: sem declaração em todas as categorias, a oferta não vai para revisão');
select is(
  pg_temp.resultado($$update public.offers set status = 'under_review', publication_authorized_by = pg_temp.id('F1')
    where id = pg_temp.id('R')$$),
  'linhas: 1',
  'X07: com apontamento declarado e categorias sem consulta, a oferta vai para revisão');
select ok(
  (select publication_authorized_at is not null and published_at is null from public.offers where id = pg_temp.id('R')),
  'T03: o gatilho grava a data da autorização; ainda sem publicação');
select throws_ok(
  $$update public.offers set asking_price = 46000 where id = pg_temp.id('R')$$,
  'P0001', 'a oferta em under_review não pode ser editada',
  'B31: em revisão, o fornecedor não edita');
select throws_ok(
  $$update public.offers set status = 'published' where id = pg_temp.id('R')$$,
  '42501', 'só o operador ou o administrador publica a oferta revisada',
  'T04: o fornecedor não publica a própria oferta em revisão');
select pg_temp.entrar('OF');
select throws_ok(
  $$update public.offers set status = 'published' where id = pg_temp.id('R')$$,
  '42501', 'só o operador ou o administrador publica a oferta revisada',
  'X16/B25: operador com vínculo na empresa dona não publica como plataforma');

-- T05, T18 e T04: devolução, cancelamento e publicação ------------------------------

select pg_temp.entrar('O');
select throws_ok(
  $$update public.offers set status = 'draft' where id = pg_temp.id('R')$$,
  'P0001', 'informe o motivo',
  'T05: a devolução exige motivo');
select pg_temp.api('{"x-audit-reason": "Fotos sem o hodômetro."}');
select is(
  pg_temp.resultado($$update public.offers set status = 'draft' where id = pg_temp.id('R')$$),
  'linhas: 1',
  'T05: o operador devolve com motivo');
select pg_temp.api(null);
select is(
  (select r.decision || '/' || r.reason || '/' || (r.offer_version_id = v.id)::text
     from public.offer_reviews r
     join public.offers o on o.id = r.offer_id
     join public.offer_versions v on v.offer_id = o.id and v.version_number = o.current_version
    where r.offer_id = pg_temp.id('R')),
  'returned/Fotos sem o hodômetro./true',
  'T05: offer_reviews guarda a devolução, o motivo e a versão revisada');
select is(
  (select publication_authorized_by from public.offers where id = pg_temp.id('R')),
  null::uuid,
  'T05: a devolução limpa a autorização de divulgação');
select pg_temp.entrar('F1');
select is(
  pg_temp.resultado($$update public.offers set status = 'under_review', publication_authorized_by = pg_temp.id('F1')
    where id = pg_temp.id('R')$$),
  'linhas: 1',
  'T03: o org_admin envia de novo depois da devolução');
select pg_temp.entrar('F2');
select is(
  pg_temp.resultado($$update public.offers set status = 'draft' where id = pg_temp.id('R')$$),
  'linhas: 1',
  'T18: membro da empresa cancela o envio');
select is(
  (select count(*)::int from public.offer_reviews where offer_id = pg_temp.id('R')),
  1,
  'T18: o cancelamento não vira decisão de revisão');
select pg_temp.entrar('F1');
select is(
  pg_temp.resultado($$update public.offers set status = 'under_review', publication_authorized_by = pg_temp.id('F1')
    where id = pg_temp.id('R')$$),
  'linhas: 1',
  'T03: o org_admin envia de novo depois do cancelamento');
select pg_temp.entrar('O');
select is(
  pg_temp.resultado($$update public.offers set status = 'published' where id = pg_temp.id('R')$$),
  'linhas: 1',
  'T04: o operador publica a oferta revisada');
select is(
  (select status || '/' || (published_at is not null)::text from public.offers where id = pg_temp.id('R')),
  'published/true',
  'T04: publicada, com a data da publicação');
select is(
  (select array_agg(decision order by decision) from public.offer_reviews where offer_id = pg_temp.id('R')),
  array['published', 'returned'],
  'T04: a publicação também fica em offer_reviews');

-- X02, X03 e Q2: quem não pode ------------------------------------------------------------

select pg_temp.entrar('G1');
select is(
  pg_temp.resultado($$update public.offers set status = 'withdrawn' where id = pg_temp.id('R')$$),
  'linhas: 0',
  'X03: fornecedor de outra empresa não retira a oferta (política de UPDATE)');
select pg_temp.entrar('C1');
select is(
  pg_temp.resultado($$update public.offers set status = 'reserved' where id = pg_temp.id('R')$$),
  'linhas: 0',
  'X02: comprador não reserva oferta');
select pg_temp.entrar('A1');
select is(
  pg_temp.resultado($$update public.offers set status = 'withdrawn' where id = pg_temp.id('R')$$),
  'linhas: 0',
  'X02: empresa both que não é dona não retira');
select pg_temp.entrar('F2');
select throws_ok(
  $$update public.offers set status = 'withdrawn' where id = pg_temp.id('R')$$,
  '42501', 'só o administrador da empresa ou a plataforma retira a oferta',
  'Q2: o member não retira a oferta publicada');
select throws_ok(
  $$update public.offers set status = 'reserved' where id = pg_temp.id('R')$$,
  '42501', 'só o administrador da empresa ou a plataforma reserva a oferta',
  'Q2: o member não reserva');

-- T08, T09, X04 e X17 -----------------------------------------------------------------------

select pg_temp.entrar('F1');
select is(
  pg_temp.resultado($$update public.offers set status = 'reserved' where id = pg_temp.id('R')$$),
  'linhas: 1',
  'T08: o org_admin reserva');
select pg_temp.entrar('O');
select is(
  pg_temp.resultado($$update public.offers set status = 'published' where id = pg_temp.id('R')$$),
  'linhas: 1',
  'T09: o operador devolve a reservada para publicada');
select pg_temp.entrar('F1');
select throws_ok(
  $$update public.offers set status = 'expired' where id = pg_temp.id('R')$$,
  'P0001', 'transição de oferta inválida: published para expired',
  'X04: usuário não leva a oferta a expirada');
select pg_temp.entrar('X');
select throws_ok(
  $$update public.offers set status = 'expired' where id = pg_temp.id('R')$$,
  'P0001', 'transição de oferta inválida: published para expired',
  'X04: nem o administrador da plataforma');
select pg_temp.entrar('F1');
select throws_ok(
  $$update public.offers set status = 'sold' where id = pg_temp.id('R')$$,
  'P0001', 'transição de oferta inválida: published para sold',
  'X17: ninguém leva a oferta a vendida no Inc. 2');
select throws_ok(
  $$update public.offers set status = 'reserved', asking_price = 44000 where id = pg_temp.id('R')$$,
  'P0001', 'mude o conteúdo e o status da oferta em operações separadas',
  'conteúdo e status mudam em operações separadas');

-- T16 e T17: disponibilidade e validade ------------------------------------------------

select pg_temp.entrar('F2');
select is(
  pg_temp.resultado($$update public.offers set availability_confirmed_at = '2000-01-01' where id = pg_temp.id('R')$$),
  'linhas: 1',
  'T16: o member confirma a disponibilidade da publicada');
select ok(
  (select availability_confirmed_at > now() - interval '1 minute' from public.offers where id = pg_temp.id('R')),
  'T16: a data da confirmação vem do banco, não do payload');
select throws_ok(
  $$update public.offers set availability_confirmed_at = now() where id = pg_temp.id('S')$$,
  'P0001', 'a disponibilidade se confirma em oferta publicada ou reservada',
  'T16: rascunho não confirma disponibilidade');
select pg_temp.entrar('F1');
select throws_ok(
  $$update public.offers set valid_until = now() + interval '40 days' where id = pg_temp.id('R')$$,
  'P0001', 'a validade passa do teto de 30 dias',
  'Q5: a validade não passa do teto');
select throws_ok(
  $$update public.offers set valid_until = now() - interval '1 hour' where id = pg_temp.id('R')$$,
  'P0001', 'a validade precisa estar no futuro',
  'T17: a validade fica no futuro');
select is(
  pg_temp.resultado($$update public.offers set valid_until = now() + interval '20 days' where id = pg_temp.id('R')$$),
  'linhas: 1',
  'T17: o org_admin estende a validade da publicada');
select pg_temp.entrar('F2');
select throws_ok(
  $$update public.offers set valid_until = now() + interval '21 days' where id = pg_temp.id('R')$$,
  '42501', 'só o administrador da empresa altera oferta publicada ou reservada',
  'Q2: o member não altera a oferta publicada');

-- Q3: o staff não edita conteúdo ------------------------------------------------------------

select pg_temp.entrar('O');
select throws_ok(
  $$update public.offers set asking_price = 40000 where id = pg_temp.id('R')$$,
  '42501', 'a equipe da plataforma não edita o conteúdo da oferta',
  'Q3: o operador não edita o preço');
select pg_temp.entrar('X');
select throws_ok(
  $$update public.offers set asking_price = 40000 where id = pg_temp.id('R')$$,
  '42501', 'a equipe da plataforma não edita o conteúdo da oferta',
  'Q3: nem o administrador da plataforma');

-- T11, T19: retirada e reabertura ------------------------------------------------------------

select pg_temp.entrar('O');
select throws_ok(
  $$update public.offers set status = 'withdrawn' where id = pg_temp.id('W')$$,
  'P0001', 'informe o motivo',
  'T11: a plataforma retira só com motivo');
select pg_temp.api('{"x-audit-reason": "Anúncio duplicado."}');
select is(
  pg_temp.resultado($$update public.offers set status = 'withdrawn' where id = pg_temp.id('W')$$),
  'linhas: 1',
  'T11: o operador retira com motivo');
select pg_temp.api(null);
select is(
  (select withdrawn_reason || '/' || (withdrawn_by = pg_temp.id('O'))::text from public.offers where id = pg_temp.id('W')),
  'Anúncio duplicado./true',
  'T11: motivo e autor da retirada na oferta');
select pg_temp.entrar('F2');
select throws_ok(
  $$update public.offers set status = 'draft' where id = pg_temp.id('W')$$,
  '42501', 'só o administrador da empresa reabre a oferta',
  'T19: o member não reabre');
select pg_temp.entrar('F1');
select is(
  pg_temp.resultado($$update public.offers set status = 'draft' where id = pg_temp.id('W')$$),
  'linhas: 1',
  'T19: o org_admin reabre a retirada como rascunho');
select is(
  (select publication_authorized_by from public.offers where id = pg_temp.id('W')),
  null::uuid,
  'T19: reabrir limpa a autorização de divulgação');

-- T14 e T15: suspensão e reativação ----------------------------------------------------------

select throws_ok(
  $$update public.offers set status = 'suspended', suspended_category = 'forgery' where id = pg_temp.id('Q')$$,
  '42501', 'só o operador ou o administrador suspende a oferta',
  'X01: o fornecedor não suspende a própria oferta');
select pg_temp.entrar('O');
select throws_ok(
  $$update public.offers set status = 'suspended' where id = pg_temp.id('Q')$$,
  'P0001', 'informe a categoria da suspensão',
  'T14: a suspensão exige categoria');
select throws_ok(
  $$update public.offers set status = 'suspended', suspended_category = 'forgery' where id = pg_temp.id('Q')$$,
  'P0001', 'informe o motivo',
  'X08: a suspensão exige motivo');
select pg_temp.api('{"x-audit-reason": "Documento com indício de adulteração."}');
select throws_ok(
  $$update public.offers set status = 'suspended', suspended_category = 'documental_pending' where id = pg_temp.id('Q')$$,
  '23514', 'new row for relation "offers" violates check constraint "offers_suspended_category_check"',
  'X09: não há categoria de pendência documental');
select is(
  pg_temp.resultado($$update public.offers set status = 'suspended', suspended_category = 'forgery'
    where id = pg_temp.id('Q')$$),
  'linhas: 1',
  'T14: o operador suspende com categoria e motivo');
select pg_temp.api(null);
select is(
  (select suspended_category || '/' || suspended_reason || '/' || (suspended_by = pg_temp.id('O'))::text
     from public.offers where id = pg_temp.id('Q')),
  'forgery/Documento com indício de adulteração./true',
  'T14: categoria, motivo e autor gravados pelo gatilho');
select pg_temp.entrar('F1');
select throws_ok(
  $$update public.offers set asking_price = 46000 where id = pg_temp.id('Q')$$,
  'P0001', 'a oferta em suspended não pode ser editada',
  'B11: o fornecedor não edita a suspensa');
select throws_ok(
  $$update public.offers set status = 'withdrawn' where id = pg_temp.id('Q')$$,
  'P0001', 'transição de oferta inválida: suspended para withdrawn',
  'B11: o fornecedor não retira a suspensa');
select throws_ok(
  $$insert into public.supplier_declarations (offer_id, category, declared_value)
    values (pg_temp.id('Q'), 'lien', 'unknown')$$,
  'P0001', 'a oferta em suspended não pode ser editada',
  'B11: nem declara');
select pg_temp.entrar('O');
select pg_temp.api('{"x-audit-reason": "Conferido com o fornecedor."}');
select throws_ok(
  $$update public.offers set status = 'draft' where id = pg_temp.id('Q')$$,
  '42501', 'só o administrador da plataforma reativa a oferta suspensa',
  'T15: o operador não reativa');
select pg_temp.api(null);
select pg_temp.entrar('X');
select throws_ok(
  $$update public.offers set status = 'draft' where id = pg_temp.id('Q')$$,
  'P0001', 'informe o motivo',
  'T15: a reativação exige motivo');
select pg_temp.api('{"x-audit-reason": "Conferido com o fornecedor."}');
select is(
  pg_temp.resultado($$update public.offers set status = 'draft' where id = pg_temp.id('Q')$$),
  'linhas: 1',
  'T15: o administrador reativa, e a oferta volta a rascunho');
select pg_temp.api(null);

-- Revisão desligada (D10 = não) ------------------------------------------------------------

update public.platform_settings set value = 'false' where key = 'offer_review_required';
select pg_temp.entrar('F1');
select throws_ok(
  $$update public.offers set status = 'under_review', publication_authorized_by = pg_temp.id('F1')
    where id = pg_temp.id('D')$$,
  'P0001', 'a revisão antes de publicar não está ativa; publique direto',
  'X10: sem revisão exigida, ninguém leva a oferta a under_review');
select pg_temp.entrar('F2');
select throws_ok(
  $$update public.offers set status = 'published', publication_authorized_by = pg_temp.id('F2')
    where id = pg_temp.id('D')$$,
  '42501', 'só o administrador da empresa envia ou publica a oferta',
  'Q2: sem revisão, o member continua sem publicar');
select pg_temp.entrar('O');
select throws_ok(
  $$update public.offers set status = 'published', publication_authorized_by = pg_temp.id('O')
    where id = pg_temp.id('D')$$,
  '42501', 'só o administrador da empresa envia ou publica a oferta',
  'B2: sem revisão, o staff não publica o rascunho');
select pg_temp.entrar('F1');
select is(
  pg_temp.resultado($$update public.offers set status = 'published', publication_authorized_by = pg_temp.id('F1')
    where id = pg_temp.id('D')$$),
  'linhas: 1',
  'T06: sem revisão exigida, o org_admin publica direto');

-- T12: expiração, como o pg_cron (postgres, sem sessão) ----------------------------------

reset role;
select pg_temp.entrar(null);
-- Validade vencida simulada só nesta transação, com o gatilho desligado.
alter table public.offers disable trigger offers_proteger;
update public.offers set valid_until = now() - interval '1 minute' where id = pg_temp.id('E');
alter table public.offers enable trigger offers_proteger;
select ok(
  not private.oferta_aberta(pg_temp.id('E')) and private.oferta_aberta(pg_temp.id('R')),
  'B9: a vencida já não está aberta antes da rodada; a válida está');
select cmp_ok(private.expirar_ofertas(), '>=', 1, 'T12: a rotina expira as ofertas vencidas');
select is((select status from public.offers where id = pg_temp.id('E')), 'expired',
  'T12: a oferta vencida vai para expired');
select is(
  (select count(*)::int from public.field_history
    where entity_type = 'offers' and entity_id = pg_temp.id('E') and field = 'status'
      and new_value = '"expired"'::jsonb and changed_by is null),
  1,
  'T12: histórico do status com o sistema como ator');
select is(
  (select metadata ->> 'origem' from public.audit_logs
    where entity_type = 'offers' and entity_id = pg_temp.id('E') and metadata -> 'status' ->> 'para' = 'expired'),
  'expiracao',
  'T12: a auditoria marca a origem expiracao');
select throws_ok(
  $$update public.offers set asking_price = 1 where id = pg_temp.id('R')$$,
  '42501', 'fora da sessão de usuário, só a expiração muda a oferta',
  'X04: SQL sem sessão só expira');

set local role authenticated;
select pg_temp.entrar('F1');
select is(
  pg_temp.resultado($$update public.offers set status = 'draft' where id = pg_temp.id('E')$$),
  'linhas: 1',
  'T13: o org_admin reabre a vencida como rascunho');
reset role;
select pg_temp.entrar(null);

select * from finish();
rollback;
