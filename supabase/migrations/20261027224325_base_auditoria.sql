-- I0.6: base de auditoria, histórico de campos, registro de acesso restrito e
-- configuração da plataforma (especificação v1.1, §5.6; plano, gate 3 e teste 11).
--
-- * audit_logs, field_history e restricted_access_logs são só de inclusão:
--   um gatilho genérico recusa UPDATE, DELETE e TRUNCATE.
-- * RLS ligado em todas as tabelas. Sem políticas por enquanto: anon e
--   authenticated não têm acesso (os grants padrão do Supabase são revogados).
--   As políticas de leitura entram com os papéis da plataforma (Inc. 1).
-- * Os campos de ator ficam sem chave estrangeira até a tabela profiles existir
--   (I1.3, que acrescenta as FKs).
-- * platform_settings nasce vazia: cada valor entra no incremento que o usa,
--   sem valor comercial inventado (gate 7).

-- Gatilho genérico das tabelas só de inclusão --------------------------------

create function public.impedir_alteracao_de_registro()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'tabela só de inclusão: % não é permitido em %.%',
    tg_op, tg_table_schema, tg_table_name
    using errcode = 'P0001',
          hint = 'Para corrigir, insira um novo registro que substitui o anterior.';
end;
$$;

comment on function public.impedir_alteracao_de_registro() is
  'Recusa UPDATE, DELETE e TRUNCATE em tabelas só de inclusão (especificação v1.1, §5).';

-- Auditoria ------------------------------------------------------------------

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid,
  actor_organization_id uuid,
  action text not null check (length(action) between 1 and 200),
  entity_type text not null check (length(entity_type) between 1 and 100),
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  request_id text,
  occurred_at timestamptz not null default now()
);

comment on table public.audit_logs is
  'Auditoria só de inclusão (§5.6). Sem senha, token ou dado pessoal desnecessário em metadata.';

create index audit_logs_entidade_idx on public.audit_logs (entity_type, entity_id, occurred_at desc);
create index audit_logs_ator_idx on public.audit_logs (actor_profile_id, occurred_at desc);

-- Histórico de campos ----------------------------------------------------------

create table public.field_history (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (length(entity_type) between 1 and 100),
  entity_id uuid not null,
  field text not null check (length(field) between 1 and 100),
  old_value jsonb,
  new_value jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

comment on table public.field_history is
  'Histórico só de inclusão, com valor anterior e novo por campo (§5.6).';

create index field_history_entidade_idx on public.field_history (entity_type, entity_id, changed_at desc);

-- Acessos a documento ou evidência restrita ---------------------------------------

create table public.restricted_access_logs (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid,
  actor_organization_id uuid,
  resource_type text not null check (length(resource_type) between 1 and 100),
  resource_id uuid not null,
  request_id text,
  accessed_at timestamptz not null default now()
);

comment on table public.restricted_access_logs is
  'Registro só de inclusão de quem abriu documento ou evidência restrita, e quando (§5.6).';

create index restricted_access_logs_recurso_idx on public.restricted_access_logs (resource_type, resource_id, accessed_at desc);

-- Configuração da plataforma ---------------------------------------------------

create table public.platform_settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  value jsonb not null,
  description text not null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

comment on table public.platform_settings is
  'Parâmetros configuráveis (§5.6): comissão, campos materiais, categorias documentais, revisão antes de publicar (D10). Valores entram no incremento que os usa.';

-- Só inclusão -------------------------------------------------------------------

create trigger audit_logs_so_inclusao
  before update or delete on public.audit_logs
  for each row execute function public.impedir_alteracao_de_registro();
create trigger audit_logs_sem_truncate
  before truncate on public.audit_logs
  for each statement execute function public.impedir_alteracao_de_registro();

create trigger field_history_so_inclusao
  before update or delete on public.field_history
  for each row execute function public.impedir_alteracao_de_registro();
create trigger field_history_sem_truncate
  before truncate on public.field_history
  for each statement execute function public.impedir_alteracao_de_registro();

create trigger restricted_access_logs_so_inclusao
  before update or delete on public.restricted_access_logs
  for each row execute function public.impedir_alteracao_de_registro();
create trigger restricted_access_logs_sem_truncate
  before truncate on public.restricted_access_logs
  for each statement execute function public.impedir_alteracao_de_registro();

-- RLS e privilégios ----------------------------------------------------------------

alter table public.audit_logs enable row level security;
alter table public.field_history enable row level security;
alter table public.restricted_access_logs enable row level security;
alter table public.platform_settings enable row level security;

revoke all on public.audit_logs, public.field_history, public.restricted_access_logs, public.platform_settings
  from anon, authenticated;

-- O servidor (service_role) só lê e insere nas tabelas só de inclusão.
revoke update, delete, truncate on public.audit_logs, public.field_history, public.restricted_access_logs
  from service_role;
grant select, insert on public.audit_logs, public.field_history, public.restricted_access_logs
  to service_role;
grant select, insert, update on public.platform_settings to service_role;

revoke all on function public.impedir_alteracao_de_registro() from public, anon, authenticated;
