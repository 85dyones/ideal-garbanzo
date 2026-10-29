-- I2.4: Storage privado das ofertas (ADR-0003 §2.13; especificação v1.1,
-- §4.2, §7.1 e teste 6 da §7.4).
--
-- * Dois buckets privados, pela convenção do ADR-0002 §2.14: reaplicáveis, e
--   o reset os esvazia pela API do Storage (config/banco-dev.json).
-- * Caminho: <empresa>/<oferta>/<uuid>.<extensão>. Envia quem pode editar o
--   conteúdo da oferta no estado atual: membro no rascunho, org_admin na
--   publicada ou reservada (Q2). O staff não envia (Q3).
-- * Fotos: a empresa dona e o staff leem pela política de SELECT e geram a URL
--   temporária com a própria sessão. O comprador entra no Inc. 4.
-- * Documentos: nenhuma política de SELECT para authenticated, nem para o
--   dono. Quem baixa pede ao servidor, que confere a permissão, grava em
--   restricted_access_logs e só então gera a URL com a chave secreta.
-- * Ninguém sobrescreve nem apaga: não há política de UPDATE nem de DELETE.
-- * As linhas de offer_media e offer_documents passam a exigir o objeto no
--   bucket, no mesmo caminho e enviado pelo mesmo usuário.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('offer-photos', 'offer-photos', false, 10485760,
   array['image/jpeg', 'image/png', 'image/webp']),
  ('offer-documents', 'offer-documents', false, 10485760,
   array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Funções das políticas ------------------------------------------------------------

-- Conteúdo da oferta editável pelo usuário no estado atual: a mesma regra de
-- private.conferir_edicao, sem lançar erro.
create function private.pode_editar_oferta(p_oferta uuid)
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
        or (o.status in ('published', 'reserved')
            and private.membro_ativo(o.supplier_organization_id, array['org_admin']))));
$$;

-- Oferta do caminho <empresa>/<oferta>/<uuid>.<extensão>, quando o formato e a
-- empresa conferem; senão, nulo.
create function private.oferta_do_caminho(caminho text, extensoes text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select o.id
  from public.offers o
  where caminho ~ ('^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
                   || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
                   || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(' || extensoes || ')$')
    and o.id::text = split_part(caminho, '/', 2)
    and o.supplier_organization_id::text = split_part(caminho, '/', 1);
$$;

create function private.pode_enviar_arquivo_da_oferta(caminho text, extensoes text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.pode_editar_oferta(private.oferta_do_caminho(caminho, extensoes));
$$;

create function private.pode_ler_foto_da_oferta(caminho text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.offers o
    where o.id = private.oferta_do_caminho(caminho, 'jpg|jpeg|png|webp')
      and (private.membro_ativo(o.supplier_organization_id)
           or private.tem_papel_na_plataforma(array['admin', 'operator'])));
$$;

revoke all on function
  private.pode_editar_oferta(uuid),
  private.oferta_do_caminho(text, text),
  private.pode_enviar_arquivo_da_oferta(text, text),
  private.pode_ler_foto_da_oferta(text)
  from public, anon, authenticated, service_role;
grant execute on function
  private.pode_enviar_arquivo_da_oferta(text, text),
  private.pode_ler_foto_da_oferta(text)
  to authenticated;

-- Políticas em storage.objects (reaplicáveis) -----------------------------------------

drop policy if exists offer_photos_envio on storage.objects;
create policy offer_photos_envio on storage.objects
  for insert to authenticated
  with check (bucket_id = 'offer-photos' and private.pode_enviar_arquivo_da_oferta(name, 'jpg|jpeg|png|webp'));

drop policy if exists offer_photos_leitura on storage.objects;
create policy offer_photos_leitura on storage.objects
  for select to authenticated
  using (bucket_id = 'offer-photos' and private.pode_ler_foto_da_oferta(name));

drop policy if exists offer_documents_envio on storage.objects;
create policy offer_documents_envio on storage.objects
  for insert to authenticated
  with check (bucket_id = 'offer-documents' and private.pode_enviar_arquivo_da_oferta(name, 'pdf|jpg|jpeg|png|webp'));

-- Linhas de foto e documento exigem o objeto no bucket -------------------------------

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
    perform private.conferir_edicao(oferta.supplier_organization_id, oferta.status);
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
  perform private.conferir_edicao(oferta.supplier_organization_id, oferta.status);
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
  perform private.conferir_edicao(oferta.supplier_organization_id, oferta.status);
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
