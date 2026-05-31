-- Cria o bucket de fotos de avaliação como público
insert into storage.buckets (id, name, public)
values ('assessment-photos', 'assessment-photos', true)
on conflict (id) do update set public = true;

-- Cria o bucket de mídia do chat
insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', true)
on conflict (id) do update set public = true;

-- Política: aluno pode fazer upload das próprias fotos de avaliação
create policy "assessment_photos: upload pelo aluno"
  on storage.objects for insert
  with check (
    bucket_id = 'assessment-photos'
    and auth.role() = 'authenticated'
  );

-- Política: leitura pública das fotos de avaliação
create policy "assessment_photos: leitura pública"
  on storage.objects for select
  using (bucket_id = 'assessment-photos');

-- Política: upload de mídia do chat
create policy "chat_media: upload autenticado"
  on storage.objects for insert
  with check (
    bucket_id = 'chat-media'
    and auth.role() = 'authenticated'
  );

-- Política: leitura pública de mídia do chat
create policy "chat_media: leitura pública"
  on storage.objects for select
  using (bucket_id = 'chat-media');
