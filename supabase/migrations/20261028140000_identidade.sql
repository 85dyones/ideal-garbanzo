-- I1.3: identidade, empresas e adesão (ADR-0002; especificação v1.1, §3, §5.1, §6.1).
--
-- * A autorização vem do banco a cada consulta: só auth.uid() vem do token.
--   Papel, status e vínculo são lidos das tabelas pelas funções do schema
--   private, que a API não expõe (ADR-0002 §2.1 e §2.2).
-- * Os gatilhos "proteger_*" valem para qualquer caminho (servidor, API ou
--   SQL) e recusam autopromoção, transições inválidas e colunas que o ator não
--   pode mudar (§2.4 a §2.6). Escrita feita por outro gatilho nosso
--   (pg_trigger_depth() > 1) é interna: a aprovação da adesão cria empresa e
--   vínculo, e o cadastro do Auth cria e sincroniza o perfil. Nenhuma chave
--   estrangeira deste schema tem ação em cascata, então um usuário não
--   consegue disparar escrita interna fora desses caminhos.
-- * Sem DELETE para ninguém: sair, remover e revogar são mudanças de status.
-- * Auditoria, histórico e chaves estrangeiras de ator: migração seguinte.
--   Bucket e políticas da evidência: migração da evidência da adesão.

-- Schema private ---------------------------------------------------------------

create schema private;

comment on schema private is
  'Funções de autorização e gatilhos (ADR-0002 §2.2). Fora dos schemas expostos pela API.';

revoke all on schema private from public;
-- As políticas rodam com o papel de quem consulta e chamam as funções daqui.
grant usage on schema private to authenticated;

-- Utilitários ------------------------------------------------------------------

create function private.atualizar_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create function private.impedir_exclusao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'exclusão não é permitida em %.%', tg_table_schema, tg_table_name
    using errcode = '42501',
          hint = 'Sair, remover, revogar e encerrar são mudanças de status, com histórico.';
end;
$$;

-- Cabeçalho da requisição da API (o PostgREST preenche request.headers).
create function private.cabecalho(nome text)
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(btrim((nullif(current_setting('request.headers', true), '')::jsonb) ->> lower(nome)), '');
$$;

create function private.via_api()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('request.headers', true), '') <> '';
$$;

-- SQL fora da API e sem sessão de usuário: migração ou a pessoa responsável
-- no editor do projeto. Pela API a sessão é sempre do authenticator.
create function private.manutencao()
returns boolean
language sql
stable
set search_path = ''
as $$
  select (select auth.uid()) is null
    and session_user <> 'authenticator'
    and coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}') = '{}';
$$;

-- Mudança de status pela API exige motivo no cabeçalho x-audit-reason (§2.11).
create function private.exigir_motivo()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if private.via_api() and private.cabecalho('x-audit-reason') is null then
    raise exception 'informe o motivo da mudança de status' using errcode = 'P0001';
  end if;
end;
$$;

-- CNPJ -------------------------------------------------------------------------
-- Numérico ou alfanumérico (IN RFB 2.229/2024): 12 posições de 0-9 ou A-Z e
-- dois dígitos verificadores numéricos, módulo 11 com pesos de 2 a 9 da
-- direita para a esquerda e cada caractere valendo o código ASCII menos 48.
-- Resto 0 ou 1 dá dígito 0. Regra conferida no manual de cálculo do DV
-- publicado pela Receita e no exemplo oficial 12.ABC.345/01DE-35.

