-- I1.12: ressalvas da revisão independente da I1.11 (ADR-0002 §10).
--
-- * R-I1.11-03: ninguém convida o próprio e-mail. Sem isso, quem administra a
--   plataforma e uma compradora com o mesmo e-mail cumpria o controle sozinho.
-- * R-I1.11-11: o convidado não lê quem convidou, usou ou revogou. A leitura
--   pela API fica nas colunas que as telas usam; o service_role lê tudo.
-- * R-I1.11-12: o convite do pedido entra na lista do que não muda, como
--   defesa além do GRANT.

create or replace function private.proteger_convite_de_fornecedora()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ator uuid := (select auth.uid());
  dias integer;
begin
  if tg_op = 'INSERT' then
    if ator is null or not private.tem_papel_na_plataforma(array['admin']) then
      raise exception 'só um administrador da plataforma convida fornecedoras' using errcode = '42501';
    end if;
    new.email := lower(btrim(new.email));
    if new.email = private.email_confirmado_do_usuario() then
      raise exception 'ninguém convida o próprio e-mail para fornecer' using errcode = '42501';
    end if;
    if new.status <> 'pending' or num_nonnulls(new.used_at, new.used_by, new.revoked_at, new.revoked_by) > 0 then
      raise exception 'o convite nasce pendente' using errcode = '42501';
    end if;
    dias := (private.configuracao('supplier_invitation_validity_days'))::integer;
    if dias is null or dias < 1 then
      raise exception 'a validade do convite de fornecedora não está configurada' using errcode = 'P0001';
    end if;
    new.invited_by := ator;
    new.created_at := now();
    new.expires_at := now() + make_interval(days => dias);
    perform pg_advisory_xact_lock(hashtext('supplier_invitation:' || new.email));
    if exists (
         select 1 from public.supplier_invitations c
         where c.email = new.email and c.status = 'pending' and c.expires_at > now()
           and c.organization_id is not distinct from new.organization_id) then
      raise exception 'já existe convite pendente para este e-mail' using errcode = 'P0001';
    end if;
    if new.organization_id is not null and not exists (
         select 1
         from public.organizations o
         join public.organization_members m on m.organization_id = o.id
         join public.profiles p on p.id = m.profile_id
         where o.id = new.organization_id and o.status = 'active' and o.kind = 'buyer'
           and m.role = 'org_admin' and m.status = 'active'
           and p.status = 'active' and lower(p.email) = new.email) then
      raise exception 'o convite para uma compradora vai ao e-mail de um administrador ativo dela, com a empresa ativa'
        using errcode = 'P0001';
    end if;
    return new;
  end if;

  if (new.id, new.email, new.organization_id, new.invited_by, new.expires_at, new.created_at)
     is distinct from
     (old.id, old.email, old.organization_id, old.invited_by, old.expires_at, old.created_at) then
    raise exception 'os dados do convite não mudam' using errcode = '42501';
  end if;
  if old.status <> 'pending' then
    raise exception 'convite usado ou revogado não muda' using errcode = 'P0001';
  end if;
  if pg_trigger_depth() > 1 then
    return new; -- usado pelo pedido de adesão (gatilho do pedido)
  end if;

  if new.status = 'revoked' then
    if ator is null or not private.tem_papel_na_plataforma(array['admin']) then
      raise exception 'só um administrador da plataforma revoga convite' using errcode = '42501';
    end if;
    new.revoked_at := now();
    new.revoked_by := ator;
    new.used_at := null;
    new.used_by := null;
    return new;
  end if;

  if new.status = 'used' then
    -- Aceite pela compradora: o pedido da empresa nova usa o convite pelo gatilho dele.
    if old.organization_id is null then
      raise exception 'o convite para empresa nova é usado pelo pedido de adesão' using errcode = 'P0001';
    end if;
    if ator is null or not private.perfil_ativo()
       or private.email_confirmado_do_usuario() is distinct from old.email
       or not private.membro_ativo(old.organization_id, array['org_admin']) then
      raise exception 'só o administrador da empresa convidado aceita o convite' using errcode = '42501';
    end if;
    if old.expires_at <= now() then
      raise exception 'o convite venceu; peça um novo à plataforma' using errcode = 'P0001';
    end if;
    if not exists (
         select 1 from public.organizations o
         where o.id = old.organization_id and o.status = 'active' and o.kind = 'buyer') then
      raise exception 'o convite vale só para compradora ativa' using errcode = 'P0001';
    end if;
    new.used_at := now();
    new.used_by := ator;
    new.revoked_at := null;
    new.revoked_by := null;
    update public.organizations set kind = 'both' where id = old.organization_id;
    return new;
  end if;

  raise exception 'transição de convite inválida: % para %', old.status, new.status using errcode = 'P0001';
end;
$$;

create or replace function private.proteger_pedido_de_adesao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ator uuid := (select auth.uid());
  admin boolean;
  empresa uuid;
