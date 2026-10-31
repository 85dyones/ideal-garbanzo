-- I1.9: fornecedora só por convite (mudança de escopo de 30/10; ADR-0002 §9).
--
-- * O cadastro público cria só empresa compradora. O pedido com requested_kind
--   supplier ou both exige convite pendente, dentro da validade, para o e-mail
--   confirmado do requerente; o pedido guarda o convite, que fica usado na
--   mesma transação.
-- * Só o administrador da plataforma convida e revoga.
-- * A compradora ativa passa a both pelo aceite do convite, feito por um
--   org_admin ativo dela com o e-mail convidado. O administrador não muda mais
--   o tipo para abrir o lado fornecedor sem convite.
-- * O vencimento conta pela data (expires_at); o convite vencido continua
--   pending e não serve para nada.

insert into public.platform_settings (key, value, description, is_critical) values
  ('supplier_invitation_validity_days', '14',
   'Validade do convite de fornecedora, em dias (ADR-0002 §9). Vale para os convites criados depois da mudança.', true);

-- E-mail confirmado do usuário da sessão, em minúsculas; nulo sem confirmação.
create function private.email_confirmado_do_usuario()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(u.email) from auth.users u
  where u.id = (select auth.uid()) and u.email_confirmed_at is not null;
$$;

create table public.supplier_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null check (
    length(email) between 3 and 320 and email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  organization_id uuid references public.organizations (id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'used', 'revoked')),
  invited_by uuid not null references public.profiles (id) on delete restrict,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references public.profiles (id) on delete restrict,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_invitations_situacao_completa check (
    case status
      when 'pending' then num_nonnulls(used_at, used_by, revoked_at, revoked_by) = 0
      when 'used' then used_at is not null and used_by is not null and num_nonnulls(revoked_at, revoked_by) = 0
      when 'revoked' then revoked_at is not null and revoked_by is not null and num_nonnulls(used_at, used_by) = 0
    end)
);

comment on table public.supplier_invitations is
  'Convite de fornecedora (§5.1, §6.1; ADR-0002 §9). Sem empresa, libera o pedido supplier ou both; com empresa compradora, o aceite do org_admin a torna both.';

create index supplier_invitations_email_idx on public.supplier_invitations (email, status);
create index supplier_invitations_empresa_idx on public.supplier_invitations (organization_id) where organization_id is not null;

alter table public.membership_applications
  add column supplier_invitation_id uuid unique references public.supplier_invitations (id) on delete restrict,
  add constraint membership_applications_convite_da_fornecedora check (
    case when requested_kind in ('supplier', 'both') then supplier_invitation_id is not null
         else supplier_invitation_id is null end);

comment on column public.membership_applications.supplier_invitation_id is
  'Convite usado pelo pedido supplier ou both, preenchido pelo gatilho (ADR-0002 §9). Pedido buyer não tem convite.';

-- Convite: só o administrador cria e revoga; o aceite é do org_admin convidado.
create function private.proteger_convite_de_fornecedora()
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

-- Pedido supplier ou both: usa o convite do e-mail confirmado do requerente.
-- Roda depois de membership_applications_proteger (ordem alfabética), que já
-- conferiu a sessão e o e-mail e fixou o requerente.
create function private.vincular_convite_ao_pedido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  convite uuid;
begin
  if new.requested_kind is null or new.requested_kind not in ('supplier', 'both') then
    new.supplier_invitation_id := null; -- buyer, ou fora do domínio para a CHECK recusar
    return new;
  end if;
  select c.id into convite
  from public.supplier_invitations c
  join auth.users u on u.id = new.applicant_profile_id
  where c.status = 'pending' and c.organization_id is null and c.expires_at > now()
    and u.email_confirmed_at is not null and c.email = lower(u.email)
  order by c.created_at
  limit 1
  for update of c;
  if convite is null then
    raise exception 'o pedido como fornecedora exige convite da plataforma para o seu e-mail' using errcode = 'P0001';
  end if;
  update public.supplier_invitations
  set status = 'used', used_at = now(), used_by = new.applicant_profile_id
  where id = convite;
  new.supplier_invitation_id := convite;
  return new;
