-- I3.3: domínio documental (especificação v1.1, §5.3, §6.3 a §6.5 e §6.11;
-- ADR-0004 §2).
--
-- * Tabelas novas: vehicle_checks (consultas), documental_reviews (revisões),
--   transfer_impediments (impedimentos) e check_evidence_files (evidências da
--   consulta, no bucket privado check-evidence). As três primeiras alimentam o
--   snapshot e geram versão (ADR-0003 §2.6).
-- * Teste 7: a consulta copia is_test da oferta, e chaves estrangeiras
--   compostas prendem consulta, substituição e evidência à mesma oferta e ao
--   mesmo lado da marca de teste.
-- * Teste 10: no_findings_in_sources só sai de consulta vigente
--   no_occurrence_in_source, sem revisão aberta (ADR-0004 §2.1).
-- * Dado pessoal: CHECK de chaves em details, em qualquer nível, sem
--   maiúsculas nem acentos, inclusive placa, RENAVAM e chassi (§2.10).
-- * Impedimento: nasce sozinho de ocorrência em transfer_conditions (P3); só o
--   administrador resolve, com evidência; com impedimento ativo a oferta não é
--   enviada nem publicada, sai do catálogo e não é reservada (P4; D9).
-- * O impedimento não é candidato ao estado documental (E24), ao contrário do
--   que previa o comentário da migração 20261029160000.
-- * A lista de linguagem proibida no texto livre (E28) e as operações de
--   servidor ficam para a I3.5.

-- Auxiliares ---------------------------------------------------------------------------

-- Operador ou administrador sem vínculo não removido com a empresa (B25 do
-- ADR-0003): só assim age como plataforma nas ofertas dela.
create function private.equipe_sem_vinculo(empresa uuid, papeis text[] default array['admin', 'operator'])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.tem_papel_na_plataforma(papeis)
    and not exists (
      select 1 from public.organization_members m
      where m.organization_id = empresa and m.profile_id = (select auth.uid()) and m.status <> 'removed');
$$;

