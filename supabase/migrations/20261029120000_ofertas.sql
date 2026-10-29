-- I2.3: veículo, oferta, versões, declarações, fotos e documentos (ADR-0003;
-- especificação v1.1, §5.2, §5.3, §6.2, §6.7, §6.9 a §6.11).
--
-- * As transições são validadas no banco (§6.2). O gatilho proteger_oferta
--   aplica a tabela da seção 2.3 do ADR-0003, com o autor de cada uma; o
--   servidor terá a mesma tabela para responder cedo.
-- * Versão: um gatilho de restrição adiado chama versionar_oferta no fim da
--   transação. A função monta o snapshot material e grava a versão nova só
--   se ele mudou, uma por transação (§2.6). O hash é SHA-256 do JSON
--   canônico, calculado e conferido no banco (§2.7).
-- * Histórico por campo e auditoria por gatilho, na mesma transação (§2.8).
-- * O staff não edita conteúdo (Q3); o member prepara e o org_admin publica e
--   altera o que o comprador vê (Q2); placa, RENAVAM e chassi não mudam
--   depois da primeira publicação (Q4).
-- * Sem DELETE para ninguém. Declarações, versões, documentos e revisões são
--   só de inclusão (teste 11).
-- * Os buckets e a conferência do objeto no Storage entram na I2.4; a
--   expiração pelo pg_cron, na migração seguinte.

-- Utilitários de texto e de documento ------------------------------------------------