create function private.normalizar_cnpj(valor text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select upper(regexp_replace(valor, '[^0-9A-Za-z]', '', 'g'));
$$;

create function private.cnpj_valido(cnpj text)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  soma integer;
  peso integer;
  resto integer;
  dv1 integer;
  dv2 integer;
begin
  if cnpj !~ '^[0-9A-Z]{12}[0-9]{2}$' or cnpj = repeat(left(cnpj, 1), 14) then
    return false;
  end if;

  soma := 0;
  peso := 2;
  for i in reverse 12..1 loop
    soma := soma + (ascii(substr(cnpj, i, 1)) - 48) * peso;
    peso := case when peso = 9 then 2 else peso + 1 end;
  end loop;
  resto := soma % 11;
  dv1 := case when resto < 2 then 0 else 11 - resto end;

  soma := dv1 * 2;
  peso := 3;
  for i in reverse 12..1 loop
    soma := soma + (ascii(substr(cnpj, i, 1)) - 48) * peso;
    peso := case when peso = 9 then 2 else peso + 1 end;
  end loop;
  resto := soma % 11;
  dv2 := case when resto < 2 then 0 else 11 - resto end;

  return substr(cnpj, 13, 1)::integer = dv1 and substr(cnpj, 14, 1)::integer = dv2;
end;
$$;

comment on function private.cnpj_valido(text) is
  'Dígitos verificadores do CNPJ numérico e do alfanumérico (IN RFB 2.229/2024). Espera o valor normalizado.';

-- Tabelas ----------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete restrict,
  full_name text not null default '' check (length(full_name) <= 200),
  email text check (email is null or length(email) between 3 and 320),
  phone text check (phone is null or phone ~ '^\+?[0-9 ()-]{8,30}$'),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Perfil do usuário do Auth (§5.1). Nasce pelo cadastro; e-mail só pela sincronização com auth.users; usuários não são apagados (ADR-0002 §2.8).';

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 200),
  legal_name text not null check (length(btrim(legal_name)) between 1 and 300),
  cnpj text not null check (private.cnpj_valido(cnpj)),
  cnpj_root text not null generated always as (left(cnpj, 8)) stored,
  kind text not null check (kind in ('supplier', 'buyer', 'both')),
  status text not null default 'active' check (status in ('pending', 'active', 'suspended', 'closed')),
  contact_email text check (contact_email is null or (length(contact_email) <= 320 and contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  contact_phone text check (contact_phone is null or contact_phone ~ '^\+?[0-9 ()-]{8,30}$'),
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.organizations is
  'Empresa (§5.1). Nasce ativa pela aprovação da adesão. CNPJ e contatos são de acesso restrito; closed é final e libera o CNPJ (ADR-0002 §2.5 e §2.10).';

create unique index organizations_cnpj_unico_idx on public.organizations (cnpj) where status <> 'closed';
create index organizations_cnpj_root_idx on public.organizations (cnpj_root);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  profile_id uuid not null references public.profiles (id) on delete restrict,
  role text not null check (role in ('org_admin', 'member')),
  status text not null default 'pending' check (status in ('pending', 'active', 'suspended', 'removed')),
  invited_email text check (invited_email is null or length(invited_email) between 3 and 320),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, profile_id)
);

comment on table public.organization_members is
  'Vínculo do perfil com a empresa (§5.1). Convite nasce pending e o convidado aceita; só active dá acesso (ADR-0002 §2.6).';

create index organization_members_perfil_idx on public.organization_members (profile_id);
create index organization_members_empresa_idx on public.organization_members (organization_id, role, status);