-- Chave de dado pessoal (ADR-0004 §2.10; anexo A.6). A chave é quebrada em
-- palavras (camelCase, sublinhado, hífen), sem maiúsculas nem acentos. Recusa
-- quando uma palavra é identificador do proprietário, de contato ou do
-- veículo (placa, RENAVAM, chassi), ou quando a chave inteira, sem
-- separadores, é uma das compostas conhecidas.
create function private.chave_de_dado_pessoal(chave text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  with normalizada as (
    select translate(
             lower(regexp_replace(coalesce(chave, ''), '([a-z0-9])([A-Z])', '\1_\2', 'g')),
             'áàâãäéèêëíìîïóòôõöúùûüçñ',
             'aaaaaeeeeiiiiooooouuuucn') as texto
  )
  select exists (
      select 1
      from normalizada n, regexp_split_to_table(n.texto, '[^a-z0-9]+') as p(palavra)
      where p.palavra in (
        'proprietario', 'proprietaria', 'proprietarios', 'dono', 'dona', 'pronome',
        'cpf', 'cnpj', 'rg', 'cnh', 'documento', 'doc', 'nome', 'razao', 'financiado', 'financiada',
        'arrendatario', 'arrendataria', 'faturado', 'faturada', 'email', 'celular', 'cellphone',
        'telefone', 'fone', 'phone', 'endereco', 'logradouro', 'cep', 'nascimento',
        'placa', 'renavam', 'chassi', 'chassis'))
    or exists (
      select 1 from normalizada n
      where regexp_replace(n.texto, '[^a-z0-9]+', '', 'g') in (
        'cpfcnpj', 'pronomeanterior', 'documentofinanciado', 'nomerazao',
        'codigosegurancacrv', 'restricaodocarrendatario', 'numeroidentificacaodofaturado'));
$$;

-- Algum objeto do jsonb, em qualquer nível, tem chave de dado pessoal.
create function private.tem_dado_pessoal(valor jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select exists (
    select 1
    from jsonb_path_query(coalesce(valor, '{}'::jsonb), 'strict $.** ? (@.type() == "object").keyvalue()') as kv(par)
    where private.chave_de_dado_pessoal(kv.par ->> 'key'));
$$;

-- Chaves para as referências compostas (teste 7) ------------------------------------------

alter table public.offers add constraint offers_id_is_test_key unique (id, is_test);
alter table public.supplier_declarations add constraint supplier_declarations_id_offer_key unique (id, offer_id);

-- Tabelas ---------------------------------------------------------------------------------

create table public.check_evidence_files (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers (id) on delete restrict,
  storage_path text not null unique check (length(storage_path) <= 300),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  content_type text not null check (content_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  uploaded_by uuid not null references public.profiles (id) on delete restrict,
  uploaded_at timestamptz not null default now(),
  constraint check_evidence_files_id_offer_key unique (id, offer_id)
);

comment on table public.check_evidence_files is
  'Evidências das consultas, só de inclusão (ADR-0004 §2.8). Bucket privado check-evidence; leitura só pelo servidor, com registro.';

create index check_evidence_files_oferta_idx on public.check_evidence_files (offer_id);

create table public.vehicle_checks (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  offer_id uuid not null,
  vehicle_id uuid not null references public.vehicles (id) on delete restrict,
  category text not null check (category ~ '^[a-z][a-z0-9_]{0,63}$'),
  source_name text not null,
  source_type text not null,
  method text not null,
  performed_at timestamptz not null,
  performed_by uuid not null references public.profiles (id) on delete restrict,
  recorded_by uuid not null references public.profiles (id) on delete restrict,
  recorded_at timestamptz not null default now(),
  recorded_as text not null check (recorded_as in ('supplier', 'platform')),
  result text not null,
  result_summary text not null,
  details jsonb not null default '{}'::jsonb,
  evidence_document_id uuid,
  protocol text,
  known_limitations text not null,
  is_test boolean not null,
  supersedes_check_id uuid unique,
  constraint vehicle_checks_oferta_e_teste_fkey foreign key (offer_id, is_test)
    references public.offers (id, is_test) on delete restrict,
  constraint vehicle_checks_evidencia_da_oferta_fkey foreign key (evidence_document_id, offer_id)
    references public.check_evidence_files (id, offer_id) on delete restrict,
  constraint vehicle_checks_chave_da_substituicao unique (id, offer_id, category, is_test),
  constraint vehicle_checks_id_offer_key unique (id, offer_id),
  constraint vehicle_checks_substitui_da_mesma_oferta_fkey foreign key (supersedes_check_id, offer_id, category, is_test)
    references public.vehicle_checks (id, offer_id, category, is_test) on delete restrict,
  constraint vehicle_checks_tipo_de_fonte check (source_type in ('official', 'commercial', 'other')),
  constraint vehicle_checks_metodo check (method in ('manual', 'integration')),
  constraint vehicle_checks_resultado check (
    result in ('awaiting_result', 'no_occurrence_in_source', 'has_occurrence', 'inconclusive')),
  constraint vehicle_checks_fonte check (private.texto_de_linha(source_name, 200)),
  constraint vehicle_checks_resumo check (private.texto_livre(result_summary, 2000)),
  constraint vehicle_checks_limitacoes check (private.texto_livre(known_limitations, 2000)),
  constraint vehicle_checks_protocolo check (protocol is null or private.texto_de_linha(protocol, 200)),
  constraint vehicle_checks_details_objeto check (jsonb_typeof(details) = 'object'),
  constraint vehicle_checks_sem_dado_pessoal check (not private.tem_dado_pessoal(details)),
  constraint vehicle_checks_nao_substitui_a_si check (supersedes_check_id is distinct from id)
);

comment on table public.vehicle_checks is
  'Consultas, só de inclusão (§5.3; ADR-0004 §2.3 e §2.9). Vigente: a que nenhuma outra substituiu. Nenhuma consulta é simulada (§6.3).';
comment on column public.vehicle_checks.recorded_as is
  'Quem registrou: o fornecedor ou a equipe da plataforma sem vínculo com a empresa dona. Gravado pelo gatilho.';

create index vehicle_checks_oferta_idx on public.vehicle_checks (offer_id, category, seq desc);

create table public.documental_reviews (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  offer_id uuid not null references public.offers (id) on delete restrict,
  category text not null check (category ~ '^[a-z][a-z0-9_]{0,63}$'),
  action text not null check (action in ('open_review', 'close_review')),
  reason text not null check (private.texto_livre(reason, 1000)),
  actor uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

comment on table public.documental_reviews is
  'Revisões documentais, só de inclusão (§5.3; ADR-0004 §2.5). Aberta: a última ação da categoria é open_review.';

create index documental_reviews_oferta_idx on public.documental_reviews (offer_id, category, seq desc);

create table public.transfer_impediments (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers (id) on delete restrict,
  basis text not null check (private.texto_livre(basis, 1000)),
  source_check_id uuid unique,
  source_declaration_id uuid unique,
  status text not null check (status in ('identified', 'resolved')),
  identified_at timestamptz not null default now(),
  resolved_by uuid references public.profiles (id) on delete restrict,
  resolved_at timestamptz,
  resolution_reason text check (resolution_reason is null or private.texto_livre(resolution_reason, 1000)),
  resolution_evidence_id uuid,
  constraint transfer_impediments_uma_origem check (num_nonnulls(source_check_id, source_declaration_id) = 1),
  constraint transfer_impediments_consulta_da_oferta_fkey foreign key (source_check_id, offer_id)
    references public.vehicle_checks (id, offer_id) on delete restrict,
  constraint transfer_impediments_declaracao_da_oferta_fkey foreign key (source_declaration_id, offer_id)
    references public.supplier_declarations (id, offer_id) on delete restrict,
  constraint transfer_impediments_evidencia_da_oferta_fkey foreign key (resolution_evidence_id, offer_id)
    references public.check_evidence_files (id, offer_id) on delete restrict,
  constraint transfer_impediments_resolucao_completa check (
    (status = 'resolved') = (resolved_at is not null)
    and (status = 'resolved') = (resolved_by is not null)
    and (status = 'resolved') = (resolution_reason is not null)
    and (status = 'resolved') = (resolution_evidence_id is not null))
);

comment on table public.transfer_impediments is
  'Impedimentos de transferência (§5.3, §6.11; ADR-0004 §2.11). Nascem do banco; só mudam de identified para resolved, pelo administrador, com evidência.';

create index transfer_impediments_ativos_idx on public.transfer_impediments (offer_id) where status = 'identified';

-- Leitura dos registros vigentes ---------------------------------------------------------

-- Consultas vigentes da categoria: as que nenhuma outra substituiu (E1).
create function private.consultas_vigentes(p_oferta uuid, p_categoria text)
returns setof public.vehicle_checks
language sql
stable
security definer
set search_path = ''
as $$
  select c.* from public.vehicle_checks c
  where c.offer_id = p_oferta and c.category = p_categoria
    and not exists (select 1 from public.vehicle_checks s where s.supersedes_check_id = c.id)
  order by c.performed_at desc, c.seq desc;
$$;

-- Revisão aberta: a última ação da categoria é open_review (E8).
create function private.revisao_aberta(p_oferta uuid, p_categoria text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select r.action = 'open_review' from public.documental_reviews r
    where r.offer_id = p_oferta and r.category = p_categoria
    order by r.seq desc limit 1), false);
$$;

-- Impedimento ativo (D9): substitui a função provisória do Inc. 2.
create or replace function private.tem_impedimento_ativo(p_oferta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.transfer_impediments t
    where t.offer_id = p_oferta and t.status = 'identified');
$$;

-- Oferta aberta a interesse (Inc. 4 e 5): publicada ou reservada, dentro da
-- validade, de empresa ativa e sem impedimento ativo (P4).
create or replace function private.oferta_aberta(p_oferta uuid)
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
      and e.status = 'active')
    and not private.tem_impedimento_ativo(p_oferta);
$$;

-- Estado da categoria (ADR-0004 §2.1): entre os candidatos, o de maior
-- precedência; sem candidato, not_checked.
create or replace function private.estado_documental(p_oferta uuid, p_categoria text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  candidatos text[] := '{}';
  declarado text;
  consulta record;
  revisao boolean := private.revisao_aberta(p_oferta, p_categoria);
  confirmada boolean := false;
  ocorrencia_na_consulta boolean := false;
begin
  select sd.declared_value into declarado
  from public.supplier_declarations sd
  where sd.offer_id = p_oferta and sd.category = p_categoria
  order by sd.seq desc
  limit 1;

  for consulta in select c.result from private.consultas_vigentes(p_oferta, p_categoria) c loop
    if consulta.result in ('awaiting_result', 'inconclusive') then
      candidatos := array_append(candidatos, 'pending');
    elsif consulta.result = 'has_occurrence' then
      candidatos := array_append(candidatos, 'with_findings');
      ocorrencia_na_consulta := true;
    elsif consulta.result = 'no_occurrence_in_source' then
      confirmada := true;
      if not revisao then
        candidatos := array_append(candidatos, 'no_findings_in_sources');
      end if;
    end if;
  end loop;

  -- Declaração: "desconhece" não é candidata (B29); "sem ocorrência conhecida"
  -- deixa de ser quando uma consulta vigente a confirma (R2).
  if declarado = 'no_known_occurrence' and not confirmada then
    candidatos := array_append(candidatos, 'declared_unverified');
  elsif declarado = 'has_occurrence' then
    candidatos := array_append(candidatos, 'with_findings');
  end if;

  if revisao then
    candidatos := array_append(candidatos, 'under_review');
  end if;
  -- Divergência só pelo valor (E6; P1): sem ocorrência conhecida × consulta com ocorrência.
  if declarado = 'no_known_occurrence' and ocorrencia_na_consulta then
    candidatos := array_append(candidatos, 'under_review');
  end if;

  return coalesce(
    (select c.estado from unnest(candidatos) as c(estado)
     order by private.precedencia_documental(c.estado) desc
     limit 1),
    'not_checked');
end;
$$;

-- Ressalvas dos estados (E33): códigos novos para os estados do Inc. 3.
create or replace function private.aviso_do_estado(estado text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case estado
    when 'not_checked' then 'categoria_nao_consultada.v1'
    when 'declared_unverified' then 'declaracao_sem_comprovacao.v1'
    when 'with_findings' then 'categoria_com_apontamentos.v1'
    when 'pending' then 'categoria_pendente.v1'
    when 'under_review' then 'categoria_em_analise.v1'
    when 'no_findings_in_sources' then 'sem_apontamentos_nas_fontes_consultadas.v1'
  end;
$$;

-- Quem registra consulta e evidência na oferta, no estado atual (ADR-0004
-- §2.9): o fornecedor pela tabela de edição (com a vencida como expirada); a
-- equipe sem vínculo em rascunho, revisão, publicada, reservada e suspensa.
create function private.pode_registrar_consulta(p_oferta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.offers o
    where o.id = p_oferta
      and (
        (private.situacao_da_oferta(o) = 'draft' and private.membro_ativo(o.supplier_organization_id))
        or (private.situacao_da_oferta(o) in ('published', 'reserved')
            and private.membro_ativo(o.supplier_organization_id, array['org_admin']))
        or (private.situacao_da_oferta(o) in ('draft', 'under_review', 'published', 'reserved', 'suspended')
            and not private.membro_ativo(o.supplier_organization_id)
            and private.equipe_sem_vinculo(o.supplier_organization_id))));
$$;

create function private.pode_enviar_evidencia_da_consulta(caminho text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.pode_registrar_consulta(private.oferta_do_caminho(caminho, 'pdf|jpg|jpeg|png|webp'));
$$;

-- Gatilhos de proteção ---------------------------------------------------------------------

-- Quem age na oferta: 'supplier' (membro ativo da empresa dona, inclusive o
-- staff com vínculo, B25), 'platform' (equipe sem vínculo) ou nulo.
create function private.lado_na_oferta(empresa uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.membro_ativo(empresa) then 'supplier'
    when private.equipe_sem_vinculo(empresa) then 'platform'
  end;
$$;

create function private.proteger_evidencia()
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
    raise exception 'enviar evidência exige sessão de usuário' using errcode = '42501';
  end if;
  select * into oferta from public.offers o where o.id = new.offer_id;
  -- Mesma resposta para oferta inexistente e alheia.
  if not found or private.lado_na_oferta(oferta.supplier_organization_id) is null then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  if not private.pode_registrar_consulta(oferta.id) then
    raise exception 'a oferta em % não recebe consulta nem evidência', private.situacao_da_oferta(oferta)
      using errcode = 'P0001';
  end if;
  if not private.caminho_da_oferta(new.storage_path, oferta, 'pdf|jpg|jpeg|png|webp') then
    raise exception 'caminho da evidência fora do padrão da oferta' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from storage.objects s
    where s.bucket_id = 'check-evidence' and s.name = new.storage_path and s.owner_id = ator::text) then
    raise exception 'o arquivo da evidência não está no armazenamento' using errcode = 'P0001';
  end if;
  new.uploaded_by := ator;
  new.uploaded_at := now();
  return new;
end;
$$;

create function private.proteger_consulta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ator uuid := (select auth.uid());
  oferta public.offers;
  lado text;
  anterior public.vehicle_checks;
begin
  if ator is null then
    raise exception 'registrar consulta exige sessão de usuário' using errcode = '42501';
  end if;
  select * into oferta from public.offers o where o.id = new.offer_id;
  -- Mesma resposta para oferta inexistente e alheia.
  if not found then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  lado := private.lado_na_oferta(oferta.supplier_organization_id);
  if lado is null then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  if not private.pode_registrar_consulta(oferta.id) then
    raise exception 'a oferta em % não recebe consulta nem evidência', private.situacao_da_oferta(oferta)
      using errcode = 'P0001';
  end if;
  if not coalesce(private.configuracao('document_categories'), '[]') ? new.category then
    raise exception 'categoria documental fora da configuração: %', new.category using errcode = 'P0001';
  end if;
  -- Integração automática só depois da C7 (§6.3; E34).
  if new.method is distinct from 'manual' then
    raise exception 'só o registro manual de consulta está disponível' using errcode = 'P0001';
  end if;
  if new.performed_at > now() then
    raise exception 'a data da consulta não pode estar no futuro' using errcode = 'P0001';
  end if;
  if new.supersedes_check_id is not null then
    select * into anterior from public.vehicle_checks c where c.id = new.supersedes_check_id;
    -- A chave composta confere oferta, categoria e marca de teste; aqui, o autor (E3).
    if found and lado = 'supplier' and anterior.recorded_as = 'platform' then
      raise exception 'o fornecedor não substitui consulta registrada pela plataforma' using errcode = '42501';
    end if;
  end if;
  if new.evidence_document_id is not null and not exists (
    select 1 from public.check_evidence_files e
    where e.id = new.evidence_document_id and e.uploaded_by = ator) then
    raise exception 'a evidência precisa ter sido enviada por quem registra a consulta' using errcode = 'P0001';
  end if;
  -- Gravados pelo banco, qualquer que seja o valor enviado (E15, E16, E34).
  new.vehicle_id := oferta.vehicle_id;
  new.is_test := oferta.is_test;
  new.recorded_by := ator;
  new.performed_by := ator;
  new.recorded_at := now();
  new.recorded_as := lado;
  return new;
end;
$$;

create function private.proteger_revisao_documental()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ator uuid := (select auth.uid());
  oferta public.offers;
  aberta boolean;
begin
  if ator is null then
    raise exception 'revisão documental exige sessão de usuário' using errcode = '42501';
  end if;
  select * into oferta from public.offers o where o.id = new.offer_id;
  if not found or not private.equipe_sem_vinculo(oferta.supplier_organization_id) then
    raise exception 'só o operador ou o administrador sem vínculo com a empresa dona revisa' using errcode = '42501';
  end if;
  if private.situacao_da_oferta(oferta) not in ('draft', 'under_review', 'published', 'reserved', 'suspended') then
    raise exception 'a oferta em % não recebe revisão documental', private.situacao_da_oferta(oferta)
      using errcode = 'P0001';
  end if;
  if not coalesce(private.configuracao('document_categories'), '[]') ? new.category
     and not exists (
       select 1 from public.supplier_declarations d where d.offer_id = new.offer_id and d.category = new.category) then
    raise exception 'categoria documental fora da configuração: %', new.category using errcode = 'P0001';
  end if;
  aberta := private.revisao_aberta(new.offer_id, new.category);
  if new.action = 'open_review' and aberta then
    raise exception 'a categoria já tem revisão aberta' using errcode = 'P0001';
  end if;
  if new.action = 'close_review' and not aberta then
    raise exception 'a categoria não tem revisão aberta' using errcode = 'P0001';
  end if;
  new.reason := private.motivo_obrigatorio();
  new.actor := ator;
  new.created_at := now();
  return new;
end;
$$;

-- Impedimento: só o banco cria; só o administrador sem vínculo resolve, uma
-- vez, com motivo e evidência da mesma oferta (E21, E22).
create function private.proteger_impedimento()
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
  if tg_op = 'INSERT' then
    if pg_trigger_depth() < 2 then
      raise exception 'o impedimento nasce do registro de origem, não por inclusão direta' using errcode = '42501';
    end if;
    new.status := 'identified';
    new.identified_at := now();
    new.resolved_by := null;
    new.resolved_at := null;
    new.resolution_reason := null;
    new.resolution_evidence_id := null;
    return new;
  end if;

  alterados := private.colunas_alteradas(to_jsonb(old), to_jsonb(new));
  if cardinality(alterados) = 0 then
    return new;
  end if;
  if ator is null then
    raise exception 'resolver impedimento exige sessão de usuário' using errcode = '42501';
  end if;
  select * into oferta from public.offers o where o.id = old.offer_id;
  if not private.equipe_sem_vinculo(oferta.supplier_organization_id, array['admin']) then
    raise exception 'só o administrador da plataforma resolve impedimento' using errcode = '42501';
  end if;
  if old.status <> 'identified' or new.status <> 'resolved' then
    raise exception 'o impedimento só passa de identificado a resolvido, uma vez' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(alterados) as a(c) where a.c not in ('status', 'resolution_evidence_id')) then
    raise exception 'do impedimento, só mudam a situação e a evidência da resolução' using errcode = '42501';
  end if;
  if new.resolution_evidence_id is null then
    raise exception 'anexe a evidência da regularização' using errcode = 'P0001';
  end if;
  new.resolution_reason := private.motivo_obrigatorio();
  new.resolved_by := ator;
  new.resolved_at := now();
  return new;
end;
$$;

-- Impedimento automático (P3): ocorrência em transfer_conditions, por
-- declaração ou por consulta. Um por registro de origem.
create function private.registrar_impedimento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- As duas tabelas têm colunas diferentes: a leitura passa pelo jsonb.
  registro jsonb := to_jsonb(new);
begin
  if registro ->> 'category' <> 'transfer_conditions' then
    return null;
  end if;
  if tg_table_name = 'supplier_declarations' and registro ->> 'declared_value' = 'has_occurrence' then
    insert into public.transfer_impediments (offer_id, basis, source_declaration_id)
    values ((registro ->> 'offer_id')::uuid,
            'Declaração do fornecedor em transfer_conditions: ' || left(registro ->> 'detail', 900),
            (registro ->> 'id')::uuid)
    on conflict do nothing;
  elsif tg_table_name = 'vehicle_checks' and registro ->> 'result' = 'has_occurrence' then
    insert into public.transfer_impediments (offer_id, basis, source_check_id)
    values ((registro ->> 'offer_id')::uuid,
            'Consulta em transfer_conditions (' || (registro ->> 'source_name') || '): '
              || left(registro ->> 'result_summary', 700),
            (registro ->> 'id')::uuid)
    on conflict do nothing;
  end if;
  return null;
end;
$$;

-- Snapshot (ADR-0004 §2.13) e reserva com impedimento (§2.11) ------------------------------

-- As funções abaixo repetem a definição vigente, com só as mudanças comentadas.

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
  com_consultas boolean;
  consultas jsonb;
  impedimentos jsonb;
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
  com_consultas := materiais ? 'findings';

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
      -- Inc. 3: revisão aberta e consultas vigentes entram só quando existem,
      -- e a oferta sem elas mantém o snapshot do Inc. 2 (ADR-0004 §2.13).
      if private.revisao_aberta(p_oferta, linha.category) then
        objeto := objeto || jsonb_build_object('review', 'open');
      end if;
    end if;
    if com_consultas then
      select coalesce(jsonb_agg(jsonb_build_object(
               'source_name', c.source_name,
               'source_type', c.source_type,
               'performed_at', to_char(c.performed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
               'result', c.result,
               'result_summary', c.result_summary,
               'known_limitations', c.known_limitations,
               'has_evidence', c.evidence_document_id is not null)
             order by c.performed_at desc, c.seq desc), '[]'::jsonb)
      into consultas
      from private.consultas_vigentes(p_oferta, linha.category) c;
      if consultas <> '[]'::jsonb then
        objeto := objeto || jsonb_build_object('checks', consultas);
      end if;
    end if;
    categorias := categorias || jsonb_build_object(linha.category, objeto);
  end loop;

  -- Ressalvas exibidas (§5.2): códigos com a versão do texto do catálogo.
  select coalesce(jsonb_agg(a.codigo order by a.codigo collate "C"), '[]')
  into avisos
  from (
    select distinct private.aviso_do_estado(e.state) as codigo
    from private.estados_documentais_da_oferta(p_oferta) e
    union
    select 'impedimento_de_transferencia.v1' where private.tem_impedimento_ativo(p_oferta)
  ) a
  where a.codigo is not null;

  resultado := jsonb_build_object(
    'schema_version', '1',
    'offer_id', p_oferta::text,
    'fields', campos,
    'categories', categorias,
    'notices', avisos);
  if materiais ? 'transfer_impediments' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'basis', t.basis,
             'status', t.status,
             'identified_at', to_char(t.identified_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
             'resolved_at', case when t.resolved_at is null then null else to_char(t.resolved_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') end)
           order by t.identified_at, t.id), '[]'::jsonb)
    into impedimentos
    from public.transfer_impediments t
    where t.offer_id = p_oferta;
    resultado := resultado || jsonb_build_object('transfer_impediments', impedimentos);
  end if;
  return resultado;
end;
$$;

create or replace function private.proteger_oferta()
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
      -- T08 e T09, só dentro da validade (§2.9)
      if not (eh_adm_empresa or eh_staff) then
        raise exception 'só o administrador da empresa ou a plataforma reserva a oferta' using errcode = '42501';
      end if;
      if private.situacao_da_oferta(old) = 'expired' then
        raise exception 'a validade da oferta venceu: ela não pode ser reservada nem liberada' using errcode = 'P0001';
      end if;
      -- Impedimento ativo: a oferta não é reservada; a liberação segue (P4).
      if new.status = 'reserved' and private.tem_impedimento_ativo(old.id) then
        raise exception 'a oferta tem impedimento de transferência ativo e não pode ser reservada' using errcode = 'P0001';
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
      -- A categoria da suspensão anterior fica na linha (§2.10). Numa nova
      -- suspensão com a mesma categoria, a coluna não aparece como alterada;
      -- o servidor sempre manda a categoria escolhida.
      if new.suspended_category is null then
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
    if private.situacao_da_oferta(old) = 'expired' then
      raise exception 'a validade da oferta venceu: a disponibilidade não se confirma' using errcode = 'P0001';
    end if;
    new.availability_confirmed_at := now();
    return new;
  end if;

  perform private.conferir_edicao(old.supplier_organization_id, private.situacao_da_oferta(old));
  if 'valid_until' = any (alterados) and new.valid_until is not null then
    problema := private.problema_da_validade(new.valid_until);
    if problema is not null then
      raise exception '%', problema using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

-- Gatilhos -----------------------------------------------------------------------------------

create trigger check_evidence_files_proteger
  before insert on public.check_evidence_files
  for each row execute function private.proteger_evidencia();
create trigger vehicle_checks_proteger
  before insert on public.vehicle_checks
  for each row execute function private.proteger_consulta();
create trigger documental_reviews_proteger
  before insert on public.documental_reviews
  for each row execute function private.proteger_revisao_documental();
create trigger transfer_impediments_proteger
  before insert or update on public.transfer_impediments
  for each row execute function private.proteger_impedimento();

create trigger supplier_declarations_impedimento
  after insert on public.supplier_declarations
  for each row execute function private.registrar_impedimento();
create trigger vehicle_checks_impedimento
  after insert on public.vehicle_checks
  for each row execute function private.registrar_impedimento();

create trigger check_evidence_files_auditoria after insert on public.check_evidence_files
  for each row execute function private.registrar_auditoria();
create trigger vehicle_checks_auditoria after insert on public.vehicle_checks
  for each row execute function private.registrar_auditoria();
create trigger documental_reviews_auditoria after insert on public.documental_reviews
  for each row execute function private.registrar_auditoria();
create trigger transfer_impediments_auditoria after insert or update on public.transfer_impediments
  for each row execute function private.registrar_auditoria();

create constraint trigger vehicle_checks_versionar
  after insert on public.vehicle_checks
  deferrable initially deferred
  for each row execute function private.versionar_pelo_registro();
create constraint trigger documental_reviews_versionar
  after insert on public.documental_reviews
  deferrable initially deferred
  for each row execute function private.versionar_pelo_registro();
create constraint trigger transfer_impediments_versionar
  after insert or update on public.transfer_impediments
  deferrable initially deferred
  for each row execute function private.versionar_pelo_registro();

-- Só de inclusão (teste 11); o impedimento não se apaga
create trigger check_evidence_files_so_inclusao before update or delete on public.check_evidence_files
  for each row execute function public.impedir_alteracao_de_registro();
create trigger check_evidence_files_sem_truncate before truncate on public.check_evidence_files
  for each statement execute function public.impedir_alteracao_de_registro();
create trigger vehicle_checks_so_inclusao before update or delete on public.vehicle_checks
  for each row execute function public.impedir_alteracao_de_registro();
create trigger vehicle_checks_sem_truncate before truncate on public.vehicle_checks
  for each statement execute function public.impedir_alteracao_de_registro();
create trigger documental_reviews_so_inclusao before update or delete on public.documental_reviews
  for each row execute function public.impedir_alteracao_de_registro();
create trigger documental_reviews_sem_truncate before truncate on public.documental_reviews
  for each statement execute function public.impedir_alteracao_de_registro();
create trigger transfer_impediments_sem_exclusao before delete on public.transfer_impediments
  for each row execute function private.impedir_exclusao();
create trigger transfer_impediments_sem_truncate before truncate on public.transfer_impediments
  for each statement execute function private.impedir_exclusao();

-- RLS (ADR-0004 §2.16): a empresa dona e a equipe da plataforma -------------------------------

alter table public.check_evidence_files enable row level security;
alter table public.vehicle_checks enable row level security;
alter table public.documental_reviews enable row level security;
alter table public.transfer_impediments enable row level security;

create policy check_evidence_files_leitura on public.check_evidence_files
  for select to authenticated
  using (
    offer_id in (select private.ofertas_do_usuario())
    or (select private.tem_papel_na_plataforma(array['admin', 'operator'])));
create policy check_evidence_files_inclusao on public.check_evidence_files
  for insert to authenticated
  with check (
    offer_id in (select private.ofertas_do_usuario())
    or (select private.tem_papel_na_plataforma(array['admin', 'operator'])));

create policy vehicle_checks_leitura on public.vehicle_checks
  for select to authenticated
  using (
    offer_id in (select private.ofertas_do_usuario())
    or (select private.tem_papel_na_plataforma(array['admin', 'operator'])));
create policy vehicle_checks_inclusao on public.vehicle_checks
  for insert to authenticated
  with check (
    offer_id in (select private.ofertas_do_usuario())
    or (select private.tem_papel_na_plataforma(array['admin', 'operator'])));

create policy documental_reviews_leitura on public.documental_reviews
  for select to authenticated
  using (
    offer_id in (select private.ofertas_do_usuario())
    or (select private.tem_papel_na_plataforma(array['admin', 'operator'])));
create policy documental_reviews_inclusao on public.documental_reviews
  for insert to authenticated
  with check ((select private.tem_papel_na_plataforma(array['admin', 'operator'])));

create policy transfer_impediments_leitura on public.transfer_impediments
  for select to authenticated
  using (
    offer_id in (select private.ofertas_do_usuario())
    or (select private.tem_papel_na_plataforma(array['admin', 'operator'])));
create policy transfer_impediments_resolucao on public.transfer_impediments
  for update to authenticated
  using ((select private.tem_papel_na_plataforma(array['admin'])))
  with check ((select private.tem_papel_na_plataforma(array['admin'])));

revoke all on public.check_evidence_files, public.vehicle_checks, public.documental_reviews,
  public.transfer_impediments
  from anon, authenticated, service_role;
grant select on public.check_evidence_files, public.vehicle_checks, public.documental_reviews,
  public.transfer_impediments
  to authenticated, service_role;
grant insert (offer_id, storage_path, sha256, content_type, size_bytes) on public.check_evidence_files to authenticated;
grant insert (offer_id, category, source_name, source_type, method, performed_at, result, result_summary,
  details, evidence_document_id, protocol, known_limitations, supersedes_check_id)
  on public.vehicle_checks to authenticated;
grant insert (offer_id, category, action) on public.documental_reviews to authenticated;
grant update (status, resolution_evidence_id) on public.transfer_impediments to authenticated;

-- Storage: evidências das consultas (reaplicável; ADR-0002 §2.14) ----------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('check-evidence', 'check-evidence', false, 10485760,
   array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists check_evidence_envio on storage.objects;
create policy check_evidence_envio on storage.objects
  for insert to authenticated
  with check (bucket_id = 'check-evidence' and private.pode_enviar_evidencia_da_consulta(name));
-- Sem SELECT, UPDATE nem DELETE: a evidência sai só pelo servidor, com registro
-- em restricted_access_logs (ADR-0004 §2.8), como o documento da oferta.

-- Privilégios das funções -----------------------------------------------------------------

revoke all on function
  private.equipe_sem_vinculo(uuid, text[]),
  private.chave_de_dado_pessoal(text),
  private.tem_dado_pessoal(jsonb),
  private.consultas_vigentes(uuid, text),
  private.revisao_aberta(uuid, text),
  private.pode_registrar_consulta(uuid),
  private.pode_enviar_evidencia_da_consulta(text),
  private.lado_na_oferta(uuid),
  private.proteger_evidencia(),
  private.proteger_consulta(),
  private.proteger_revisao_documental(),
  private.proteger_impedimento(),
  private.registrar_impedimento()
  from public, anon, authenticated, service_role;
-- CHECKs e políticas rodam com o papel de quem escreve ou envia.
grant execute on function
  private.chave_de_dado_pessoal(text),
  private.tem_dado_pessoal(jsonb),
  private.pode_enviar_evidencia_da_consulta(text)
  to authenticated;