-- Texto de uma linha: sem espaços nas pontas, sem controle nem invisíveis.
create function private.texto_de_linha(valor text, maximo integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select valor = btrim(valor)
    and length(valor) between 1 and maximo
    and valor !~ '[\x01-\x1f\x7f­​-‏ -‮⁠-⁤⁦-⁩﻿]';
$$;

-- Texto livre: como o de linha, mas aceita quebra de linha (\n) no meio.
create function private.texto_livre(valor text, maximo integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select valor = btrim(valor, E' \n')
    and length(valor) between 1 and maximo
    and valor !~ '[\x01-\x09\x0b-\x1f\x7f­​-‏ -‮⁠-⁤⁦-⁩﻿]';
$$;

-- RENAVAM: 11 dígitos, "10 dígitos e um dígito verificador, calculado através
-- do módulo 11, peso 9" (Portaria DENATRAN 27/2013, art. 1º, § 1º). Pesos de 2
-- a 9 da direita para a esquerda sobre os 10 primeiros dígitos; resto 0 ou 1
-- dá dígito 0. O código antigo, de 9 dígitos, chega completado com zeros à
-- esquerda pelo servidor.
create function private.renavam_valido(valor text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  pesos constant integer[] := array[3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  soma integer := 0;
  dv integer;
begin
  if valor is null or valor !~ '^[0-9]{11}$' then
    return false;
  end if;
  for i in 1..10 loop
    soma := soma + substr(valor, i, 1)::integer * pesos[i];
  end loop;
  dv := 11 - soma % 11;
  if dv >= 10 then
    dv := 0;
  end if;
  return dv = substr(valor, 11, 1)::integer;
end;
$$;

comment on function private.renavam_valido(text) is
  'Dígito verificador do RENAVAM (Portaria DENATRAN 27/2013, módulo 11, peso 9). Espera 11 dígitos.';

-- Configuração -------------------------------------------------------------------------

create function private.configuracao(chave text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select s.value from public.platform_settings s where s.key = chave;
$$;

-- D10: sem a chave, vale o padrão conservador (revisão exigida).
create function private.revisao_exigida()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((private.configuracao('offer_review_required'))::boolean, true);
$$;

-- Validade (ADR-0003 §2.9): no futuro e antes do fim do dia (horário de
-- Brasília) que fica offer_max_validity_days dias à frente. Devolve o problema
-- ou nulo.
create function private.problema_da_validade(valor timestamptz)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  maximo integer := (private.configuracao('offer_max_validity_days'))::integer;
  limite timestamptz;
begin
  if valor is null then
    return 'informe a validade da oferta';
  end if;
  if valor <= now() then
    return 'a validade precisa estar no futuro';
  end if;
  if maximo is null then
    return 'a validade máxima não está configurada';
  end if;
  limite := (((now() at time zone 'America/Sao_Paulo')::date + maximo + 1)::timestamp)
            at time zone 'America/Sao_Paulo';
  if valor >= limite then
    return format('a validade passa do teto de %s dias', maximo);
  end if;
  return null;
end;
$$;

-- Tabelas --------------------------------------------------------------------------------

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  make text check (make is null or private.texto_de_linha(make, 80)),
  model text check (model is null or private.texto_de_linha(model, 80)),
  version text check (version is null or private.texto_de_linha(version, 120)),
  manufacture_year smallint check (manufacture_year is null or manufacture_year between 1900 and 2100),
  model_year smallint check (model_year is null or model_year between 1900 and 2101),
  mileage_km integer check (mileage_km is null or mileage_km between 0 and 9999999),
  fuel_type text check (fuel_type is null or private.texto_de_linha(fuel_type, 40)),
  transmission text check (transmission is null or private.texto_de_linha(transmission, 40)),
  color text check (color is null or private.texto_de_linha(color, 40)),
  body_type text check (body_type is null or private.texto_de_linha(body_type, 40)),
  plate text check (plate is null or plate ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),
  renavam text check (renavam is null or private.renavam_valido(renavam)),
  chassis text check (chassis is null or chassis ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicles_ano_do_modelo check (
    model_year is null or manufacture_year is null
    or model_year between manufacture_year and manufacture_year + 1)
);

comment on table public.vehicles is
  'Veículo da oferta (§5.2), uma linha por oferta, da empresa dona (ADR-0003 §2.11). Placa, RENAVAM e chassi são restritos: só a empresa dona e o staff.';

create index vehicles_empresa_idx on public.vehicles (organization_id);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null unique references public.vehicles (id) on delete restrict,
  supplier_organization_id uuid not null references public.organizations (id) on delete restrict,
  created_by uuid not null references public.profiles (id) on delete restrict,
  status text not null default 'draft' check (status in (
    'draft', 'under_review', 'published', 'reserved', 'sold', 'withdrawn', 'expired', 'suspended')),
  asking_price numeric(12, 2) check (asking_price is null or asking_price > 0),
  currency text not null default 'BRL' check (currency = 'BRL'),
  commercial_conditions text check (commercial_conditions is null or private.texto_livre(commercial_conditions, 2000)),
  location_city text check (location_city is null or private.texto_de_linha(location_city, 120)),
  location_state text check (location_state is null or location_state in (
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
    'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO')),
  publication_authorized_by uuid references public.profiles (id) on delete restrict,
  publication_authorized_at timestamptz,
  published_at timestamptz,
  valid_until timestamptz,
  availability_confirmed_at timestamptz,
  current_version integer check (current_version is null or current_version >= 1),
  withdrawn_by uuid references public.profiles (id) on delete restrict,
  withdrawn_at timestamptz,
  withdrawn_reason text check (withdrawn_reason is null or private.texto_livre(withdrawn_reason, 1000)),
  suspended_category text check (suspended_category is null or suspended_category in (
    'fraud_indication', 'forgery', 'deliberately_misleading', 'serious_risk')),
  suspended_reason text check (suspended_reason is null or private.texto_livre(suspended_reason, 1000)),
  suspended_by uuid references public.profiles (id) on delete restrict,
  suspended_at timestamptz,
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- CHECKs por estado (ADR-0003 §2.4; padrão portado, A.8). O gatilho recusa
  -- antes; estes seguram qualquer caminho que passe por ele.
  constraint offers_autorizacao_completa check (
    (publication_authorized_by is null) = (publication_authorized_at is null)),
  constraint offers_enviada_com_autorizacao check (
    status not in ('under_review', 'published', 'reserved') or publication_authorized_by is not null),
  constraint offers_enviada_completa check (
    status not in ('under_review', 'published', 'reserved')
    or (asking_price is not null and commercial_conditions is not null
        and location_city is not null and location_state is not null and valid_until is not null)),
  constraint offers_publicada_com_data check (
    status not in ('published', 'reserved', 'expired', 'sold') or published_at is not null),
  constraint offers_retirada_com_data check (
    status <> 'withdrawn' or withdrawn_at is not null),
  constraint offers_retirada_completa check (
    (withdrawn_at is null) = (withdrawn_by is null)),
  constraint offers_suspensao_completa check (
    (suspended_at is null) = (suspended_by is null)
    and (suspended_at is null) = (suspended_category is null)
    and (suspended_at is null) = (suspended_reason is null)),
  constraint offers_suspensa_com_motivo check (
    status <> 'suspended' or suspended_at is not null)
);

comment on table public.offers is
  'Oferta (§5.2). Transições validadas pelo gatilho proteger_oferta (ADR-0003 §2.3); versão pelo snapshot material (§2.6).';
comment on column public.offers.published_at is
  'Data da publicação mais recente. Não volta a nulo: marca que a oferta já foi publicada (Q4).';

create index offers_empresa_idx on public.offers (supplier_organization_id, status);
create index offers_vencimento_idx on public.offers (valid_until) where status in ('published', 'reserved');

create table public.offer_versions (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers (id) on delete restrict,
  version_number integer not null check (version_number >= 1),
  material_snapshot jsonb not null check (jsonb_typeof(material_snapshot) = 'object'),
  snapshot_hash text not null check (snapshot_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid references public.profiles (id) on delete restrict,
  change_summary text not null check (length(change_summary) between 1 and 2000),
  created_at timestamptz not null default now(),
  unique (offer_id, version_number)
);

comment on table public.offer_versions is
  'Versões da oferta, só de inclusão (§5.2). Só versionar_oferta grava; o hash é conferido por CHECK (ADR-0003 §2.6 e §2.7).';

create table public.supplier_declarations (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  offer_id uuid not null references public.offers (id) on delete restrict,
  category text not null check (category ~ '^[a-z][a-z0-9_]{0,63}$'),
  declared_value text not null check (declared_value in ('no_known_occurrence', 'has_occurrence', 'unknown')),
  detail text check (detail is null or private.texto_livre(detail, 2000)),
  declared_by uuid not null references public.profiles (id) on delete restrict,
  declared_at timestamptz not null default now(),
  constraint supplier_declarations_detalhe_com_ocorrencia check (
    declared_value <> 'has_occurrence' or detail is not null)
);

comment on table public.supplier_declarations is
  'Declarações do fornecedor, só de inclusão (§5.3). A vigente de cada categoria é a de maior seq.';

create index supplier_declarations_oferta_idx on public.supplier_declarations (offer_id, category, seq desc);

create table public.offer_media (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers (id) on delete restrict,
  storage_path text not null unique check (length(storage_path) <= 300),
  display_order integer not null default 0 check (display_order between 0 and 999),
  uploaded_by uuid not null references public.profiles (id) on delete restrict,
  uploaded_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid references public.profiles (id) on delete restrict,
  constraint offer_media_remocao_completa check ((removed_at is null) = (removed_by is null))
);

comment on table public.offer_media is
  'Fotos da oferta (§5.2). Remover marca removed_at e mantém o objeto (ADR-0003 §2.13).';

create index offer_media_oferta_idx on public.offer_media (offer_id, display_order);

create table public.offer_documents (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers (id) on delete restrict,
  kind text not null check (kind in ('crlv', 'laudo_cautelar', 'certidao', 'relatorio_de_consulta', 'nota_fiscal', 'outro')),
  storage_path text not null unique check (length(storage_path) <= 300),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  description text check (description is null or private.texto_de_linha(description, 300)),
  uploaded_by uuid not null references public.profiles (id) on delete restrict,
  uploaded_at timestamptz not null default now(),
  buyer_visibility text not null default 'hidden' check (buyer_visibility in ('hidden', 'approved_buyers')),
  constraint offer_documents_oculto_ate_d5 check (buyer_visibility = 'hidden')
);

comment on table public.offer_documents is
  'Documentos da oferta, só de inclusão (§5.2). Ocultos ao comprador até a decisão D5 (ADR-0003 §2.13).';

create index offer_documents_oferta_idx on public.offer_documents (offer_id);

create table public.offer_reviews (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers (id) on delete restrict,
  offer_version_id uuid not null references public.offer_versions (id) on delete restrict,
  decision text not null check (decision in ('published', 'returned')),
  reason text check (reason is null or private.texto_livre(reason, 1000)),
  reviewed_by uuid not null references public.profiles (id) on delete restrict,
  reviewed_at timestamptz not null default now(),
  constraint offer_reviews_devolucao_com_motivo check (decision <> 'returned' or reason is not null)
);

comment on table public.offer_reviews is
  'Decisões da revisão antes de publicar (D10), só de inclusão, com a versão revisada (ADR-0003 §2.2).';

create index offer_reviews_oferta_idx on public.offer_reviews (offer_id, reviewed_at desc);

-- Funções de acesso (ADR-0003 §2.14) ----------------------------------------------------

create function private.ofertas_do_usuario()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select o.id from public.offers o
  where o.supplier_organization_id in (select private.empresas_do_usuario());
$$;

create function private.veiculos_do_usuario()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select v.id from public.vehicles v
  where v.organization_id in (select private.empresas_do_usuario());
$$;

-- Oferta aberta a interesse (Inc. 4 e 5): publicada ou reservada, dentro da
-- validade e de empresa ativa. Vale entre duas rodadas da expiração (§2.9).
create function private.oferta_aberta(p_oferta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.offers o
    join public.organizations e on e.id = o.supplier_organization_id
    where o.id = p_oferta
      and o.status in ('published', 'reserved')
      and o.valid_until > now()
      and e.status = 'active');
$$;

-- Impedimento de transferência (D9): a tabela chega no Inc. 3, que substitui
-- esta função. Até lá, nenhuma oferta tem impedimento registrado.
create function private.tem_impedimento_ativo(p_oferta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select false and p_oferta is not null;
$$;

-- Estado documental a partir só da declaração (§6.4; base da I2.5).
create function private.estado_pela_declaracao(valor text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case valor
    when 'no_known_occurrence' then 'declared_unverified'
    when 'has_occurrence' then 'with_findings'
    else 'not_checked'
  end;
$$;

-- Requisitos de publicação (§6.2; ADR-0003 §2.4). Devolve o que falta; lista
-- vazia quer dizer que a oferta pode ser enviada ou publicada.
create function private.pendencias_de_publicacao(p_oferta uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  o public.offers;
  v public.vehicles;
  faltas text[] := '{}';
begin
  select * into o from public.offers where id = p_oferta;
  if not found then
    raise exception 'oferta não encontrada' using errcode = 'P0002';
  end if;
  select * into v from public.vehicles where id = o.vehicle_id;

  if not exists (
    select 1 from public.organizations e
    where e.id = o.supplier_organization_id and e.status = 'active' and e.kind in ('supplier', 'both')) then
    faltas := array_append(faltas, 'supplier');
  end if;
  faltas := faltas || array_remove(array[
    case when v.make is null then 'make' end,
    case when v.model is null then 'model' end,
    case when v.version is null then 'version' end,
    case when v.manufacture_year is null then 'manufacture_year' end,
    case when v.model_year is null then 'model_year' end,
    case when v.mileage_km is null then 'mileage_km' end,
    case when v.fuel_type is null then 'fuel_type' end,
    case when v.transmission is null then 'transmission' end,
    case when v.color is null then 'color' end,
    case when v.body_type is null then 'body_type' end,
    case when v.plate is null then 'plate' end,
    case when v.renavam is null then 'renavam' end,
    case when v.chassis is null then 'chassis' end,
    case when o.location_city is null or o.location_state is null then 'location' end,
    case when o.asking_price is null then 'asking_price' end,
    case when o.commercial_conditions is null then 'commercial_conditions' end,
    case when private.problema_da_validade(o.valid_until) is not null then 'valid_until' end
  ], null);
  faltas := faltas || array(
    select 'declaration:' || c.categoria
    from jsonb_array_elements_text(coalesce(private.configuracao('document_categories'), '[]')) as c(categoria)
    where not exists (
      select 1 from public.supplier_declarations d
      where d.offer_id = p_oferta and d.category = c.categoria)
    order by c.categoria collate "C");
  if private.tem_impedimento_ativo(p_oferta) then
    faltas := array_append(faltas, 'transfer_impediment');
  end if;
  return faltas;
end;
$$;

-- Snapshot e hash (ADR-0003 §2.6 e §2.7) ----------------------------------------------

-- JSON canônico: subconjunto do JCS (RFC 8785). Chaves ASCII em ordem de
-- código, sem espaços; valores só texto, nulo, booleano, objeto e lista. O
-- escape de texto do Postgres coincide com o do JCS (conferido na I2.3).
create function private.json_canonico(valor jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  saida text;
begin
  case jsonb_typeof(valor)
    when 'object' then
      if exists (select 1 from jsonb_object_keys(valor) as k where k !~ '^[\x20-\x7e]*$') then
        raise exception 'o snapshot só aceita chaves ASCII' using errcode = '22023';
      end if;
      select '{' || coalesce(string_agg(to_jsonb(e.chave)::text || ':' || private.json_canonico(e.item),
                                        ',' order by e.chave collate "C"), '') || '}'
      into saida
      from jsonb_each(valor) as e(chave, item);
      return saida;
    when 'array' then
      select '[' || coalesce(string_agg(private.json_canonico(a.item), ',' order by a.n), '') || ']'
      into saida
      from jsonb_array_elements(valor) with ordinality as a(item, n);
      return saida;
    when 'string' then
      return valor::text;
    when 'boolean' then
      return valor::text;
    when 'null' then
      return 'null';
    else
      raise exception 'o snapshot não aceita números; grave-os como texto' using errcode = '22023';
  end case;
end;
$$;

create function private.hash_do_snapshot(snapshot jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(private.json_canonico(snapshot), 'UTF8')), 'hex');
$$;

alter table public.offer_versions
  add constraint offer_versions_hash_confere check (snapshot_hash = private.hash_do_snapshot(material_snapshot));

-- Snapshot material, sem o número da versão. Placa, RENAVAM e chassi nunca
-- entram, qualquer que seja a configuração (§5.2, §7.2).
create function private.snapshot_da_oferta(p_oferta uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  materiais jsonb := coalesce(private.configuracao('material_fields'), '[]');
  registro jsonb;
  campos jsonb := '{}';
  categorias jsonb := '{}';
  estados text[] := '{}';
  avisos jsonb;
  com_declaracao boolean;
  com_estado boolean;
  item text;
  linha record;
  objeto jsonb;
  estado text;
  resultado jsonb;
begin
  if jsonb_typeof(materiais) <> 'array' then
    raise exception 'material_fields precisa ser uma lista' using errcode = '22023';
  end if;
  com_declaracao := materiais ? 'supplier_declarations';
  com_estado := materiais ? 'documental_states' or materiais ? 'findings';

  select jsonb_build_object(
    'asking_price', o.asking_price::text,
    'commercial_conditions', o.commercial_conditions,
    'location_city', o.location_city,
    'location_state', o.location_state,
    'make', v.make,
    'model', v.model,
    'version', v.version,
    'manufacture_year', v.manufacture_year::text,
    'model_year', v.model_year::text,
    'mileage_km', v.mileage_km::text,
    'fuel_type', v.fuel_type,
    'transmission', v.transmission,
    'color', v.color,
    'body_type', v.body_type)
  into registro
  from public.offers o
  join public.vehicles v on v.id = o.vehicle_id
  where o.id = p_oferta;

  for item in select jsonb_array_elements_text(materiais) loop
    if registro ? item then
      campos := campos || jsonb_build_object(item, registro -> item);
    end if;
  end loop;

  for linha in
    select c.categoria, d.declared_value, d.detail
    from (
      select jsonb_array_elements_text(coalesce(private.configuracao('document_categories'), '[]')) as categoria
      union
      select sd.category from public.supplier_declarations sd where sd.offer_id = p_oferta
    ) c
    left join lateral (
      select sd.declared_value, sd.detail
      from public.supplier_declarations sd
      where sd.offer_id = p_oferta and sd.category = c.categoria
      order by sd.seq desc
      limit 1
    ) d on true
  loop
    estado := private.estado_pela_declaracao(linha.declared_value);
    estados := estados || estado;
    objeto := '{}';
    if com_declaracao then
      objeto := objeto || jsonb_build_object('declaration',
        case when linha.declared_value is null then 'null'::jsonb
             else jsonb_build_object('value', linha.declared_value, 'detail', linha.detail) end);
    end if;
    if com_estado then
      objeto := objeto || jsonb_build_object('state', estado);
    end if;
    categorias := categorias || jsonb_build_object(linha.categoria, objeto);
  end loop;

  -- Ressalvas exibidas (§5.2): códigos com a versão do texto do catálogo.
  select coalesce(jsonb_agg(a.codigo order by a.codigo collate "C"), '[]')
  into avisos
  from (
    select distinct case e.estado
      when 'not_checked' then 'categoria_nao_consultada.v1'
      when 'declared_unverified' then 'declaracao_sem_comprovacao.v1'
      when 'with_findings' then 'categoria_com_apontamentos.v1'
    end as codigo
    from unnest(estados) as e(estado)
  ) a
  where a.codigo is not null;

  resultado := jsonb_build_object(
    'schema_version', '1',
    'offer_id', p_oferta::text,
    'fields', campos,
    'categories', categorias,
    'notices', avisos);
  if materiais ? 'transfer_impediments' then
    resultado := resultado || jsonb_build_object('transfer_impediments', '[]'::jsonb);
  end if;
  return resultado;
end;
$$;

-- Caminhos do snapshot que mudaram entre duas versões.
create function private.resumo_da_mudanca(antes jsonb, depois jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when antes is null then 'versão inicial'
    else coalesce(string_agg(d.caminho, ', ' order by d.caminho collate "C"), 'sem mudança')
  end
  from (
    select 'fields.' || k.chave as caminho
    from (
      select jsonb_object_keys(coalesce(antes -> 'fields', '{}')) as chave
      union
      select jsonb_object_keys(coalesce(depois -> 'fields', '{}'))
    ) k
    where antes -> 'fields' -> k.chave is distinct from depois -> 'fields' -> k.chave
    union all
    select 'categories.' || k.chave
    from (
      select jsonb_object_keys(coalesce(antes -> 'categories', '{}')) as chave
      union
      select jsonb_object_keys(coalesce(depois -> 'categories', '{}'))
    ) k
    where antes -> 'categories' -> k.chave is distinct from depois -> 'categories' -> k.chave
    union all
    select s.secao
    from (values ('notices'), ('transfer_impediments')) as s(secao)
    where antes -> s.secao is distinct from depois -> s.secao
  ) d;
$$;

-- Grava a versão nova se o snapshot mudou (ADR-0003 §2.6).
create function private.versionar_oferta(p_oferta uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  vigente public.offer_versions;
  novo jsonb;
  numero integer;
begin
  perform 1 from public.offers o where o.id = p_oferta for update;
  if not found then
    return;
  end if;
  select * into vigente
  from public.offer_versions v
  where v.offer_id = p_oferta
  order by v.version_number desc
  limit 1;
  novo := private.snapshot_da_oferta(p_oferta);
  if vigente.id is not null and (vigente.material_snapshot - 'version_number') = novo then
    return;
  end if;
  numero := coalesce(vigente.version_number, 0) + 1;
  novo := novo || jsonb_build_object('version_number', numero::text);
  insert into public.offer_versions (offer_id, version_number, material_snapshot, snapshot_hash, created_by, change_summary)
  values (p_oferta, numero, novo, private.hash_do_snapshot(novo), (select auth.uid()),
          private.resumo_da_mudanca(vigente.material_snapshot, novo));
  update public.offers set current_version = numero where id = p_oferta;
end;
$$;

-- Gatilho de restrição adiado: uma chamada por linha alterada, no fim da
-- transação; a partir da segunda, o snapshot já é igual e nada é gravado.
create function private.versionar_pelo_registro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  oferta uuid;
begin
  if tg_table_name = 'offers' then
    if tg_op = 'UPDATE'
       and (to_jsonb(new) - array['current_version', 'updated_at'])
           = (to_jsonb(old) - array['current_version', 'updated_at']) then
      return null;
    end if;
    oferta := new.id;
  elsif tg_table_name = 'vehicles' then
    select o.id into oferta from public.offers o where o.vehicle_id = new.id;
  else
    oferta := new.offer_id;
  end if;
  if oferta is not null then
    perform private.versionar_oferta(oferta);
  end if;
  return null;
end;
$$;

-- Gatilhos de proteção (ADR-0003 §2.3, §2.5 e §2.10 a §2.13) --------------------------

-- Lista as colunas que mudaram, sem updated_at.
create function private.colunas_alteradas(antes jsonb, depois jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(k order by k collate "C"), '{}')
  from jsonb_object_keys(depois) as k
  where k <> 'updated_at' and depois -> k is distinct from antes -> k;
$$;

-- Motivo enviado pelo servidor no cabeçalho x-audit-reason (ADR-0002 §2.11).
create function private.motivo_obrigatorio()
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  motivo text := private.cabecalho('x-audit-reason');
begin
  if motivo is null then
    raise exception 'informe o motivo' using errcode = 'P0001';
  end if;
  if not private.texto_livre(motivo, 1000) then
    raise exception 'o motivo tem caracteres não permitidos ou passa de 1000 caracteres' using errcode = 'P0001';
  end if;
  return motivo;
end;
$$;

-- Quem pode mexer no conteúdo da oferta (veículo, declarações, fotos e
-- documentos) no estado atual: F no rascunho; org_admin na publicada ou
-- reservada (Q2); ninguém nos demais estados. Staff nunca (Q3).
create function private.conferir_edicao(empresa uuid, situacao text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if situacao = 'draft' then
    if not private.membro_ativo(empresa) then
      raise exception 'só membro ativo da empresa dona edita a oferta' using errcode = '42501';
    end if;
  elsif situacao in ('published', 'reserved') then
    if not private.membro_ativo(empresa, array['org_admin']) then
      raise exception 'só o administrador da empresa altera oferta publicada ou reservada' using errcode = '42501';
    end if;
  else
    raise exception 'a oferta em % não pode ser editada', situacao using errcode = 'P0001';
  end if;
end;
$$;

create function private.proteger_oferta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ator uuid := (select auth.uid());
  alterados text[];
  permitidos text[] := array['status'];
  eh_membro boolean;
  eh_adm_empresa boolean;
  eh_staff boolean;
  eh_admin boolean;
  tem_vinculo boolean;
  revisao boolean;
  motivo text;
  pendencias text[];
  problema text;
  versao uuid;
begin
  if tg_op = 'INSERT' then
    if ator is null then
      raise exception 'cadastrar oferta exige sessão de usuário' using errcode = '42501';
    end if;
    if not private.membro_ativo(new.supplier_organization_id) then
      raise exception 'só membro ativo da empresa fornecedora cadastra oferta' using errcode = '42501';
    end if;
    if not exists (
      select 1 from public.organizations e
      where e.id = new.supplier_organization_id and e.kind in ('supplier', 'both')) then
      raise exception 'a empresa não é fornecedora' using errcode = 'P0001';
    end if;
    if not exists (
      select 1 from public.vehicles v
      where v.id = new.vehicle_id and v.organization_id = new.supplier_organization_id) then
      raise exception 'o veículo não é da empresa da oferta' using errcode = '42501';
    end if;
    if new.valid_until is not null then
      problema := private.problema_da_validade(new.valid_until);
      if problema is not null then
        raise exception '%', problema using errcode = 'P0001';
      end if;
    end if;
    new.status := 'draft';
    new.created_by := ator;
    new.currency := 'BRL';
    new.is_test := (select e.is_test from public.organizations e where e.id = new.supplier_organization_id);
    new.current_version := null;
    new.publication_authorized_by := null;
    new.publication_authorized_at := null;
    new.published_at := null;
    new.availability_confirmed_at := null;
    new.withdrawn_by := null;
    new.withdrawn_at := null;
    new.withdrawn_reason := null;
    new.suspended_category := null;
    new.suspended_reason := null;
    new.suspended_by := null;
    new.suspended_at := null;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  alterados := private.colunas_alteradas(to_jsonb(old), to_jsonb(new));
  if cardinality(alterados) = 0 then
    return new;
  end if;
  if alterados && array['id', 'vehicle_id', 'supplier_organization_id', 'created_by', 'created_at', 'is_test', 'currency'] then
    raise exception 'empresa, veículo, autor e marcação de teste da oferta não mudam' using errcode = '42501';
  end if;

  -- Escrita interna: versionar_oferta só grava current_version.
  if pg_trigger_depth() > 1 then
    if alterados = array['current_version'] then
      return new;
    end if;
    raise exception 'escrita interna inválida na oferta' using errcode = '42501';
  end if;
  if 'current_version' = any (alterados) then
    raise exception 'a versão vigente só muda pelo versionamento' using errcode = '42501';
  end if;

  -- Fora da sessão de usuário, só a expiração (ADR-0003 §2.9; X04).
  if private.manutencao() then
    if alterados = array['status'] and old.status in ('published', 'reserved')
       and new.status = 'expired' and old.valid_until <= now() then
      return new;
    end if;
    raise exception 'fora da sessão de usuário, só a expiração muda a oferta' using errcode = '42501';
  end if;
  if ator is null then
    raise exception 'alterar oferta exige sessão de usuário' using errcode = '42501';
  end if;

  eh_membro := private.membro_ativo(old.supplier_organization_id);
  eh_adm_empresa := private.membro_ativo(old.supplier_organization_id, array['org_admin']);
  -- Conflito de interesse (B25): com vínculo não removido, só como fornecedor.
  tem_vinculo := exists (
    select 1 from public.organization_members m
    where m.organization_id = old.supplier_organization_id and m.profile_id = ator and m.status <> 'removed');
  eh_staff := not tem_vinculo and private.tem_papel_na_plataforma(array['admin', 'operator']);
  eh_admin := not tem_vinculo and private.tem_papel_na_plataforma(array['admin']);

  if new.status is distinct from old.status then
    revisao := private.revisao_exigida();

    if old.status = 'draft' and new.status in ('under_review', 'published') then
      -- T03 e T06
      if not eh_adm_empresa then
        raise exception 'só o administrador da empresa envia ou publica a oferta' using errcode = '42501';
      end if;
      if revisao and new.status = 'published' then
        raise exception 'com revisão exigida, a oferta vai para revisão antes de publicar' using errcode = 'P0001';
      end if;
      if not revisao and new.status = 'under_review' then
        raise exception 'a revisão antes de publicar não está ativa; publique direto' using errcode = 'P0001';
      end if;
      if new.publication_authorized_by is distinct from ator then
        raise exception 'declare a autorização de divulgação no envio' using errcode = 'P0001';
      end if;
      permitidos := array_append(permitidos, 'publication_authorized_by');
      pendencias := private.pendencias_de_publicacao(old.id);
      if cardinality(pendencias) > 0 then
        raise exception 'oferta incompleta para publicar: %', array_to_string(pendencias, ', ') using errcode = 'P0001';
      end if;
      new.publication_authorized_at := now();
      if new.status = 'published' then
        new.published_at := now();
      end if;

    elsif old.status = 'under_review' and new.status = 'draft' then
      if eh_membro then
        -- T18: cancelamento do envio pelo fornecedor
        null;
      elsif eh_staff then
        -- T05: devolução com motivo
        motivo := private.motivo_obrigatorio();
        select v.id into versao from public.offer_versions v
        where v.offer_id = old.id and v.version_number = old.current_version;
        insert into public.offer_reviews (offer_id, offer_version_id, decision, reason, reviewed_by)
        values (old.id, versao, 'returned', motivo, ator);
      else
        raise exception 'sem permissão para tirar a oferta da revisão' using errcode = '42501';
      end if;
      new.publication_authorized_by := null;
      new.publication_authorized_at := null;

    elsif old.status = 'under_review' and new.status = 'published' then
      -- T04
      if not eh_staff then
        raise exception 'só o operador ou o administrador publica a oferta revisada' using errcode = '42501';
      end if;
      pendencias := private.pendencias_de_publicacao(old.id);
      if cardinality(pendencias) > 0 then
        raise exception 'oferta incompleta para publicar: %', array_to_string(pendencias, ', ') using errcode = 'P0001';
      end if;
      new.published_at := now();
      select v.id into versao from public.offer_versions v
      where v.offer_id = old.id and v.version_number = old.current_version;
      insert into public.offer_reviews (offer_id, offer_version_id, decision, reason, reviewed_by)
      values (old.id, versao, 'published', private.cabecalho('x-audit-reason'), ator);

    elsif (old.status = 'published' and new.status = 'reserved')
       or (old.status = 'reserved' and new.status = 'published') then
      -- T08 e T09
      if not (eh_adm_empresa or eh_staff) then
        raise exception 'só o administrador da empresa ou a plataforma reserva a oferta' using errcode = '42501';
      end if;

    elsif new.status = 'withdrawn' and old.status in ('draft', 'under_review', 'published', 'reserved', 'expired') then
      -- T11
      if eh_adm_empresa then
        motivo := private.cabecalho('x-audit-reason');
        if motivo is not null and not private.texto_livre(motivo, 1000) then
          raise exception 'o motivo tem caracteres não permitidos ou passa de 1000 caracteres' using errcode = 'P0001';
        end if;
      elsif eh_staff then
        motivo := private.motivo_obrigatorio();
      else
        raise exception 'só o administrador da empresa ou a plataforma retira a oferta' using errcode = '42501';
      end if;
      new.withdrawn_by := ator;
      new.withdrawn_at := now();
      new.withdrawn_reason := motivo;

    elsif old.status in ('withdrawn', 'expired') and new.status = 'draft' then
      -- T19 e T13
      if not eh_adm_empresa then
        raise exception 'só o administrador da empresa reabre a oferta' using errcode = '42501';
      end if;
      new.publication_authorized_by := null;
      new.publication_authorized_at := null;

    elsif new.status = 'suspended' and old.status not in ('sold', 'suspended') then
      -- T14 (§6.10)
      if not eh_staff then
        raise exception 'só o operador ou o administrador suspende a oferta' using errcode = '42501';
      end if;
      if new.suspended_category is null or 'suspended_category' <> all (alterados) then
        raise exception 'informe a categoria da suspensão' using errcode = 'P0001';
      end if;
      permitidos := array_append(permitidos, 'suspended_category');
      new.suspended_reason := private.motivo_obrigatorio();
      new.suspended_by := ator;
      new.suspended_at := now();

    elsif old.status = 'suspended' and new.status = 'draft' then
      -- T15
      if not eh_admin then
        raise exception 'só o administrador da plataforma reativa a oferta suspensa' using errcode = '42501';
      end if;
      perform private.motivo_obrigatorio();
      new.publication_authorized_by := null;
      new.publication_authorized_at := null;

    else
      raise exception 'transição de oferta inválida: % para %', old.status, new.status using errcode = 'P0001';
    end if;

    if exists (select 1 from unnest(alterados) as a(c) where a.c <> all (permitidos)) then
      raise exception 'mude o conteúdo e o status da oferta em operações separadas' using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- Sem mudança de status: conteúdo, validade ou disponibilidade. As demais
  -- colunas são do gatilho ou da transição, mesmo que um GRANT as abra.
  if exists (
    select 1 from unnest(alterados) as a(c)
    where a.c not in ('asking_price', 'commercial_conditions', 'location_city', 'location_state',
                      'valid_until', 'availability_confirmed_at')) then
    raise exception 'esse campo da oferta só muda pela transição ou pelo próprio banco' using errcode = '42501';
  end if;
  if not eh_membro then
    raise exception 'a equipe da plataforma não edita o conteúdo da oferta' using errcode = '42501';
  end if;

  if 'availability_confirmed_at' = any (alterados) then
    -- T16
    if alterados <> array['availability_confirmed_at'] then
      raise exception 'confirme a disponibilidade numa operação própria' using errcode = 'P0001';
    end if;
    if old.status not in ('published', 'reserved') then
      raise exception 'a disponibilidade se confirma em oferta publicada ou reservada' using errcode = 'P0001';
    end if;
    new.availability_confirmed_at := now();
    return new;
  end if;

  perform private.conferir_edicao(old.supplier_organization_id, old.status);
  if 'valid_until' = any (alterados) and new.valid_until is not null then
    problema := private.problema_da_validade(new.valid_until);
    if problema is not null then
      raise exception '%', problema using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create function private.proteger_veiculo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ator uuid := (select auth.uid());
  alterados text[];
  oferta public.offers;
begin
  if tg_op = 'INSERT' then
    if ator is null or not private.membro_ativo(new.organization_id) then
      raise exception 'só membro ativo da empresa fornecedora cadastra veículo' using errcode = '42501';
    end if;
    if not exists (
      select 1 from public.organizations e
      where e.id = new.organization_id and e.kind in ('supplier', 'both')) then
      raise exception 'a empresa não é fornecedora' using errcode = 'P0001';
    end if;
    new.created_by := ator;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  alterados := private.colunas_alteradas(to_jsonb(old), to_jsonb(new));
  if cardinality(alterados) = 0 then
    return new;
  end if;
  if alterados && array['id', 'organization_id', 'created_by', 'created_at'] then
    raise exception 'empresa e autor do veículo não mudam' using errcode = '42501';
  end if;
  if pg_trigger_depth() > 1 or ator is null then
    raise exception 'alterar veículo exige sessão de usuário' using errcode = '42501';
  end if;

  select * into oferta from public.offers o where o.vehicle_id = old.id;
  if not found then
    if not private.membro_ativo(old.organization_id) then
      raise exception 'só membro ativo da empresa dona edita o veículo' using errcode = '42501';
    end if;
    return new;
  end if;
  perform private.conferir_edicao(old.organization_id, oferta.status);
  if oferta.published_at is not null and alterados && array['plate', 'renavam', 'chassis'] then
    raise exception 'placa, RENAVAM e chassi não mudam depois da primeira publicação' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create function private.proteger_declaracao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ator uuid := (select auth.uid());
  oferta public.offers;
begin
  if ator is null then
    raise exception 'declarar exige sessão de usuário' using errcode = '42501';
  end if;
  select * into oferta from public.offers o where o.id = new.offer_id;
  -- Mesma resposta para oferta inexistente e alheia: não revela se ela existe.
  if not found or not private.membro_ativo(oferta.supplier_organization_id) then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  -- B5: só o fornecedor declara; o staff, sem vínculo com a empresa dona, para acima.
  perform private.conferir_edicao(oferta.supplier_organization_id, oferta.status);
  if not coalesce(private.configuracao('document_categories'), '[]') ? new.category then
    raise exception 'categoria documental fora da configuração: %', new.category using errcode = 'P0001';
  end if;
  new.declared_by := ator;
  new.declared_at := now();
  return new;
end;
$$;

-- Caminho no Storage: <empresa>/<oferta>/<uuid>.<extensão> (ADR-0003 §2.13).
create function private.caminho_da_oferta(caminho text, oferta public.offers, extensoes text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select caminho ~ ('^' || oferta.supplier_organization_id::text || '/' || oferta.id::text
                    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(' || extensoes || ')$');
$$;

create function private.proteger_foto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ator uuid := (select auth.uid());
  oferta public.offers;
  alterados text[];
begin
  if ator is null then
    raise exception 'gerenciar fotos exige sessão de usuário' using errcode = '42501';
  end if;
  select * into oferta from public.offers o where o.id = new.offer_id;
  -- Mesma resposta para oferta inexistente e alheia: não revela se ela existe.
  if not found or not private.membro_ativo(oferta.supplier_organization_id) then
    raise exception 'sem permissão' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    perform private.conferir_edicao(oferta.supplier_organization_id, oferta.status);
    if not private.caminho_da_oferta(new.storage_path, oferta, 'jpg|jpeg|png|webp') then
      raise exception 'caminho da foto fora do padrão da oferta' using errcode = 'P0001';
    end if;
    new.uploaded_by := ator;
    new.uploaded_at := now();
    new.removed_at := null;
    new.removed_by := null;
    return new;
  end if;

  alterados := private.colunas_alteradas(to_jsonb(old), to_jsonb(new));
  if cardinality(alterados) = 0 then
    return new;
  end if;
  if exists (select 1 from unnest(alterados) as a(c) where a.c not in ('display_order', 'removed_at')) then
    raise exception 'da foto, só mudam a ordem e a remoção' using errcode = '42501';
  end if;
  if old.removed_at is not null then
    raise exception 'foto removida não muda' using errcode = 'P0001';
  end if;
  perform private.conferir_edicao(oferta.supplier_organization_id, oferta.status);
  if 'removed_at' = any (alterados) then
    new.removed_at := now();
    new.removed_by := ator;
  end if;
  return new;
end;
$$;

create function private.proteger_documento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ator uuid := (select auth.uid());
  oferta public.offers;
begin
  if ator is null then
    raise exception 'enviar documento exige sessão de usuário' using errcode = '42501';
  end if;
  select * into oferta from public.offers o where o.id = new.offer_id;
  -- Mesma resposta para oferta inexistente e alheia: não revela se ela existe.
  if not found or not private.membro_ativo(oferta.supplier_organization_id) then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  perform private.conferir_edicao(oferta.supplier_organization_id, oferta.status);
  if not private.caminho_da_oferta(new.storage_path, oferta, 'pdf|jpg|jpeg|png|webp') then
    raise exception 'caminho do documento fora do padrão da oferta' using errcode = 'P0001';
  end if;
  new.uploaded_by := ator;
  new.uploaded_at := now();
  return new;
end;
$$;

-- Histórico por campo (ADR-0003 §2.8; §5.6) -----------------------------------------

create function private.registrar_historico()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  antes jsonb := to_jsonb(old);
  depois jsonb := to_jsonb(new);
begin
  insert into public.field_history (entity_type, entity_id, field, old_value, new_value, changed_by)
  select tg_table_name, new.id, k, antes -> k, depois -> k, (select auth.uid())
  from jsonb_object_keys(depois) as k
  where k not in ('updated_at', 'current_version') and depois -> k is distinct from antes -> k;
  return null;
end;
$$;

-- Auditoria: a função da I1.3 passa a cobrir as tabelas da oferta -------------------

create or replace function private.registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  antes jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  depois jsonb := to_jsonb(new);
  campos text[];
  metadados jsonb := '{}'::jsonb;
  motivo text := private.cabecalho('x-audit-reason');
  empresa uuid;
begin
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(chave order by chave), '{}') into campos
    from jsonb_object_keys(depois) as chave
    where chave not in ('updated_at', 'current_version') and depois -> chave is distinct from antes -> chave;
    if cardinality(campos) = 0 then
      return null;
    end if;
    metadados := jsonb_build_object('campos', to_jsonb(campos));
  end if;

  if depois ? 'status' and (tg_op = 'INSERT' or 'status' = any (campos)) then
    metadados := metadados || jsonb_build_object(
      'status', jsonb_build_object('de', antes ->> 'status', 'para', depois ->> 'status'));
  end if;
  if depois ? 'role' and (tg_op = 'INSERT' or 'role' = any (campos)) then
    metadados := metadados || jsonb_build_object(
      'role', jsonb_build_object('de', antes ->> 'role', 'para', depois ->> 'role'));
  end if;
  if tg_table_name = 'platform_settings' then
    metadados := metadados || jsonb_build_object('chave', depois ->> 'key');
  end if;
  if tg_table_name = 'offers' and (select auth.uid()) is null and depois ->> 'status' = 'expired'
     and antes ->> 'status' is distinct from 'expired' then
    metadados := metadados || jsonb_build_object('origem', 'expiracao');
  end if;
  if motivo is not null then
    metadados := metadados || jsonb_build_object('motivo', left(motivo, 1000));
  end if;

  empresa := case tg_table_name
    when 'organizations' then (depois ->> 'id')::uuid
    when 'organization_members' then (depois ->> 'organization_id')::uuid
    when 'membership_applications' then (depois ->> 'organization_id')::uuid
    when 'offers' then (depois ->> 'supplier_organization_id')::uuid
    when 'vehicles' then (depois ->> 'organization_id')::uuid
  end;
  if empresa is null and depois ? 'offer_id' then
    select o.supplier_organization_id into empresa from public.offers o where o.id = (depois ->> 'offer_id')::uuid;
  end if;

  insert into public.audit_logs
    (actor_profile_id, actor_organization_id, action, entity_type, entity_id, metadata, request_id)
  values (
    (select auth.uid()),
    empresa,
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    coalesce(depois ->> 'id', depois ->> 'application_id')::uuid,
    metadados,
    left(private.cabecalho('x-request-id'), 200));
  return null;
end;
$$;

-- Gatilhos ---------------------------------------------------------------------------------

create trigger vehicles_proteger
  before insert or update on public.vehicles
  for each row execute function private.proteger_veiculo();
create trigger offers_proteger
  before insert or update on public.offers
  for each row execute function private.proteger_oferta();
create trigger supplier_declarations_proteger
  before insert on public.supplier_declarations
  for each row execute function private.proteger_declaracao();
create trigger offer_media_proteger
  before insert or update on public.offer_media
  for each row execute function private.proteger_foto();
create trigger offer_documents_proteger
  before insert on public.offer_documents
  for each row execute function private.proteger_documento();

create trigger vehicles_updated_at before update on public.vehicles
  for each row execute function private.atualizar_updated_at();
create trigger offers_updated_at before update on public.offers
  for each row execute function private.atualizar_updated_at();

create trigger vehicles_historico after update on public.vehicles
  for each row execute function private.registrar_historico();
create trigger offers_historico after update on public.offers
  for each row execute function private.registrar_historico();

create trigger vehicles_auditoria after insert or update on public.vehicles
  for each row execute function private.registrar_auditoria();
create trigger offers_auditoria after insert or update on public.offers
  for each row execute function private.registrar_auditoria();
create trigger offer_versions_auditoria after insert on public.offer_versions
  for each row execute function private.registrar_auditoria();
create trigger supplier_declarations_auditoria after insert on public.supplier_declarations
  for each row execute function private.registrar_auditoria();
create trigger offer_media_auditoria after insert or update on public.offer_media
  for each row execute function private.registrar_auditoria();
create trigger offer_documents_auditoria after insert on public.offer_documents
  for each row execute function private.registrar_auditoria();
create trigger offer_reviews_auditoria after insert on public.offer_reviews
  for each row execute function private.registrar_auditoria();

create constraint trigger offers_versionar
  after insert or update on public.offers
  deferrable initially deferred
  for each row execute function private.versionar_pelo_registro();
create constraint trigger vehicles_versionar
  after update on public.vehicles
  deferrable initially deferred
  for each row execute function private.versionar_pelo_registro();
create constraint trigger supplier_declarations_versionar
  after insert on public.supplier_declarations
  deferrable initially deferred
  for each row execute function private.versionar_pelo_registro();

-- Sem exclusão
create trigger vehicles_sem_exclusao before delete on public.vehicles
  for each row execute function private.impedir_exclusao();
create trigger offers_sem_exclusao before delete on public.offers
  for each row execute function private.impedir_exclusao();
create trigger offer_media_sem_exclusao before delete on public.offer_media
  for each row execute function private.impedir_exclusao();
create trigger vehicles_sem_truncate before truncate on public.vehicles
  for each statement execute function private.impedir_exclusao();
create trigger offers_sem_truncate before truncate on public.offers
  for each statement execute function private.impedir_exclusao();
create trigger offer_media_sem_truncate before truncate on public.offer_media
  for each statement execute function private.impedir_exclusao();

-- Só de inclusão (teste 11)
create trigger offer_versions_so_inclusao before update or delete on public.offer_versions
  for each row execute function public.impedir_alteracao_de_registro();
create trigger offer_versions_sem_truncate before truncate on public.offer_versions
  for each statement execute function public.impedir_alteracao_de_registro();
create trigger supplier_declarations_so_inclusao before update or delete on public.supplier_declarations
  for each row execute function public.impedir_alteracao_de_registro();
create trigger supplier_declarations_sem_truncate before truncate on public.supplier_declarations
  for each statement execute function public.impedir_alteracao_de_registro();
create trigger offer_documents_so_inclusao before update or delete on public.offer_documents
  for each row execute function public.impedir_alteracao_de_registro();
create trigger offer_documents_sem_truncate before truncate on public.offer_documents
  for each statement execute function public.impedir_alteracao_de_registro();
create trigger offer_reviews_so_inclusao before update or delete on public.offer_reviews
  for each row execute function public.impedir_alteracao_de_registro();
create trigger offer_reviews_sem_truncate before truncate on public.offer_reviews
  for each statement execute function public.impedir_alteracao_de_registro();

-- RLS (ADR-0003 §2.14) ---------------------------------------------------------------------

alter table public.vehicles enable row level security;
alter table public.offers enable row level security;
alter table public.offer_versions enable row level security;
alter table public.supplier_declarations enable row level security;
alter table public.offer_media enable row level security;
alter table public.offer_documents enable row level security;
alter table public.offer_reviews enable row level security;

create policy vehicles_leitura on public.vehicles
  for select to authenticated
  using (
    organization_id in (select private.empresas_do_usuario())
    or (select private.tem_papel_na_plataforma(array['admin', 'operator'])));
create policy vehicles_cadastro on public.vehicles
  for insert to authenticated
  with check (organization_id in (select private.empresas_do_usuario()));
create policy vehicles_alteracao on public.vehicles
  for update to authenticated
  using (organization_id in (select private.empresas_do_usuario()))
  with check (organization_id in (select private.empresas_do_usuario()));

create policy offers_leitura on public.offers
  for select to authenticated
  using (
    supplier_organization_id in (select private.empresas_do_usuario())
    or (select private.tem_papel_na_plataforma(array['admin', 'operator'])));
create policy offers_cadastro on public.offers
  for insert to authenticated
  with check (supplier_organization_id in (select private.empresas_do_usuario()));
create policy offers_alteracao on public.offers
  for update to authenticated
  using (
    supplier_organization_id in (select private.empresas_do_usuario())
    or (select private.tem_papel_na_plataforma(array['admin', 'operator'])))
  with check (
    supplier_organization_id in (select private.empresas_do_usuario())
    or (select private.tem_papel_na_plataforma(array['admin', 'operator'])));

create policy offer_versions_leitura on public.offer_versions
  for select to authenticated
  using (
    offer_id in (select private.ofertas_do_usuario())
    or (select private.tem_papel_na_plataforma(array['admin', 'operator'])));

create policy supplier_declarations_leitura on public.supplier_declarations
  for select to authenticated
  using (
    offer_id in (select private.ofertas_do_usuario())
    or (select private.tem_papel_na_plataforma(array['admin', 'operator'])));
create policy supplier_declarations_inclusao on public.supplier_declarations
  for insert to authenticated
  with check (offer_id in (select private.ofertas_do_usuario()));

create policy offer_media_leitura on public.offer_media
  for select to authenticated
  using (
    offer_id in (select private.ofertas_do_usuario())
    or (select private.tem_papel_na_plataforma(array['admin', 'operator'])));
create policy offer_media_inclusao on public.offer_media
  for insert to authenticated
  with check (offer_id in (select private.ofertas_do_usuario()));
create policy offer_media_alteracao on public.offer_media
  for update to authenticated
  using (offer_id in (select private.ofertas_do_usuario()))
  with check (offer_id in (select private.ofertas_do_usuario()));

create policy offer_documents_leitura on public.offer_documents
  for select to authenticated
  using (
    offer_id in (select private.ofertas_do_usuario())
    or (select private.tem_papel_na_plataforma(array['admin', 'operator'])));
create policy offer_documents_inclusao on public.offer_documents
  for insert to authenticated
  with check (offer_id in (select private.ofertas_do_usuario()));

create policy offer_reviews_leitura on public.offer_reviews
  for select to authenticated
  using (
    offer_id in (select private.ofertas_do_usuario())
    or (select private.tem_papel_na_plataforma(array['admin', 'operator'])));

-- Histórico da oferta e do veículo para a empresa dona (ADR-0003 §2.14).
create policy field_history_ofertas on public.field_history
  for select to authenticated
  using (
    (entity_type = 'offers' and entity_id in (select private.ofertas_do_usuario()))
    or (entity_type = 'vehicles' and entity_id in (select private.veiculos_do_usuario())));

-- RPCs (ADR-0003 §2.15) -----------------------------------------------------------------
-- security invoker: passam pelas mesmas políticas, GRANTs e gatilhos de uma
-- chamada direta. Servem para caber numa transação e numa versão.

create function public.criar_oferta(p_empresa uuid, p_veiculo jsonb, p_oferta jsonb default '{}')
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  campos_do_veiculo constant text[] := array['make', 'model', 'version', 'manufacture_year', 'model_year',
    'mileage_km', 'fuel_type', 'transmission', 'color', 'body_type', 'plate', 'renavam', 'chassis'];
  campos_da_oferta constant text[] := array['asking_price', 'commercial_conditions', 'location_city',
    'location_state', 'valid_until'];
  preco numeric := (p_oferta ->> 'asking_price')::numeric;
  veiculo uuid;
  oferta uuid;
begin
  if jsonb_typeof(p_veiculo) is distinct from 'object' or jsonb_typeof(p_oferta) is distinct from 'object'
     or (p_veiculo - campos_do_veiculo) <> '{}'::jsonb or (p_oferta - campos_da_oferta) <> '{}'::jsonb then
    raise exception 'campo não permitido no cadastro da oferta' using errcode = '22023';
  end if;
  if preco is not null and preco <> round(preco, 2) then
    raise exception 'o preço tem no máximo duas casas decimais' using errcode = '22023';
  end if;
  insert into public.vehicles (organization_id, make, model, version, manufacture_year, model_year, mileage_km,
    fuel_type, transmission, color, body_type, plate, renavam, chassis)
  values (p_empresa, p_veiculo ->> 'make', p_veiculo ->> 'model', p_veiculo ->> 'version',
    (p_veiculo ->> 'manufacture_year')::smallint, (p_veiculo ->> 'model_year')::smallint,
    (p_veiculo ->> 'mileage_km')::integer, p_veiculo ->> 'fuel_type', p_veiculo ->> 'transmission',
    p_veiculo ->> 'color', p_veiculo ->> 'body_type', p_veiculo ->> 'plate', p_veiculo ->> 'renavam',
    p_veiculo ->> 'chassis')
  returning id into veiculo;
  insert into public.offers (vehicle_id, supplier_organization_id, asking_price, commercial_conditions,
    location_city, location_state, valid_until)
  values (veiculo, p_empresa, preco, p_oferta ->> 'commercial_conditions', p_oferta ->> 'location_city',
    p_oferta ->> 'location_state', (p_oferta ->> 'valid_until')::timestamptz)
  returning id into oferta;
  return oferta;
end;
$$;

create function public.atualizar_oferta(p_oferta uuid, p_veiculo jsonb default '{}', p_dados jsonb default '{}')
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  campos_do_veiculo constant text[] := array['make', 'model', 'version', 'manufacture_year', 'model_year',
    'mileage_km', 'fuel_type', 'transmission', 'color', 'body_type', 'plate', 'renavam', 'chassis'];
  campos_da_oferta constant text[] := array['asking_price', 'commercial_conditions', 'location_city',
    'location_state', 'valid_until'];
  preco numeric := (p_dados ->> 'asking_price')::numeric;
  veiculo uuid;
  n integer;
begin
  if jsonb_typeof(p_veiculo) is distinct from 'object' or jsonb_typeof(p_dados) is distinct from 'object'
     or (p_veiculo - campos_do_veiculo) <> '{}'::jsonb or (p_dados - campos_da_oferta) <> '{}'::jsonb then
    raise exception 'campo não permitido na alteração da oferta' using errcode = '22023';
  end if;
  if preco is not null and preco <> round(preco, 2) then
    raise exception 'o preço tem no máximo duas casas decimais' using errcode = '22023';
  end if;
  select o.vehicle_id into veiculo from public.offers o where o.id = p_oferta;
  if veiculo is null then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  if p_veiculo <> '{}'::jsonb then
    update public.vehicles v set
      make = case when p_veiculo ? 'make' then p_veiculo ->> 'make' else v.make end,
      model = case when p_veiculo ? 'model' then p_veiculo ->> 'model' else v.model end,
      version = case when p_veiculo ? 'version' then p_veiculo ->> 'version' else v.version end,
      manufacture_year = case when p_veiculo ? 'manufacture_year'
        then (p_veiculo ->> 'manufacture_year')::smallint else v.manufacture_year end,
      model_year = case when p_veiculo ? 'model_year' then (p_veiculo ->> 'model_year')::smallint else v.model_year end,
      mileage_km = case when p_veiculo ? 'mileage_km' then (p_veiculo ->> 'mileage_km')::integer else v.mileage_km end,
      fuel_type = case when p_veiculo ? 'fuel_type' then p_veiculo ->> 'fuel_type' else v.fuel_type end,
      transmission = case when p_veiculo ? 'transmission' then p_veiculo ->> 'transmission' else v.transmission end,
      color = case when p_veiculo ? 'color' then p_veiculo ->> 'color' else v.color end,
      body_type = case when p_veiculo ? 'body_type' then p_veiculo ->> 'body_type' else v.body_type end,
      plate = case when p_veiculo ? 'plate' then p_veiculo ->> 'plate' else v.plate end,
      renavam = case when p_veiculo ? 'renavam' then p_veiculo ->> 'renavam' else v.renavam end,
      chassis = case when p_veiculo ? 'chassis' then p_veiculo ->> 'chassis' else v.chassis end
    where v.id = veiculo;
    get diagnostics n = row_count;
    if n = 0 then
      raise exception 'sem permissão' using errcode = '42501';
    end if;
  end if;
  if p_dados <> '{}'::jsonb then
    update public.offers o set
      asking_price = case when p_dados ? 'asking_price' then preco else o.asking_price end,
      commercial_conditions = case when p_dados ? 'commercial_conditions'
        then p_dados ->> 'commercial_conditions' else o.commercial_conditions end,
      location_city = case when p_dados ? 'location_city' then p_dados ->> 'location_city' else o.location_city end,
      location_state = case when p_dados ? 'location_state' then p_dados ->> 'location_state' else o.location_state end,
      valid_until = case when p_dados ? 'valid_until' then (p_dados ->> 'valid_until')::timestamptz else o.valid_until end
    where o.id = p_oferta;
    get diagnostics n = row_count;
    if n = 0 then
      raise exception 'sem permissão' using errcode = '42501';
    end if;
  end if;
end;
$$;

-- O que falta para publicar, para quem lê a oferta (a RLS decide).
create function public.pendencias_de_publicacao(p_oferta uuid)
returns text[]
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not exists (select 1 from public.offers o where o.id = p_oferta) then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  return private.pendencias_de_publicacao(p_oferta);
end;
$$;

-- Configuração do Inc. 2 (ADR-0003 §2.16; respostas Q1, Q4 e Q5) --------------------------

insert into public.platform_settings (key, value, description, is_critical) values
  ('offer_review_required', 'true',
   'Revisão da plataforma antes de publicar (D10). Valor provisório até a decisão D10 (ADR-0003 §2.2, Q1).', false),
  ('material_fields',
   '["asking_price", "mileage_km", "documental_states", "findings", "transfer_impediments", "supplier_declarations", "commercial_conditions", "make", "model", "version", "manufacture_year", "model_year"]',
   'Campos materiais: a lista inicial da §6.7 mais a identidade do veículo (ADR-0003 §2.11, Q4). Mudanças valem para a versão seguinte.', false),
  ('document_categories',
   '["debts_ipva", "debts_licensing", "debts_fines", "administrative_restrictions", "judicial_restrictions", "lien", "theft_recovery", "casualty", "auction", "transfer_conditions"]',
   'Categorias documentais (§5.3). Mudanças valem para frente (ADR-0003 §2.6).', false),
  ('offer_default_validity_days', '15',
   'Validade sugerida no formulário da oferta, em dias (ADR-0003 §2.9, Q5).', false),
  ('offer_max_validity_days', '30',
   'Teto da validade da oferta, em dias (ADR-0003 §2.9, Q5).', false);

-- Privilégios ----------------------------------------------------------------------------------
-- authenticated escreve só as colunas que algum papel pode mudar; o gatilho
-- decide quem muda o quê. service_role só lê.

revoke all on public.vehicles, public.offers, public.offer_versions, public.supplier_declarations,
  public.offer_media, public.offer_documents, public.offer_reviews
  from anon, authenticated, service_role;

grant select on public.vehicles, public.offers, public.offer_versions, public.supplier_declarations,
  public.offer_media, public.offer_documents, public.offer_reviews
  to authenticated, service_role;

grant insert (organization_id, make, model, version, manufacture_year, model_year, mileage_km, fuel_type,
  transmission, color, body_type, plate, renavam, chassis) on public.vehicles to authenticated;
grant update (make, model, version, manufacture_year, model_year, mileage_km, fuel_type, transmission, color,
  body_type, plate, renavam, chassis) on public.vehicles to authenticated;
grant insert (vehicle_id, supplier_organization_id, asking_price, commercial_conditions, location_city,
  location_state, valid_until) on public.offers to authenticated;
grant update (status, asking_price, commercial_conditions, location_city, location_state, valid_until,
  availability_confirmed_at, publication_authorized_by, suspended_category) on public.offers to authenticated;
grant insert (offer_id, category, declared_value, detail) on public.supplier_declarations to authenticated;
grant insert (offer_id, storage_path, display_order) on public.offer_media to authenticated;
grant update (display_order, removed_at) on public.offer_media to authenticated;
grant insert (offer_id, kind, storage_path, sha256, description) on public.offer_documents to authenticated;

revoke all on function
  private.texto_de_linha(text, integer),
  private.texto_livre(text, integer),
  private.renavam_valido(text),
  private.configuracao(text),
  private.revisao_exigida(),
  private.problema_da_validade(timestamptz),
  private.ofertas_do_usuario(),
  private.veiculos_do_usuario(),
  private.oferta_aberta(uuid),
  private.tem_impedimento_ativo(uuid),
  private.estado_pela_declaracao(text),
  private.pendencias_de_publicacao(uuid),
  private.json_canonico(jsonb),
  private.hash_do_snapshot(jsonb),
  private.snapshot_da_oferta(uuid),
  private.resumo_da_mudanca(jsonb, jsonb),
  private.versionar_oferta(uuid),
  private.versionar_pelo_registro(),
  private.colunas_alteradas(jsonb, jsonb),
  private.motivo_obrigatorio(),
  private.conferir_edicao(uuid, text),
  private.proteger_oferta(),
  private.proteger_veiculo(),
  private.proteger_declaracao(),
  private.caminho_da_oferta(text, public.offers, text),
  private.proteger_foto(),
  private.proteger_documento(),
  private.registrar_historico()
  from public, anon, authenticated, service_role;

-- CHECKs e políticas rodam com o papel de quem escreve ou consulta.
grant execute on function
  private.texto_de_linha(text, integer),
  private.texto_livre(text, integer),
  private.renavam_valido(text),
  private.ofertas_do_usuario(),
  private.veiculos_do_usuario(),
  private.pendencias_de_publicacao(uuid)
  to authenticated;

revoke all on function
  public.criar_oferta(uuid, jsonb, jsonb),
  public.atualizar_oferta(uuid, jsonb, jsonb),
  public.pendencias_de_publicacao(uuid)
  from public, anon, authenticated, service_role;
grant execute on function
  public.criar_oferta(uuid, jsonb, jsonb),
  public.atualizar_oferta(uuid, jsonb, jsonb),
  public.pendencias_de_publicacao(uuid)
  to authenticated;

-- A sequência da ordem das declarações não precisa de privilégio: a coluna é
-- identity, e o Postgres a avança sem conferir USAGE.
revoke all on sequence public.supplier_declarations_seq_seq from anon, authenticated, service_role;