create table public.platform_staff (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete restrict,
  role text not null check (role in ('admin', 'operator')),
  status text not null default 'active' check (status in ('active', 'revoked')),
  can_read_audit boolean not null default false check (not can_read_audit or role = 'operator'),
  granted_by uuid references public.profiles (id) on delete restrict,
  granted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.platform_staff is
  'Papéis da plataforma (§3.1). Só administrador concede, nunca na própria linha; granted_by vem do gatilho; granted_by nulo só no primeiro administrador (ADR-0002 §2.13).';

create table public.membership_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_profile_id uuid not null references public.profiles (id) on delete restrict,
  organization_name text not null check (length(btrim(organization_name)) between 1 and 200),
  legal_name text not null check (length(btrim(legal_name)) between 1 and 300),
  cnpj text not null check (private.cnpj_valido(cnpj)),
  contact_email text check (contact_email is null or (length(contact_email) <= 320 and contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  contact_phone text check (contact_phone is null or contact_phone ~ '^\+?[0-9 ()-]{8,30}$'),
  requested_kind text not null check (requested_kind in ('supplier', 'buyer', 'both')),
  status text not null default 'submitted' check (status in ('submitted', 'under_review', 'approved', 'rejected')),
  is_test boolean not null default false,
  reviewed_by uuid references public.profiles (id) on delete restrict,
  reviewed_at timestamptz,
  decision_reason text check (decision_reason is null or length(btrim(decision_reason)) between 1 and 2000),
  cnpj_checked_at timestamptz,
  cnpj_check_source text check (cnpj_check_source is null or length(btrim(cnpj_check_source)) between 1 and 500),
  cnpj_check_evidence_id uuid,
  organization_id uuid references public.organizations (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint membership_applications_aprovacao_completa check (
    status <> 'approved' or (
      reviewed_by is not null and reviewed_at is not null and cnpj_checked_at is not null
      and cnpj_check_source is not null and cnpj_check_evidence_id is not null and organization_id is not null)),
  constraint membership_applications_rejeicao_com_motivo check (
    status <> 'rejected' or (reviewed_by is not null and reviewed_at is not null and decision_reason is not null)),
  constraint membership_applications_empresa_so_na_aprovacao check (status = 'approved' or organization_id is null)
);

comment on table public.membership_applications is
  'Pedido de adesão (§5.1, §6.1). A aprovação cria empresa e vínculo no mesmo UPDATE, pelo gatilho (ADR-0002 §2.5).';

create unique index membership_applications_um_aberto_idx
  on public.membership_applications (applicant_profile_id) where status in ('submitted', 'under_review');
create index membership_applications_status_idx on public.membership_applications (status, created_at);
create index membership_applications_cnpj_idx on public.membership_applications (cnpj);

create table public.membership_application_reviews (
  application_id uuid primary key references public.membership_applications (id) on delete restrict,
  checklist jsonb not null default '[]'::jsonb
    check (jsonb_typeof(checklist) = 'array' and length(checklist::text) <= 65536),
  updated_by uuid references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.membership_application_reviews is
  'O que foi conferido na adesão, sem lista fixa (C5). Separada do pedido porque só o staff lê (ADR-0002 §2.5).';

create table public.membership_evidence_files (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.membership_applications (id) on delete restrict,
  storage_path text not null unique
    check (storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]{1,200}$'),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  content_type text not null check (length(content_type) between 3 and 100),
  size_bytes bigint not null check (size_bytes > 0),
  description text check (description is null or length(description) <= 500),
  uploaded_by uuid not null references public.profiles (id) on delete restrict,
  uploaded_at timestamptz not null default now(),
  unique (id, application_id),
  constraint membership_evidence_files_caminho_do_pedido check (split_part(storage_path, '/', 1) = application_id::text)
);

comment on table public.membership_evidence_files is
  'Evidência da conferência de CNPJ, só de inclusão. Arquivo no bucket privado membership-evidence (ADR-0002 §2.5).';

-- A evidência da aprovação é sempre do mesmo pedido.
alter table public.membership_applications
  add constraint membership_applications_evidencia_do_pedido
  foreign key (cnpj_check_evidence_id, id)
  references public.membership_evidence_files (id, application_id) on delete restrict;

-- Funções de autorização (ADR-0002 §2.2) -----------------------------------------
-- security definer: leem as tabelas sem passar pela RLS de quem consulta.
-- Nas políticas, ficam dentro de (select ...) para rodar uma vez por consulta.

create function private.perfil_ativo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.status = 'active');
$$;

create function private.tem_papel_na_plataforma(papeis text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_staff s
    join public.profiles p on p.id = s.profile_id
    where s.profile_id = (select auth.uid())
      and s.status = 'active' and p.status = 'active'
      and s.role = any (papeis));
$$;

create function private.pode_ler_auditoria()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_staff s
    join public.profiles p on p.id = s.profile_id
    where s.profile_id = (select auth.uid())
      and s.status = 'active' and p.status = 'active'
      and (s.role = 'admin' or (s.role = 'operator' and s.can_read_audit)));
$$;

-- Vínculo ativo, com perfil e empresa ativos; se informado, com papel na lista.
create function private.membro_ativo(empresa uuid, papeis text[] default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    join public.profiles p on p.id = m.profile_id
    join public.organizations o on o.id = m.organization_id
    where m.organization_id = empresa
      and m.profile_id = (select auth.uid())
      and m.status = 'active' and p.status = 'active' and o.status = 'active'
      and (papeis is null or m.role = any (papeis)));
$$;

create function private.empresas_do_usuario(papeis text[] default null)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
  from public.organization_members m
  join public.profiles p on p.id = m.profile_id
  join public.organizations o on o.id = m.organization_id
  where m.profile_id = (select auth.uid())
    and m.status = 'active' and p.status = 'active' and o.status = 'active'
    and (papeis is null or m.role = any (papeis));
$$;

-- Empresas cuja linha o usuário lê: vínculo ativo, inclusive com a empresa
-- suspensa ou encerrada (para a tela mostrar a situação), e convite pendente
-- (para o convidado saber quem convidou).
create function private.empresas_com_vinculo()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
  from public.organization_members m
  join public.profiles p on p.id = m.profile_id
  where m.profile_id = (select auth.uid())
    and m.status in ('active', 'pending') and p.status = 'active';
$$;

-- Perfis que o usuário vê como colegas: vínculo ativo ou suspenso numa empresa
-- em que ele é membro ativo. Convidado pendente não é colega até aceitar.
create function private.colegas_do_usuario()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.profile_id
  from public.organization_members m
  where m.status in ('active', 'suspended')
    and m.organization_id in (select private.empresas_do_usuario());
$$;

create function private.pode_ver_catalogo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    join public.profiles p on p.id = m.profile_id
    join public.organizations o on o.id = m.organization_id
    where m.profile_id = (select auth.uid())
      and m.status = 'active' and p.status = 'active' and o.status = 'active'
      and o.kind in ('buyer', 'both'));
$$;

-- Gatilhos de perfil e e-mail (ADR-0002 §2.8) -------------------------------------

create function private.criar_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 200));
  return null;
