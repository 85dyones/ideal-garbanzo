-- I2.11: ressalvas da revisão independente do Inc. 2 (ADR-0003 §8).
--
-- ACH-I2.10-01. Oferta vencida antes da rodada da expiração. A publicada ou
-- reservada com valid_until no passado já se comporta como expirada (§2.9):
-- ninguém altera o conteúdo, estende a validade, confirma a disponibilidade,
-- reserva nem libera. Ficam a retirada (T11), a suspensão (T14) e a expiração
-- pelo job (T12); depois dela, a reabertura (T13). Vale no gatilho da oferta,
-- nos gatilhos do veículo, da declaração, da foto e do documento e na política
-- de envio do Storage. rules/edicao.ts e rules/transicoes.ts repetem a regra, e
-- o teste de integração ofertas-transicoes confere os dois lados.
--
-- ACH-I2.10-02. As funções do private com id de oferta e EXECUTE para
-- authenticated passam a conferir quem chama, com a regra da política
-- offers_leitura. Hoje só os invólucros públicos, que já passam pela RLS, as
-- alcançam; a conferência vale para uma exposição futura do private ou para
-- uma função nova que as chame com id do usuário.
--
-- As funções trocadas repetem a definição vigente, com só as mudanças acima.

-- Situação para edição, disponibilidade e reserva: a publicada ou reservada
-- vencida conta como expirada.
create function private.situacao_da_oferta(o public.offers)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when o.status in ('published', 'reserved') and o.valid_until <= now() then 'expired'
    else o.status
  end;
$$;

-- Quem chama lê a oferta pela regra da política offers_leitura. Sem usuário,
-- só a sessão de manutenção (pg_cron, migração e scripts do T2). Oferta
-- alheia e inexistente dão a mesma resposta. Quando a leitura da oferta mudar
-- (catálogo do Inc. 4), esta função muda junto com a política.
create function private.conferir_leitura_da_oferta(p_oferta uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    if private.sessao_de_manutencao(session_user) then
      return;
    end if;
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.offers o
    where o.id = p_oferta
      and (o.supplier_organization_id in (select private.empresas_do_usuario())
           or private.tem_papel_na_plataforma(array['admin', 'operator']))) then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
end;
$$;

revoke all on function
  private.situacao_da_oferta(public.offers),
  private.conferir_leitura_da_oferta(uuid)
  from public, anon, authenticated, service_role;

-- ACH-I2.10-01 -------------------------------------------------------------------------

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

create or replace function private.proteger_veiculo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ator uuid := (select auth.uid());
  alterados text[];
  faltando text[];
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
  perform private.conferir_edicao(old.organization_id, private.situacao_da_oferta(oferta));
  if oferta.published_at is not null and alterados && array['plate', 'renavam', 'chassis'] then
    raise exception 'placa, RENAVAM e chassi não mudam depois da primeira publicação' using errcode = 'P0001';
  end if;
  -- A publicada ou reservada continua completa (ADR-0003 §2.4): nenhum dado
  -- exigido para publicar volta a vazio, nem por chamada direta à API.
  faltando := private.dados_do_veiculo_faltando(new);
  if oferta.status in ('published', 'reserved') and cardinality(faltando) > 0 then
    raise exception 'a oferta publicada ou reservada precisa dos dados do veículo: %',
      array_to_string(faltando, ', ') using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function private.proteger_declaracao()
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
  perform private.conferir_edicao(oferta.supplier_organization_id, private.situacao_da_oferta(oferta));
  if not coalesce(private.configuracao('document_categories'), '[]') ? new.category then
    raise exception 'categoria documental fora da configuração: %', new.category using errcode = 'P0001';
  end if;
  new.declared_by := ator;
  new.declared_at := now();
  return new;
end;
$$;

create or replace function private.proteger_foto()
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
    perform private.conferir_edicao(oferta.supplier_organization_id, private.situacao_da_oferta(oferta));
    if not private.caminho_da_oferta(new.storage_path, oferta, 'jpg|jpeg|png|webp') then
      raise exception 'caminho da foto fora do padrão da oferta' using errcode = 'P0001';
    end if;
    if not exists (
      select 1 from storage.objects s
      where s.bucket_id = 'offer-photos' and s.name = new.storage_path and s.owner_id = ator::text) then
      raise exception 'o arquivo da foto não está no armazenamento' using errcode = 'P0001';
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
  perform private.conferir_edicao(oferta.supplier_organization_id, private.situacao_da_oferta(oferta));
  if 'removed_at' = any (alterados) then
    new.removed_at := now();
    new.removed_by := ator;
  end if;
  return new;
end;
$$;

create or replace function private.proteger_documento()
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
  perform private.conferir_edicao(oferta.supplier_organization_id, private.situacao_da_oferta(oferta));
  if not private.caminho_da_oferta(new.storage_path, oferta, 'pdf|jpg|jpeg|png|webp') then
    raise exception 'caminho do documento fora do padrão da oferta' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from storage.objects s
    where s.bucket_id = 'offer-documents' and s.name = new.storage_path and s.owner_id = ator::text) then
    raise exception 'o arquivo do documento não está no armazenamento' using errcode = 'P0001';
  end if;
  new.uploaded_by := ator;
  new.uploaded_at := now();
  return new;
end;
$$;

create or replace function private.pode_editar_oferta(p_oferta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.offers o
    where o.id = p_oferta
      and ((o.status = 'draft' and private.membro_ativo(o.supplier_organization_id))
        or (o.status in ('published', 'reserved') and o.valid_until > now()
            and private.membro_ativo(o.supplier_organization_id, array['org_admin']))));
$$;

-- ACH-I2.10-02 -------------------------------------------------------------------------

create or replace function private.pendencias_de_publicacao(p_oferta uuid)
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
  perform private.conferir_leitura_da_oferta(p_oferta);
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
  faltas := faltas || private.dados_do_veiculo_faltando(v) || array_remove(array[
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

create or replace function private.estados_documentais_da_oferta(p_oferta uuid)
returns table (
  category text,
  state text,
  origin text,
  declared_value text,
  detail text,
  declared_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.conferir_leitura_da_oferta(p_oferta);
  return query
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
end;
$$;
