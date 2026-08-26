-- ============================================================================
-- Migração 0017 — Criação de equipes restrita a Gestão
-- ============================================================================
-- A policy "equipes_write_gestor_supervisor" (0001) cobria insert/update/
-- delete com can_manage_orders() (gestor OU supervisor). Passa a existir uma
-- policy dedicada de insert usando is_admin() (só gestor) — update/delete
-- continuam com can_manage_orders(), já que a única ação que os usa hoje
-- (trocar o supervisor dono de uma equipe, em MinhaEquipe.tsx) já é
-- gestor-only na UI.
-- ============================================================================

begin;

drop policy if exists "equipes_write_gestor_supervisor" on public.equipes;

create policy "equipes_insert_gestor" on public.equipes
  for insert with check (public.is_admin());

create policy "equipes_update_gestor_supervisor" on public.equipes
  for update using (public.can_manage_orders())
  with check (public.can_manage_orders());

create policy "equipes_delete_gestor_supervisor" on public.equipes
  for delete using (public.can_manage_orders());

commit;