end;
$$;

create function private.sincronizar_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return null;
end;
$$;

create trigger repasse_criar_perfil
  after insert on auth.users
  for each row execute function private.criar_perfil();

create trigger repasse_sincronizar_email
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function private.sincronizar_email();

create function private.proteger_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ator uuid := (select auth.uid());
begin
  if pg_trigger_depth() > 1 then
    return new; -- cadastro e sincronização de e-mail
  end if;
  if tg_op = 'INSERT' then
    raise exception 'o perfil nasce só pelo cadastro' using errcode = '42501';
  end if;
  if (new.id, new.email, new.created_at) is distinct from (old.id, old.email, old.created_at) then
    raise exception 'o e-mail muda só pelo fluxo de confirmação do Auth' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    if ator is null or ator = old.id or not private.tem_papel_na_plataforma(array['admin']) then
      raise exception 'só um administrador da plataforma muda o status de outro perfil' using errcode = '42501';
    end if;
    perform private.exigir_motivo();
  end if;
  if (new.full_name, new.phone) is distinct from (old.full_name, old.phone)
     and (ator is null or ator <> old.id or old.status <> 'active') then
    raise exception 'só o próprio usuário, com perfil ativo, altera nome e telefone' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Empresa (ADR-0002 §2.4 e §2.10) --------------------------------------------------

create function private.proteger_empresa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin boolean;
begin
  if pg_trigger_depth() > 1 then
    return new; -- criada pela aprovação da adesão
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

-- Membros (ADR-0002 §2.6) ------------------------------------------------------------

