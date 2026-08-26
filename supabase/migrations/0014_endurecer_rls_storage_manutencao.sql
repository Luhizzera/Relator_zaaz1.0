-- ============================================================================
-- Migração 0014 — Endurecer RLS: storage de manutenção + escalonamento de cargo
-- ============================================================================
-- Auditoria de exposição pública encontrou dois pontos que NÃO são visíveis
-- para a internet anônima (a chave anon + RLS já bloqueiam isso — testado ao
-- vivo), mas permitiam mais do que deveriam para QUALQUER usuário autenticado
-- da própria empresa:
--
-- 1) Buckets `fotos-manutencao` e `videos-manutencao`: a policy de storage
--    só checava `auth.role() = 'authenticated'`, sem checar o dono da OS —
--    diferente do bucket `fotos-relatorio`, que já filtra por
--    (storage.foldername(name))[1] = auth.uid() ou can_manage_orders(). O
--    comentário original dizia "mesmo nível de acesso do bucket
--    fotos-relatorio", mas a policy implementada não seguia essa regra.
--    Resultado: qualquer técnico autenticado conseguia listar/baixar/apagar
--    fotos e vídeos de QUALQUER OS de manutenção, não só das suas.
--    Path das duas buckets é `{ordem_id}/{arquivo_id}.ext` (ver
--    uploadFotoManutencao/uploadVideoManutencao em supabaseClient.ts), então
--    a correção usa o mesmo padrão de escopo já aplicado às tabelas filhas
--    (ocorrencias_manutencao, materiais_manutencao etc. na migração 0001).
--
-- 2) `profiles_update_self_or_admin` (migração 0009) permite que qualquer
--    supervisor atualize qualquer coluna de qualquer perfil via API direta
--    (necessário pra gravar `equipe_id` de um técnico ao montar equipe) — mas
--    isso também deixa `role` aberto: um supervisor poderia se autopromover a
--    gestor com um PATCH direto na REST API, contornando a restrição que só
--    existe na UI (UserManagement.tsx). Corrigido com um trigger que bloqueia
--    troca de `role`/`ativo` por quem não é gestor, preservando a escrita de
--    `equipe_id` que a 0009 precisava liberar.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Storage: fotos-manutencao e videos-manutencao passam a seguir a OS dona
-- ---------------------------------------------------------------------------

drop policy if exists "fotos_manutencao_rw" on storage.objects;
drop policy if exists "videos_manutencao_rw" on storage.objects;

drop policy if exists "fotos_manutencao_select" on storage.objects;
create policy "fotos_manutencao_select" on storage.objects
  for select using (
    bucket_id = 'fotos-manutencao'
    and exists (
      select 1 from public.ordens_manutencao o
      where o.id::text = (storage.foldername(name))[1]
        and (public.can_manage_orders() or o.tecnico_id = auth.uid())
    )
  );

drop policy if exists "fotos_manutencao_insert" on storage.objects;
create policy "fotos_manutencao_insert" on storage.objects
  for insert with check (
    bucket_id = 'fotos-manutencao'
    and exists (
      select 1 from public.ordens_manutencao o
      where o.id::text = (storage.foldername(name))[1]
        and (public.can_manage_orders() or o.tecnico_id = auth.uid())
    )
  );

drop policy if exists "fotos_manutencao_update" on storage.objects;
create policy "fotos_manutencao_update" on storage.objects
  for update using (
    bucket_id = 'fotos-manutencao'
    and exists (
      select 1 from public.ordens_manutencao o
      where o.id::text = (storage.foldername(name))[1]
        and (public.can_manage_orders() or o.tecnico_id = auth.uid())
    )
  );

drop policy if exists "fotos_manutencao_delete" on storage.objects;
create policy "fotos_manutencao_delete" on storage.objects
  for delete using (
    bucket_id = 'fotos-manutencao'
    and exists (
      select 1 from public.ordens_manutencao o
      where o.id::text = (storage.foldername(name))[1]
        and (public.can_manage_orders() or o.tecnico_id = auth.uid())
    )
  );

drop policy if exists "videos_manutencao_select" on storage.objects;
create policy "videos_manutencao_select" on storage.objects
  for select using (
    bucket_id = 'videos-manutencao'
    and exists (
      select 1 from public.ordens_manutencao o
      where o.id::text = (storage.foldername(name))[1]
        and (public.can_manage_orders() or o.tecnico_id = auth.uid())
    )
  );

drop policy if exists "videos_manutencao_insert" on storage.objects;
create policy "videos_manutencao_insert" on storage.objects
  for insert with check (
    bucket_id = 'videos-manutencao'
    and exists (
      select 1 from public.ordens_manutencao o
      where o.id::text = (storage.foldername(name))[1]
        and (public.can_manage_orders() or o.tecnico_id = auth.uid())
    )
  );

drop policy if exists "videos_manutencao_update" on storage.objects;
create policy "videos_manutencao_update" on storage.objects
  for update using (
    bucket_id = 'videos-manutencao'
    and exists (
      select 1 from public.ordens_manutencao o
      where o.id::text = (storage.foldername(name))[1]
        and (public.can_manage_orders() or o.tecnico_id = auth.uid())
    )
  );

drop policy if exists "videos_manutencao_delete" on storage.objects;
create policy "videos_manutencao_delete" on storage.objects
  for delete using (
    bucket_id = 'videos-manutencao'
    and exists (
      select 1 from public.ordens_manutencao o
      where o.id::text = (storage.foldername(name))[1]
        and (public.can_manage_orders() or o.tecnico_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 2. profiles: troca de cargo/ativação continua só de gestor, mesmo via API
-- ---------------------------------------------------------------------------

create or replace function public.tg_profiles_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    if new.role is distinct from old.role then
      raise exception 'Somente gestor pode alterar o cargo de um usuário';
    end if;
    if new.ativo is distinct from old.ativo then
      raise exception 'Somente gestor pode ativar ou desativar um usuário';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_guard on public.profiles;
create trigger trg_profiles_guard
  before update on public.profiles
  for each row execute function public.tg_profiles_guard();

commit;