begin
  if tg_op = 'INSERT' then
    if ator is null or not private.perfil_ativo() then
      raise exception 'o pedido exige sessão de usuário com perfil ativo' using errcode = '42501';
    end if;
    if not exists (select 1 from auth.users u where u.id = ator and u.email_confirmed_at is not null) then
      raise exception 'confirme o e-mail antes de enviar o pedido' using errcode = '42501';
    end if;
    if new.applicant_profile_id is distinct from ator and new.applicant_profile_id is not null then
      raise exception 'o requerente é o próprio usuário' using errcode = '42501';
    end if;
    if new.status <> 'submitted' or new.is_test
       or num_nonnulls(new.reviewed_by, new.reviewed_at, new.decision_reason, new.cnpj_checked_at,
                       new.cnpj_check_source, new.cnpj_check_evidence_id, new.organization_id) > 0 then
      raise exception 'o pedido nasce enviado, sem campos de revisão' using errcode = '42501';
    end if;
    new.applicant_profile_id := ator;
    new.cnpj := private.normalizar_cnpj(new.cnpj);
    return new;
  end if;

  if (new.id, new.applicant_profile_id, new.organization_name, new.legal_name, new.cnpj,
      new.contact_email, new.contact_phone, new.requested_kind, new.supplier_invitation_id, new.created_at)
     is distinct from
     (old.id, old.applicant_profile_id, old.organization_name, old.legal_name, old.cnpj,
      old.contact_email, old.contact_phone, old.requested_kind, old.supplier_invitation_id, old.created_at) then
    raise exception 'os dados enviados no pedido não mudam' using errcode = '42501';
  end if;
  if old.status in ('approved', 'rejected') then
    raise exception 'pedido decidido não muda; um novo pedido é uma nova linha' using errcode = 'P0001';
  end if;
  if ator is null or not private.tem_papel_na_plataforma(array['admin', 'operator']) then
    raise exception 'só a equipe da plataforma revisa pedidos' using errcode = '42501';
  end if;
  if old.applicant_profile_id = ator then
    raise exception 'ninguém revisa o próprio pedido' using errcode = '42501';
  end if;
  if (new.reviewed_by, new.reviewed_at, new.organization_id)
     is distinct from (old.reviewed_by, old.reviewed_at, old.organization_id) then
    raise exception 'revisor, data da decisão e empresa são preenchidos pelo banco' using errcode = '42501';
  end if;

  admin := private.tem_papel_na_plataforma(array['admin']);
  if not admin then
    -- O operador prepara a revisão (Q2): só move de submitted para under_review.
    if not (old.status = 'submitted' and new.status = 'under_review')
       or (new.is_test, new.decision_reason, new.cnpj_checked_at, new.cnpj_check_source, new.cnpj_check_evidence_id)
          is distinct from
          (old.is_test, old.decision_reason, old.cnpj_checked_at, old.cnpj_check_source, old.cnpj_check_evidence_id) then
      raise exception 'o operador só move o pedido de enviado para em análise' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status
     and not ((old.status = 'submitted' and new.status in ('under_review', 'approved', 'rejected'))
              or (old.status = 'under_review' and new.status in ('approved', 'rejected'))) then
    raise exception 'transição de pedido inválida: % para %', old.status, new.status using errcode = 'P0001';
  end if;
  if new.cnpj_check_evidence_id is not null and not exists (
       select 1 from public.membership_evidence_files e
       where e.id = new.cnpj_check_evidence_id and e.application_id = new.id) then
    raise exception 'a evidência precisa ser deste pedido' using errcode = 'P0001';
  end if;
  if new.cnpj_checked_at > now() then
    raise exception 'a data da conferência do CNPJ não pode estar no futuro' using errcode = 'P0001';
  end if;

  if new.status in ('approved', 'rejected') then
    new.reviewed_by := ator;
    new.reviewed_at := now();
  end if;

  if new.status = 'approved' then
    if num_nulls(new.cnpj_checked_at, new.cnpj_check_source, new.cnpj_check_evidence_id) > 0 then
      raise exception 'a aprovação exige a conferência do CNPJ, a fonte e a evidência' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.profiles p where p.id = new.applicant_profile_id and p.status = 'active') then
      raise exception 'o requerente precisa ter perfil ativo' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.organizations o where o.cnpj = new.cnpj and o.status <> 'closed') then
      raise exception 'já existe empresa não encerrada com este CNPJ; rejeite com motivo' using errcode = 'P0001';
    end if;
    insert into public.organizations (name, legal_name, cnpj, kind, status, contact_email, contact_phone, is_test)
    values (new.organization_name, new.legal_name, new.cnpj, new.requested_kind, 'active',
            new.contact_email, new.contact_phone, new.is_test)
    returning id into empresa;
    insert into public.organization_members (organization_id, profile_id, role, status)
    values (empresa, new.applicant_profile_id, 'org_admin', 'active');
    new.organization_id := empresa;
  end if;
  return new;
end;
$$;

revoke select on public.supplier_invitations from authenticated;
grant select (id, email, organization_id, status, expires_at, used_at, revoked_at, created_at, updated_at)
  on public.supplier_invitations to authenticated;