create function private.proteger_vinculo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ator uuid := (select auth.uid());
begin
  if pg_trigger_depth() > 1 then
    return new; -- vínculo do requerente, criado pela aprovação da adesão
  end if;
  if ator is null then
    raise exception 'gerenciar membros exige sessão de usuário' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE'
     and (new.id, new.organization_id, new.profile_id, new.created_at)
         is distinct from (old.id, old.organization_id, old.profile_id, old.created_at) then
    raise exception 'empresa e perfil do vínculo não mudam' using errcode = '42501';
  end if;

  -- Na própria linha, só aceitar ou recusar o próprio convite.
  if new.profile_id = ator then
    if tg_op = 'UPDATE' and old.status = 'pending' and new.status in ('active', 'removed')
       and new.role = old.role and new.invited_email is not distinct from old.invited_email
       and private.perfil_ativo()
       and (new.status = 'removed'
            or exists (select 1 from public.organizations o where o.id = new.organization_id and o.status = 'active')) then
      return new;
    end if;
    raise exception 'ninguém altera o próprio vínculo, fora aceitar ou recusar o próprio convite'
      using errcode = '42501';
  end if;

  if not (private.tem_papel_na_plataforma(array['admin'])
          or private.membro_ativo(new.organization_id, array['org_admin'])) then
    raise exception 'só o administrador da empresa ativa ou da plataforma gerencia membros' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'pending' then
      raise exception 'o vínculo nasce como convite pendente; o convidado aceita' using errcode = 'P0001';
    end if;
  elsif new.status is distinct from old.status then
    if not ((old.status = 'pending' and new.status = 'removed')
         or (old.status = 'active' and new.status in ('suspended', 'removed'))
         or (old.status = 'suspended' and new.status in ('active', 'removed'))
         or (old.status = 'removed' and new.status = 'pending')) then
      raise exception 'transição de vínculo inválida: % para %', old.status, new.status using errcode = 'P0001';
    end if;
  elsif new.role is distinct from old.role and old.status = 'removed' then
    raise exception 'vínculo removido não muda de papel; convide de novo' using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE' and new.invited_email is distinct from old.invited_email
     and not (old.status = 'removed' and new.status = 'pending') then
    raise exception 'o e-mail do convite só muda no reconvite' using errcode = 'P0001';
  end if;
  if new.status = 'pending'
     and not exists (select 1 from public.profiles p where p.id = new.profile_id and p.status = 'active') then
    raise exception 'o convidado precisa ter perfil ativo' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- A empresa ativa mantém ao menos um org_admin ativo.
create function private.garantir_admin_da_empresa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'org_admin' and old.status = 'active'
     and (new.role <> 'org_admin' or new.status <> 'active')
     and exists (select 1 from public.organizations o where o.id = old.organization_id and o.status = 'active')
     and not exists (
       select 1 from public.organization_members m
       where m.organization_id = old.organization_id and m.role = 'org_admin' and m.status = 'active') then
    raise exception 'a empresa ativa precisa de ao menos um administrador ativo' using errcode = 'P0001';
  end if;
  return null;
end;
$$;

-- Papéis da plataforma (ADR-0002 §2.4 e §2.13) ------------------------------------

create function private.proteger_papel_da_plataforma()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ator uuid := (select auth.uid());
begin
  -- Primeiro administrador: SQL da pessoa responsável, sem sessão, só enquanto
  -- não houver administrador ativo.
  if tg_op = 'INSERT' and private.manutencao() then
    if exists (
      select 1 from public.platform_staff s join public.profiles p on p.id = s.profile_id
      where s.role = 'admin' and s.status = 'active' and p.status = 'active') then
      raise exception 'já existe administrador ativo; papéis são concedidos por um administrador na própria sessão'
        using errcode = '42501';
    end if;
    if new.role <> 'admin' or new.status <> 'active' or new.can_read_audit then
      raise exception 'a inclusão sem sessão serve só para o primeiro administrador' using errcode = 'P0001';
    end if;
    new.granted_by := null;
    new.granted_at := now();
    return new;
  end if;

  if ator is null or not private.tem_papel_na_plataforma(array['admin']) then
    raise exception 'só um administrador da plataforma concede ou altera papéis' using errcode = '42501';
  end if;
  if new.profile_id = ator or (tg_op = 'UPDATE' and old.profile_id = ator) then
    raise exception 'ninguém altera o próprio papel na plataforma' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE'
     and (new.id, new.profile_id, new.created_at) is distinct from (old.id, old.profile_id, old.created_at) then
    raise exception 'o perfil do papel não muda' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and new.status <> 'active' then
    raise exception 'o papel nasce ativo' using errcode = 'P0001';
  end if;
  if new.status = 'active'
     and not exists (select 1 from public.profiles p where p.id = new.profile_id and p.status = 'active') then
    raise exception 'o papel só vale para perfil ativo' using errcode = 'P0001';
  end if;

  if tg_op = 'INSERT' or (new.role, new.status) is distinct from (old.role, old.status) then
    new.granted_by := ator;
    new.granted_at := now();
  else
    new.granted_by := old.granted_by;
    new.granted_at := old.granted_at;
  end if;
  return new;
end;
$$;

create function private.garantir_administrador_da_plataforma()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'admin' and old.status = 'active' and (new.role <> 'admin' or new.status <> 'active')
     and not exists (select 1 from public.platform_staff s where s.role = 'admin' and s.status = 'active') then
    raise exception 'a plataforma precisa de ao menos um administrador ativo' using errcode = 'P0001';
  end if;
  return null;
