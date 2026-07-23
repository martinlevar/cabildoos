-- ================================================================
--  CabildoOS — Políticas adicionales para flujo anónimo
--  Ejecutar en Supabase → SQL Editor → New query → Run
-- ================================================================

-- Permitir que usuarios anónimos inserten su identity hash
create policy "anon_insert_identity" on identities
  for insert with check (true);

-- Permitir que usuarios anónimos inserten solicitudes de verificación
create policy "anon_update_request_status" on verification_requests
  for update using (true);

-- Permitir uploads anónimos al bucket de imágenes anonimizadas
insert into storage.buckets (id, name, public)
values ('anon-verification', 'anon-verification', false)
on conflict (id) do nothing;

create policy "anon_upload_anon_images"
  on storage.objects for insert
  to anon
  with check (bucket_id = 'anon-verification');

create policy "validator_read_anon_images"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'anon-verification');
