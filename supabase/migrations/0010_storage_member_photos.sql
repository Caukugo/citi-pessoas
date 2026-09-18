-- ─────────────────────────────────────────────────────────────────────────────
-- 0010 — Bucket privado `member-photos`
--
-- Foto de membro é dado pessoal. O bucket é PRIVADO: não existe link público
-- permanente. A aplicação pede uma URL assinada, de validade curta, sempre que
-- precisa exibir — e quem não está autenticado como GG não consegue nem isso.
--
-- CONVENÇÃO DE CAMINHO:  <member_id>/<arquivo>
--   ex.: 'a3f1c0de-…/perfil.jpg'
-- A primeira pasta é o id do membro. É o que permite apagar tudo de uma pessoa
-- e o que a policy usa para validar o caminho.
--
-- ⚠️ ESTA MIGRATION PODE NÃO TER PERMISSÃO. `storage.buckets` e
-- `storage.objects` pertencem a `supabase_storage_admin`. Quando o papel que
-- aplica a migration não consegue escrever ali, o bloco avisa e segue — falhar
-- a migration inteira por causa do bucket deixaria o schema pela metade.
-- O passo manual equivalente está em docs/supabase-test-setup.md §8.
-- ─────────────────────────────────────────────────────────────────────────────

do $do$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'member-photos',
    'member-photos',
    false,
    5242880, -- 5 MB
    array['image/jpeg', 'image/png', 'image/webp']
  )
  on conflict (id) do update
     set public             = excluded.public,
         file_size_limit    = excluded.file_size_limit,
         allowed_mime_types = excluded.allowed_mime_types;

  raise notice 'Bucket member-photos criado/atualizado (privado, 5 MB, JPEG/PNG/WebP).';
exception
  when insufficient_privilege or undefined_table then
    raise warning
      'Sem permissão para criar o bucket member-photos por migration. Crie manualmente — ver docs/supabase-test-setup.md §8.';
end
$do$;

-- ─── Policies de acesso aos arquivos ─────────────────────────────────────────
-- Mesmo critério do resto da plataforma: `is_gg()`. Não existe leitura anônima.
-- Uma URL assinada continua funcionando para quem a recebeu, mas só a GG pode
-- gerá-la, porque gerar exige passar por estas policies.

do $do$
begin
  drop policy if exists "GG lê fotos de membros"      on storage.objects;
  drop policy if exists "GG envia fotos de membros"   on storage.objects;
  drop policy if exists "GG atualiza fotos de membros" on storage.objects;
  drop policy if exists "GG remove fotos de membros"  on storage.objects;

  create policy "GG lê fotos de membros" on storage.objects
    for select to authenticated
    using (bucket_id = 'member-photos' and public.is_gg());

  -- `(storage.foldername(name))[1]` é a primeira pasta do caminho. Exigir que
  -- ela seja um uuid é o que mantém a organização por membro — sem isso, em um
  -- mês o bucket vira uma pasta plana com 70 arquivos soltos.
  create policy "GG envia fotos de membros" on storage.objects
    for insert to authenticated
    with check (
      bucket_id = 'member-photos'
      and public.is_gg()
      and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    );

  create policy "GG atualiza fotos de membros" on storage.objects
    for update to authenticated
    using (bucket_id = 'member-photos' and public.is_gg())
    with check (bucket_id = 'member-photos' and public.is_gg());

  create policy "GG remove fotos de membros" on storage.objects
    for delete to authenticated
    using (bucket_id = 'member-photos' and public.is_gg());

  raise notice 'Policies do bucket member-photos aplicadas.';
exception
  when insufficient_privilege or undefined_table then
    raise warning
      'Sem permissão para criar policies em storage.objects. Aplique manualmente — ver docs/supabase-test-setup.md §8.';
end
$do$;