end;
$$;

-- Adesão (ADR-0002 §2.5) -------------------------------------------------------------

create function private.proteger_pedido_de_adesao()
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
      new.contact_email, new.contact_phone, new.requested_kind, new.created_at)
     is distinct from
     (old.id, old.applicant_profile_id, old.organization_name, old.legal_name, old.cnpj,
      old.contact_email, old.contact_phone, old.requested_kind, old.created_at) then
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

create function private.proteger_conferencia_da_adesao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ator uuid := (select auth.uid());
  pedido public.membership_applications;
begin
  if tg_op = 'UPDATE'
     and (new.application_id, new.created_at) is distinct from (old.application_id, old.created_at) then
    raise exception 'o pedido da conferência não muda' using errcode = '42501';
  end if;
  if ator is null or not private.tem_papel_na_plataforma(array['admin']) then
    raise exception 'só um administrador da plataforma grava a conferência' using errcode = '42501';
  end if;
  select * into pedido from public.membership_applications a where a.id = new.application_id;
  if not found or pedido.status not in ('submitted', 'under_review') then
    raise exception 'a conferência só muda enquanto o pedido está aberto' using errcode = 'P0001';
  end if;
  if pedido.applicant_profile_id = ator then
    raise exception 'ninguém confere o próprio pedido' using errcode = '42501';
  end if;
  new.updated_by := ator;
  return new;
end;
$$;

create function private.proteger_evidencia_da_adesao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ator uuid := (select auth.uid());
  pedido public.membership_applications;
begin
  if ator is null or not private.tem_papel_na_plataforma(array['admin']) then
    raise exception 'só um administrador da plataforma registra a evidência' using errcode = '42501';
  end if;
  select * into pedido from public.membership_applications a where a.id = new.application_id;
  if not found or pedido.status not in ('submitted', 'under_review') then
    raise exception 'a evidência só entra enquanto o pedido está aberto' using errcode = 'P0001';
  end if;
  if pedido.applicant_profile_id = ator then
    raise exception 'ninguém registra evidência do próprio pedido' using errcode = '42501';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'membership-evidence' and o.name = new.storage_path) then
    raise exception 'o arquivo da evidência não está no armazenamento' using errcode = 'P0001';
  end if;
  new.uploaded_by := ator;
  new.uploaded_at := now();
  return new;
end;
$$;

-- Gatilhos -----------------------------------------------------------------------

create trigger profiles_proteger
  before insert or update on public.profiles
  for each row execute function private.proteger_perfil();
create trigger organizations_proteger
  before insert or update on public.organizations
  for each row execute function private.proteger_empresa();
create trigger organization_members_proteger
  before insert or update on public.organization_members
  for each row execute function private.proteger_vinculo();
create trigger organization_members_garantir_admin
  after update on public.organization_members
  for each row execute function private.garantir_admin_da_empresa();
create trigger platform_staff_proteger
  before insert or update on public.platform_staff
  for each row execute function private.proteger_papel_da_plataforma();
create trigger platform_staff_garantir_admin
  after update on public.platform_staff
  for each row execute function private.garantir_administrador_da_plataforma();
create trigger membership_applications_proteger
  before insert or update on public.membership_applications
  for each row execute function private.proteger_pedido_de_adesao();
create trigger membership_application_reviews_proteger
  before insert or update on public.membership_application_reviews
  for each row execute function private.proteger_conferencia_da_adesao();
create trigger membership_evidence_files_proteger
  before insert on public.membership_evidence_files
  for each row execute function private.proteger_evidencia_da_adesao();

-- updated_at
create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.atualizar_updated_at();
create trigger organizations_updated_at before update on public.organizations
  for each row execute function private.atualizar_updated_at();
create trigger organization_members_updated_at before update on public.organization_members
  for each row execute function private.atualizar_updated_at();
create trigger platform_staff_updated_at before update on public.platform_staff
  for each row execute function private.atualizar_updated_at();
create trigger membership_applications_updated_at before update on public.membership_applications
  for each row execute function private.atualizar_updated_at();
create trigger membership_application_reviews_updated_at before update on public.membership_application_reviews
  for each row execute function private.atualizar_updated_at();

