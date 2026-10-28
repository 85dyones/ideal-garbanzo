-- I1.3: bucket privado da evidência da adesão (ADR-0002 §2.5 e §2.14).
--
-- * Reaplicável: o reset não recria o schema storage. O bucket é atualizado
--   se já existir, e cada política é removida antes de ser criada. A limpeza
--   do reset remove em cascata as políticas que dependem do schema private e
--   esvazia o bucket pela API do Storage antes de limpar o banco.
-- * Caminho do arquivo: <id do pedido>/<nome>. Só administrador da plataforma
--   envia, com o pedido aberto e sem ser o requerente, e só administrador lê.
--   Ninguém altera nem apaga: não há política de UPDATE nem de DELETE.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('membership-evidence', 'membership-evidence', false, 10485760,
        array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create function private.pode_enviar_evidencia(caminho text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when caminho ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]{1,200}$' then
      private.tem_papel_na_plataforma(array['admin'])
      and exists (
        select 1 from public.membership_applications a
        where a.id = split_part(caminho, '/', 1)::uuid
          and a.status in ('submitted', 'under_review')
          and a.applicant_profile_id <> (select auth.uid()))
    else false
  end;
$$;

revoke all on function private.pode_enviar_evidencia(text) from public, anon, authenticated, service_role;
grant execute on function private.pode_enviar_evidencia(text) to authenticated;

drop policy if exists membership_evidence_envio on storage.objects;
create policy membership_evidence_envio on storage.objects
  for insert to authenticated
  with check (bucket_id = 'membership-evidence' and private.pode_enviar_evidencia(name));

drop policy if exists membership_evidence_leitura on storage.objects;
create policy membership_evidence_leitura on storage.objects
  for select to authenticated
  using (bucket_id = 'membership-evidence' and (select private.tem_papel_na_plataforma(array['admin'])));
