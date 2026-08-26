-- ============================================================================
-- Migração 0015 — Corrige upload de foto "antes" na abertura da OS
-- ============================================================================
-- Regressão da 0014: ao endurecer as policies de storage de
-- `fotos-manutencao`/`videos-manutencao` pra escopo por dono da OS, ficou
-- faltando `o.responsavel_id = auth.uid()` — o mesmo ajuste que a migração
-- 0003 já tinha feito nas tabelas (ocorrencias/materiais/checklist/fotos/
-- videos/historico), mas que não foi replicado pro storage na 0014.
--
-- Efeito prático: no momento em que o Técnico LA cria uma OS, `tecnico_id`
-- ainda é nulo (só é preenchido quando o gestor/supervisor delega depois) —
-- só `responsavel_id` (quem abriu) está preenchido. A foto "antes" tentava
-- subir pro bucket logo após a criação da OS (handleCriarOrdem em
-- NovaOrdemManutencao.tsx) e era barrada pela policy de storage, mesmo a
-- linha em `fotos_manutencao` conseguindo ser gravada normalmente — por
-- isso o sintoma era só a foto falhando, não a OS inteira.
-- ============================================================================

begin;

drop policy if exists "fotos_manutencao_select" on storage.objects;
create policy "fotos_manutencao_select" on storage.objects
  for select using (
    bucket_id = 'fotos-manutencao'
    and exists (
      select 1 from public.ordens_manutencao o
      where o.id::text = (storage.foldername(name))[1]
        and (public.can_manage_orders() or o.tecnico_id = auth.uid() or o.responsavel_id = auth.uid())
    )
  );

drop policy if exists "fotos_manutencao_insert" on storage.objects;
create policy "fotos_manutencao_insert" on storage.objects
  for insert with check (
    bucket_id = 'fotos-manutencao'
    and exists (
      select 1 from public.ordens_manutencao o
      where o.id::text = (storage.foldername(name))[1]
        and (public.can_manage_orders() or o.tecnico_id = auth.uid() or o.responsavel_id = auth.uid())
    )
  );

drop policy if exists "fotos_manutencao_update" on storage.objects;
create policy "fotos_manutencao_update" on storage.objects
  for update using (
    bucket_id = 'fotos-manutencao'
    and exists (
      select 1 from public.ordens_manutencao o
      where o.id::text = (storage.foldername(name))[1]
        and (public.can_manage_orders() or o.tecnico_id = auth.uid() or o.responsavel_id = auth.uid())
    )
  );

drop policy if exists "fotos_manutencao_delete" on storage.objects;
create policy "fotos_manutencao_delete" on storage.objects
  for delete using (
    bucket_id = 'fotos-manutencao'
    and exists (
      select 1 from public.ordens_manutencao o
      where o.id::text = (storage.foldername(name))[1]
        and (public.can_manage_orders() or o.tecnico_id = auth.uid() or o.responsavel_id = auth.uid())
    )
  );

drop policy if exists "videos_manutencao_select" on storage.objects;
create policy "videos_manutencao_select" on storage.objects
  for select using (
    bucket_id = 'videos-manutencao'
    and exists (
      select 1 from public.ordens_manutencao o
      where o.id::text = (storage.foldername(name))[1]
        and (public.can_manage_orders() or o.tecnico_id = auth.uid() or o.responsavel_id = auth.uid())
    )
  );

drop policy if exists "videos_manutencao_insert" on storage.objects;
create policy "videos_manutencao_insert" on storage.objects
  for insert with check (
    bucket_id = 'videos-manutencao'
    and exists (
      select 1 from public.ordens_manutencao o
      where o.id::text = (storage.foldername(name))[1]
        and (public.can_manage_orders() or o.tecnico_id = auth.uid() or o.responsavel_id = auth.uid())
    )
  );

drop policy if exists "videos_manutencao_update" on storage.objects;
create policy "videos_manutencao_update" on storage.objects
  for update using (
    bucket_id = 'videos-manutencao'
    and exists (
      select 1 from public.ordens_manutencao o
      where o.id::text = (storage.foldername(name))[1]
        and (public.can_manage_orders() or o.tecnico_id = auth.uid() or o.responsavel_id = auth.uid())
    )
  );

drop policy if exists "videos_manutencao_delete" on storage.objects;
create policy "videos_manutencao_delete" on storage.objects
  for delete using (
    bucket_id = 'videos-manutencao'
    and exists (
      select 1 from public.ordens_manutencao o
      where o.id::text = (storage.foldername(name))[1]
        and (public.can_manage_orders() or o.tecnico_id = auth.uid() or o.responsavel_id = auth.uid())
    )
  );

commit;