-- Sem exclusão
create trigger profiles_sem_exclusao before delete on public.profiles
  for each row execute function private.impedir_exclusao();
create trigger organizations_sem_exclusao before delete on public.organizations
  for each row execute function private.impedir_exclusao();
create trigger organization_members_sem_exclusao before delete on public.organization_members
  for each row execute function private.impedir_exclusao();
create trigger platform_staff_sem_exclusao before delete on public.platform_staff
  for each row execute function private.impedir_exclusao();
create trigger membership_applications_sem_exclusao before delete on public.membership_applications
  for each row execute function private.impedir_exclusao();
create trigger membership_application_reviews_sem_exclusao before delete on public.membership_application_reviews
  for each row execute function private.impedir_exclusao();

create trigger profiles_sem_truncate before truncate on public.profiles
  for each statement execute function private.impedir_exclusao();
create trigger organizations_sem_truncate before truncate on public.organizations
  for each statement execute function private.impedir_exclusao();
create trigger organization_members_sem_truncate before truncate on public.organization_members
  for each statement execute function private.impedir_exclusao();
create trigger platform_staff_sem_truncate before truncate on public.platform_staff
  for each statement execute function private.impedir_exclusao();
create trigger membership_applications_sem_truncate before truncate on public.membership_applications
  for each statement execute function private.impedir_exclusao();
create trigger membership_application_reviews_sem_truncate before truncate on public.membership_application_reviews
  for each statement execute function private.impedir_exclusao();

-- Evidência: só de inclusão
create trigger membership_evidence_files_so_inclusao
  before update or delete on public.membership_evidence_files
  for each row execute function public.impedir_alteracao_de_registro();
create trigger membership_evidence_files_sem_truncate
  before truncate on public.membership_evidence_files
  for each statement execute function public.impedir_alteracao_de_registro();

-- RLS (ADR-0002 §2.9) -------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.platform_staff enable row level security;
alter table public.membership_applications enable row level security;
alter table public.membership_application_reviews enable row level security;
alter table public.membership_evidence_files enable row level security;

create policy profiles_leitura on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or id in (select private.colegas_do_usuario())
    or (select private.tem_papel_na_plataforma(array['admin', 'operator'])));

create policy profiles_alteracao on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or (select private.tem_papel_na_plataforma(array['admin'])))
  with check (id = (select auth.uid()) or (select private.tem_papel_na_plataforma(array['admin'])));

create policy organizations_leitura on public.organizations
  for select to authenticated
  using (
    id in (select private.empresas_com_vinculo())
    or (select private.tem_papel_na_plataforma(array['admin', 'operator'])));

create policy organizations_alteracao on public.organizations
  for update to authenticated
  using (
    (select private.tem_papel_na_plataforma(array['admin']))
    or id in (select private.empresas_do_usuario(array['org_admin'])))
  with check (
    (select private.tem_papel_na_plataforma(array['admin']))
    or id in (select private.empresas_do_usuario(array['org_admin'])));

create policy organization_members_leitura on public.organization_members
  for select to authenticated
  using (
    organization_id in (select private.empresas_do_usuario())
    or (profile_id = (select auth.uid()) and (select private.perfil_ativo()))
    or (select private.tem_papel_na_plataforma(array['admin', 'operator'])));

create policy organization_members_convite on public.organization_members
  for insert to authenticated
  with check (
    (select private.tem_papel_na_plataforma(array['admin']))
    or organization_id in (select private.empresas_do_usuario(array['org_admin'])));

create policy organization_members_alteracao on public.organization_members
  for update to authenticated
  using (
    (select private.tem_papel_na_plataforma(array['admin']))
    or organization_id in (select private.empresas_do_usuario(array['org_admin']))
    or (profile_id = (select auth.uid()) and status = 'pending'))
  with check (
    (select private.tem_papel_na_plataforma(array['admin']))
    or organization_id in (select private.empresas_do_usuario(array['org_admin']))
    or profile_id = (select auth.uid()));

create policy platform_staff_leitura on public.platform_staff
  for select to authenticated
  using (profile_id = (select auth.uid()) or (select private.tem_papel_na_plataforma(array['admin'])));