end;
$$;

-- O tipo que abre o lado fornecedor só muda pelo aceite do convite (depth > 1).
create or replace function private.proteger_empresa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin boolean;
begin
  if pg_trigger_depth() > 1 then
    return new; -- criada pela aprovação da adesão ou tornada both pelo aceite do convite
  end if;
  if tg_op = 'INSERT' then
    raise exception 'a empresa nasce só pela aprovação da adesão' using errcode = '42501';
  end if;
  if (new.id, new.created_at) is distinct from (old.id, old.created_at) then
    raise exception 'identificador da empresa não muda' using errcode = '42501';
  end if;
  admin := private.tem_papel_na_plataforma(array['admin']);
  if (new.legal_name, new.cnpj, new.kind, new.is_test) is distinct from (old.legal_name, old.cnpj, old.kind, old.is_test)
     and not admin then
    raise exception 'só um administrador da plataforma altera razão social, CNPJ, tipo e marcação de teste'
      using errcode = '42501';
  end if;
  if old.kind = 'buyer' and new.kind in ('supplier', 'both') then
    raise exception 'a compradora passa a fornecer só pelo aceite do convite de fornecedora' using errcode = 'P0001';
  end if;
  if new.status is distinct from old.status then
    if not admin then
      raise exception 'só um administrador da plataforma muda o status da empresa' using errcode = '42501';
    end if;
    if old.status = 'closed' or new.status = 'pending' then
      raise exception 'transição de status da empresa inválida: % para %', old.status, new.status
        using errcode = 'P0001';
    end if;
    perform private.exigir_motivo();
  end if;
  if (new.name, new.contact_email, new.contact_phone) is distinct from (old.name, old.contact_email, old.contact_phone)
     and not admin and not private.membro_ativo(old.id, array['org_admin']) then
    raise exception 'só o administrador da empresa ativa ou da plataforma altera nome e contatos'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger supplier_invitations_proteger
  before insert or update on public.supplier_invitations
  for each row execute function private.proteger_convite_de_fornecedora();
create trigger supplier_invitations_updated_at before update on public.supplier_invitations
  for each row execute function private.atualizar_updated_at();
create trigger supplier_invitations_sem_exclusao before delete on public.supplier_invitations
  for each row execute function private.impedir_exclusao();
create trigger supplier_invitations_sem_truncate before truncate on public.supplier_invitations
  for each statement execute function private.impedir_exclusao();
create trigger supplier_invitations_auditoria
  after insert or update on public.supplier_invitations
  for each row execute function private.registrar_auditoria();

create trigger membership_applications_vincular_convite
  before insert on public.membership_applications
  for each row execute function private.vincular_convite_ao_pedido();

alter table public.supplier_invitations enable row level security;

create policy supplier_invitations_leitura on public.supplier_invitations
  for select to authenticated
  using (
    (select private.tem_papel_na_plataforma(array['admin', 'operator']))
    or (email = (select private.email_confirmado_do_usuario()) and (select private.perfil_ativo())));

create policy supplier_invitations_convite on public.supplier_invitations
  for insert to authenticated
  with check ((select private.tem_papel_na_plataforma(array['admin'])));

create policy supplier_invitations_alteracao on public.supplier_invitations
  for update to authenticated
  using (
    (select private.tem_papel_na_plataforma(array['admin']))
    or (organization_id is not null and email = (select private.email_confirmado_do_usuario())))
  with check (
    (select private.tem_papel_na_plataforma(array['admin']))
    or (organization_id is not null and email = (select private.email_confirmado_do_usuario())));

revoke all on public.supplier_invitations from public, anon, authenticated, service_role;
grant select on public.supplier_invitations to authenticated, service_role;
grant insert (email, organization_id) on public.supplier_invitations to authenticated;
grant update (status) on public.supplier_invitations to authenticated;

revoke all on function
  private.email_confirmado_do_usuario(),
  private.proteger_convite_de_fornecedora(),
  private.vincular_convite_ao_pedido()
  from public, anon, authenticated, service_role;
grant execute on function private.email_confirmado_do_usuario() to authenticated;
