-- ============================================================================
-- Migração 0002 — Técnico de campo também pode abrir uma OS de manutenção
-- ============================================================================
-- Ajuste de fluxo: o técnico de campo identifica um problema e abre a OS;
-- o supervisor (ou gestor) é quem encaminha/distribui pra execução depois.
-- A 0001 tinha restringido a criação a gestor/supervisor — corrigido aqui.
--
-- `manutencaoService.createManutencaoOrder` sempre grava `responsavel_id`
-- como o uuid de quem está autenticado no momento da criação (nunca um valor
-- arbitrário vindo do cliente), então usar `responsavel_id = auth.uid()` no
-- `insert` é seguro: ninguém consegue criar uma OS "em nome" de outra pessoa.
--
-- Atribuição de equipe/técnico e aprovação continuam só de gestor/supervisor
-- — isso é garantido pelo trigger `tg_ordens_manutencao_guard` (criado na
-- 0001) e não muda aqui.
-- ============================================================================

begin;

drop policy if exists "ordens_manutencao_insert" on public.ordens_manutencao;
create policy "ordens_manutencao_insert" on public.ordens_manutencao
  for insert with check (
    responsavel_id = auth.uid()
  );

-- Técnico agora também enxerga (e pode acompanhar) as OS que ele mesmo abriu,
-- mesmo antes de qualquer atribuição (tecnico_id ainda nulo nesse momento).
drop policy if exists "ordens_manutencao_select" on public.ordens_manutencao;
create policy "ordens_manutencao_select" on public.ordens_manutencao
  for select using (
    public.can_manage_orders()
    or tecnico_id = auth.uid()
    or responsavel_id = auth.uid()
  );

drop policy if exists "ordens_manutencao_update" on public.ordens_manutencao;
create policy "ordens_manutencao_update" on public.ordens_manutencao
  for update using (
    public.can_manage_orders()
    or tecnico_id = auth.uid()
    or responsavel_id = auth.uid()
  );

commit;