create policy platform_staff_concessao on public.platform_staff
  for insert to authenticated
  with check ((select private.tem_papel_na_plataforma(array['admin'])));

create policy platform_staff_alteracao on public.platform_staff
  for update to authenticated
  using ((select private.tem_papel_na_plataforma(array['admin'])))
  with check ((select private.tem_papel_na_plataforma(array['admin'])));

create policy membership_applications_leitura on public.membership_applications
  for select to authenticated
  using (
    (applicant_profile_id = (select auth.uid()) and (select private.perfil_ativo()))
    or (select private.tem_papel_na_plataforma(array['admin', 'operator'])));

create policy membership_applications_envio on public.membership_applications
  for insert to authenticated
  with check (applicant_profile_id = (select auth.uid()) and (select private.perfil_ativo()));

create policy membership_applications_revisao on public.membership_applications
  for update to authenticated
  using ((select private.tem_papel_na_plataforma(array['admin', 'operator'])))
  with check ((select private.tem_papel_na_plataforma(array['admin', 'operator'])));

create policy membership_application_reviews_leitura on public.membership_application_reviews
  for select to authenticated
  using ((select private.tem_papel_na_plataforma(array['admin', 'operator'])));

create policy membership_application_reviews_inclusao on public.membership_application_reviews
  for insert to authenticated
  with check ((select private.tem_papel_na_plataforma(array['admin'])));

create policy membership_application_reviews_alteracao on public.membership_application_reviews
  for update to authenticated
  using ((select private.tem_papel_na_plataforma(array['admin'])))
  with check ((select private.tem_papel_na_plataforma(array['admin'])));

create policy membership_evidence_files_leitura on public.membership_evidence_files
  for select to authenticated
  using ((select private.tem_papel_na_plataforma(array['admin'])));

create policy membership_evidence_files_inclusao on public.membership_evidence_files
  for insert to authenticated
  with check ((select private.tem_papel_na_plataforma(array['admin'])));

-- Privilégios ----------------------------------------------------------------------
-- Os grants padrão do Supabase no public são revogados. authenticated escreve
-- só as colunas que algum papel pode mudar; o gatilho decide quem muda o quê.
-- service_role só lê: o servidor escreve com a sessão do usuário (§2.12).

revoke all on public.profiles, public.organizations, public.organization_members, public.platform_staff,
  public.membership_applications, public.membership_application_reviews, public.membership_evidence_files
  from anon, authenticated, service_role;

grant select on public.profiles, public.organizations, public.organization_members, public.platform_staff,
  public.membership_applications, public.membership_application_reviews, public.membership_evidence_files
  to authenticated, service_role;

grant update (full_name, phone, status) on public.profiles to authenticated;
grant update (name, legal_name, cnpj, kind, status, contact_email, contact_phone, is_test)
  on public.organizations to authenticated;
grant insert (organization_id, profile_id, role, invited_email) on public.organization_members to authenticated;
grant update (role, status, invited_email) on public.organization_members to authenticated;
grant insert (profile_id, role, can_read_audit) on public.platform_staff to authenticated;
grant update (role, status, can_read_audit) on public.platform_staff to authenticated;
grant insert (organization_name, legal_name, cnpj, contact_email, contact_phone, requested_kind)
  on public.membership_applications to authenticated;
grant update (status, is_test, decision_reason, cnpj_checked_at, cnpj_check_source, cnpj_check_evidence_id)
  on public.membership_applications to authenticated;
grant insert (application_id, checklist) on public.membership_application_reviews to authenticated;
grant update (checklist) on public.membership_application_reviews to authenticated;
grant insert (application_id, storage_path, sha256, content_type, size_bytes, description)
  on public.membership_evidence_files to authenticated;

-- Funções: execute só para o que as políticas e as restrições chamam.
revoke all on all functions in schema private from public, anon, authenticated, service_role;
grant execute on function
  private.perfil_ativo(),
  private.tem_papel_na_plataforma(text[]),
  private.pode_ler_auditoria(),
  private.membro_ativo(uuid, text[]),
  private.empresas_do_usuario(text[]),
  private.empresas_com_vinculo(),
  private.colegas_do_usuario(),
  private.pode_ver_catalogo(),
  private.cnpj_valido(text),
  private.normalizar_cnpj(text)
  to authenticated;
