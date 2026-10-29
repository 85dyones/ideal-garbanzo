-- I2.5: estado documental a partir das declarações (especificação v1.1, §6.4
-- e §6.5; ADR-0003 §2.6 e §2.12).
--
-- * Uma função calcula o estado de cada categoria e a origem da informação:
--   private.estados_documentais_da_oferta. O snapshot da versão e a tela do
--   fornecedor (RPC public.estados_documentais) usam a mesma função, então a
--   versão registra o que a tela mostra.
-- * No Inc. 2, só as declarações contam:
--   - "desconhece" e categoria sem declaração → not_checked;
--   - "sem ocorrência conhecida" → declared_unverified;
--   - "há ocorrência" → with_findings.
--   O Inc. 3 acrescenta consultas, revisões e impedimentos como candidatos, e
--   a precedência da §6.4 escolhe o estado.
-- * Ninguém digita o estado: ele é calculado a cada leitura (§6.4).
-- * Os códigos das ressalvas (private.aviso_do_estado) têm o texto no
--   catálogo src/modules/documental/rules/avisos.ts.

-- Precedência da §6.4: o maior número vence.
create function private.precedencia_documental(estado text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case estado
    when 'under_review' then 6
    when 'with_findings' then 5
    when 'pending' then 4
    when 'no_findings_in_sources' then 3
    when 'declared_unverified' then 2
    when 'not_checked' then 1
  end;
$$;

-- Estado de uma categoria: entre os candidatos, o de maior precedência. Sem
-- candidato, not_checked. No Inc. 2, o único candidato vem da declaração
-- vigente (a de maior seq).
create function private.estado_documental(p_oferta uuid, p_categoria text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  candidatos text[] := '{}';
  declarado text;
begin
  select sd.declared_value into declarado
  from public.supplier_declarations sd
  where sd.offer_id = p_oferta and sd.category = p_categoria
  order by sd.seq desc
  limit 1;
  if declarado is not null then
    candidatos := array_append(candidatos, private.estado_pela_declaracao(declarado));
  end if;
  return coalesce(
    (select c.estado from unnest(candidatos) as c(estado)
     order by private.precedencia_documental(c.estado) desc
     limit 1),
    'not_checked');
end;
$$;

-- Ressalva exibida para o estado (§5.2): código com a versão do texto.
create function private.aviso_do_estado(estado text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case estado
    when 'not_checked' then 'categoria_nao_consultada.v1'
    when 'declared_unverified' then 'declaracao_sem_comprovacao.v1'
    when 'with_findings' then 'categoria_com_apontamentos.v1'
  end;
$$;

-- Estado e origem de cada categoria da oferta: as da configuração e as que já
-- têm declaração, para que remover uma categoria da configuração nunca
-- esconda o que foi declarado (ADR-0003 §2.6). A origem segue a §6.5; no
-- Inc. 2, "declarada pelo fornecedor" ou "não confirmada".
create function private.estados_documentais_da_oferta(p_oferta uuid)
returns table (
  category text,
  state text,
  origin text,
  declared_value text,
  detail text,
  declared_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.categoria,
         private.estado_documental(p_oferta, c.categoria),
         case when d.declared_value is null then 'unconfirmed' else 'supplier_declaration' end,
         d.declared_value,
         d.detail,
         d.declared_at
  from (
    select jsonb_array_elements_text(coalesce(private.configuracao('document_categories'), '[]')) as categoria
    union
    select sd.category from public.supplier_declarations sd where sd.offer_id = p_oferta
  ) c
  left join lateral (
    select sd.declared_value, sd.detail, sd.declared_at
    from public.supplier_declarations sd
    where sd.offer_id = p_oferta and sd.category = c.categoria
    order by sd.seq desc
    limit 1
  ) d on true
  order by c.categoria collate "C";
$$;

-- O snapshot passa a ler os estados da mesma função da tela. A saída não muda:
-- os hashes das versões já gravadas continuam válidos.
create or replace function private.snapshot_da_oferta(p_oferta uuid)
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
  avisos jsonb;
  com_declaracao boolean;
  com_estado boolean;
  item text;
  linha record;
  objeto jsonb;
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

  for linha in select * from private.estados_documentais_da_oferta(p_oferta) loop
    objeto := '{}';
    if com_declaracao then
      objeto := objeto || jsonb_build_object('declaration',
        case when linha.declared_value is null then 'null'::jsonb
             else jsonb_build_object('value', linha.declared_value, 'detail', linha.detail) end);
    end if;
    if com_estado then
      objeto := objeto || jsonb_build_object('state', linha.state);
    end if;
    categorias := categorias || jsonb_build_object(linha.category, objeto);
  end loop;

  -- Ressalvas exibidas (§5.2): códigos com a versão do texto do catálogo.
  select coalesce(jsonb_agg(a.codigo order by a.codigo collate "C"), '[]')
  into avisos
  from (
    select distinct private.aviso_do_estado(e.state) as codigo
    from private.estados_documentais_da_oferta(p_oferta) e
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

-- Estados para quem lê a oferta (a RLS decide); oferta alheia e inexistente
-- dão a mesma resposta.
create function public.estados_documentais(p_oferta uuid)
returns table (
  category text,
  state text,
  origin text,
  declared_value text,
  detail text,
  declared_at timestamptz)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not exists (select 1 from public.offers o where o.id = p_oferta) then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  return query select * from private.estados_documentais_da_oferta(p_oferta);
end;
$$;

revoke all on function
  private.precedencia_documental(text),
  private.estado_documental(uuid, text),
  private.aviso_do_estado(text),
  private.estados_documentais_da_oferta(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.estados_documentais_da_oferta(uuid) to authenticated;

revoke all on function public.estados_documentais(uuid) from public, anon, authenticated, service_role;
grant execute on function public.estados_documentais(uuid) to authenticated;
