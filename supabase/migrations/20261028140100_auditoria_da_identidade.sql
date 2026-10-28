-- I1.3: auditoria por gatilho, chaves estrangeiras de ator e configuração
-- crítica (ADR-0002 §2.7, §2.9 e §2.11; especificação v1.1, §5.6).
--
-- * Gatilhos after gravam em audit_logs as inclusões e mudanças de identidade.
--   metadata leva só os nomes dos campos alterados, as transições de status e
--   de papel e o motivo; nunca CNPJ, e-mail ou telefone.
-- * As chaves estrangeiras de ator são restritivas: SET NULL ou CASCADE
--   virariam UPDATE ou DELETE nas tabelas só de inclusão.
-- * platform_settings: toda chave nasce crítica; o administrador altera só o
--   valor; chaves novas, descrição e marcação crítica mudam por migração.

-- Auditoria ------------------------------------------------------------------------

create function private.registrar_auditoria()
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
begin
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(chave order by chave), '{}') into campos
    from jsonb_object_keys(depois) as chave
    where chave <> 'updated_at' and depois -> chave is distinct from antes -> chave;
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
  if motivo is not null then
    metadados := metadados || jsonb_build_object('motivo', left(motivo, 1000));
  end if;

  insert into public.audit_logs
    (actor_profile_id, actor_organization_id, action, entity_type, entity_id, metadata, request_id)
  values (
    (select auth.uid()),
    case tg_table_name
      when 'organizations' then (depois ->> 'id')::uuid
      when 'organization_members' then (depois ->> 'organization_id')::uuid
      when 'membership_applications' then (depois ->> 'organization_id')::uuid
    end,
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    coalesce(depois ->> 'id', depois ->> 'application_id')::uuid,
    metadados,
    left(private.cabecalho('x-request-id'), 200));
  return null;
end;
$$;

create trigger profiles_auditoria
  after insert or update on public.profiles
  for each row execute function private.registrar_auditoria();
create trigger organizations_auditoria
  after insert or update on public.organizations
  for each row execute function private.registrar_auditoria();
create trigger organization_members_auditoria
  after insert or update on public.organization_members
  for each row execute function private.registrar_auditoria();
create trigger platform_staff_auditoria
  after insert or update on public.platform_staff
  for each row execute function private.registrar_auditoria();
create trigger membership_applications_auditoria
  after insert or update on public.membership_applications
  for each row execute function private.registrar_auditoria();
create trigger membership_application_reviews_auditoria
  after insert or update on public.membership_application_reviews
  for each row execute function private.registrar_auditoria();
create trigger membership_evidence_files_auditoria
  after insert on public.membership_evidence_files
  for each row execute function private.registrar_auditoria();

-- Chaves estrangeiras de ator nas tabelas da I0.6 -------------------------------------

alter table public.audit_logs
  add constraint audit_logs_actor_profile_id_fkey
    foreign key (actor_profile_id) references public.profiles (id) on delete restrict,
  add constraint audit_logs_actor_organization_id_fkey
    foreign key (actor_organization_id) references public.organizations (id) on delete restrict;

alter table public.field_history
  add constraint field_history_changed_by_fkey
    foreign key (changed_by) references public.profiles (id) on delete restrict;

alter table public.restricted_access_logs
  add constraint restricted_access_logs_actor_profile_id_fkey
    foreign key (actor_profile_id) references public.profiles (id) on delete restrict,
  add constraint restricted_access_logs_actor_organization_id_fkey
    foreign key (actor_organization_id) references public.organizations (id) on delete restrict;

alter table public.platform_settings
  add constraint platform_settings_updated_by_fkey
    foreign key (updated_by) references public.profiles (id) on delete restrict;

-- Leitura dos registros (ADR-0002 §2.9) --------------------------------------------------

create policy audit_logs_leitura on public.audit_logs
  for select to authenticated using ((select private.pode_ler_auditoria()));
create policy field_history_leitura on public.field_history
  for select to authenticated using ((select private.pode_ler_auditoria()));
create policy restricted_access_logs_leitura on public.restricted_access_logs
  for select to authenticated using ((select private.pode_ler_auditoria()));

grant select on public.audit_logs, public.field_history, public.restricted_access_logs to authenticated;

-- Configuração crítica (ADR-0002 §2.7; teste 13) ----------------------------------------

-- id: field_history.entity_id é uuid, e a chave da configuração é texto.
alter table public.platform_settings
  add column id uuid not null default gen_random_uuid() unique,
  add column is_critical boolean not null default true;

comment on column public.platform_settings.is_critical is
  'Toda chave nasce crítica. Só o administrador lê a crítica; a migração que cria a chave decide, com registro, se ela deixa de ser.';

create function private.proteger_configuracao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ator uuid := (select auth.uid());
begin
  if tg_op = 'UPDATE' and (new.key, new.id) is distinct from (old.key, old.id) then
    raise exception 'a chave da configuração não muda' using errcode = '42501';
  end if;
  if private.manutencao() then
    -- Migração: cada valor entra no incremento que o usa (gate 7).
    new.updated_by := null;
    new.updated_at := now();
    return new;
  end if;
  if ator is null or not private.tem_papel_na_plataforma(array['admin']) then
    raise exception 'só um administrador da plataforma altera a configuração' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    raise exception 'chave nova de configuração entra por migração' using errcode = '42501';
  end if;
  if (new.description, new.is_critical) is distinct from (old.description, old.is_critical) then
    raise exception 'descrição e marcação crítica mudam só por migração' using errcode = '42501';
  end if;
  new.updated_by := ator;
  new.updated_at := now();
  return new;
end;
$$;

create function private.registrar_historico_de_configuracao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.value is distinct from old.value then
    insert into public.field_history (entity_type, entity_id, field, old_value, new_value, changed_by)
    values ('platform_settings', new.id, new.key,
            case when tg_op = 'UPDATE' then old.value end, new.value, (select auth.uid()));
  end if;
  return null;
end;
$$;

create trigger platform_settings_proteger
  before insert or update on public.platform_settings
  for each row execute function private.proteger_configuracao();
create trigger platform_settings_historico
  after insert or update on public.platform_settings
  for each row execute function private.registrar_historico_de_configuracao();
create trigger platform_settings_auditoria
  after insert or update on public.platform_settings
  for each row execute function private.registrar_auditoria();
create trigger platform_settings_sem_exclusao
  before delete on public.platform_settings
  for each row execute function private.impedir_exclusao();
create trigger platform_settings_sem_truncate
  before truncate on public.platform_settings
  for each statement execute function private.impedir_exclusao();

create policy platform_settings_leitura on public.platform_settings
  for select to authenticated
  using (
    (select private.tem_papel_na_plataforma(array['admin']))
    or (not is_critical and (
      (select private.tem_papel_na_plataforma(array['operator']))
      or exists (select 1 from private.empresas_do_usuario()))));

create policy platform_settings_alteracao on public.platform_settings
  for update to authenticated
  using ((select private.tem_papel_na_plataforma(array['admin'])))
  with check ((select private.tem_papel_na_plataforma(array['admin'])));

grant select on public.platform_settings to authenticated;
grant update (value) on public.platform_settings to authenticated;
-- A I0.6 dava escrita ao servidor; agora a escrita vem da sessão do administrador (§2.12).
revoke insert, update on public.platform_settings from service_role;

revoke all on function
  private.registrar_auditoria(),
  private.proteger_configuracao(),
  private.registrar_historico_de_configuracao()
  from public, anon, authenticated, service_role;
