-- ============================================================================
-- Migração 0003 — Tabelas filhas também reconhecem quem abriu a OS
-- ============================================================================
-- A 0002 liberou o técnico para abrir uma OS (responsavel_id = auth.uid()),
-- mas as tabelas filhas (ocorrencias/materiais/checklist/fotos/videos/
-- historico) ainda só reconheciam `can_manage_orders()` ou `tecnico_id =
-- auth.uid()` — e no momento da criação `tecnico_id` está nulo, então a
-- própria criação da OS falhava logo depois de inserir a linha principal
-- (o `createManutencaoOrder` grava o checklist padrão e o evento de
-- histórico "OS criada" em seguida, e essas duas gravações eram barradas
-- pelo RLS). Corrigido aqui: as policies passam a considerar também
-- `o.responsavel_id = auth.uid()`.
-- ============================================================================

begin;

do $$
declare
  t text;
begin
  foreach t in array array[
    'ocorrencias_manutencao', 'materiais_manutencao', 'checklist_itens_manutencao',
    'fotos_manutencao', 'videos_manutencao', 'historico_manutencao'
  ]
  loop
    execute format('drop policy if exists "%s_scope" on public.%I', t, t);
    execute format($f$
      create policy "%s_scope" on public.%I
        for all using (
          exists (
            select 1 from public.ordens_manutencao o
            where o.id = ordem_id
              and (
                public.can_manage_orders()
                or o.tecnico_id = auth.uid()
                or o.responsavel_id = auth.uid()
              )
          )
        )
        with check (
          exists (
            select 1 from public.ordens_manutencao o
            where o.id = ordem_id
              and (
                public.can_manage_orders()
                or o.tecnico_id = auth.uid()
                or o.responsavel_id = auth.uid()
              )
          )
        )
    $f$, t, t);
  end loop;
end $$;

commit;
