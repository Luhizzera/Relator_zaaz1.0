-- ============================================================================
-- Migração 0004 — Armazenar a versão exportada (PDF/Word) do relatório
-- ============================================================================
-- Até aqui, gerar um PDF/Word (ExportModal) só baixava o arquivo no navegador
-- e não deixava nenhum rastro na OS — o status continuava 'em_andamento' e
-- nada ficava salvo pra consulta depois. Esta migração adiciona:
--
--   * 3 colunas em `ordens_servico` pra guardar a ÚLTIMA versão gerada
--     (não um histórico — regenerar substitui a anterior, ver
--     `uploadRelatorioExportado` em supabaseClient.ts).
--   * Bucket privado `relatorios-exportados` com a mesma convenção de path
--     do bucket `fotos-relatorio` ({tecnico_id}/{ordem_id}.pdf|docx).
--
-- Quando o front chama `marcarRelatorioExportado` (OrdersContext), o status
-- da OS passa automaticamente para 'exportada' — é isso que faz a tela de
-- coleta de dados (Photos.tsx) dar lugar à visão somente-leitura do
-- relatório finalizado.
-- ============================================================================

begin;

alter table public.ordens_servico
  add column if not exists relatorio_storage_path text,
  add column if not exists relatorio_tipo text check (relatorio_tipo in ('pdf', 'docx')),
  add column if not exists relatorio_gerado_em timestamptz;

insert into storage.buckets (id, name, public)
values ('relatorios-exportados', 'relatorios-exportados', false)
on conflict (id) do nothing;

-- Mesma regra de acesso do bucket fotos-relatorio: dono do path (técnico) ou
-- quem pode gerenciar ordens (gestor/supervisor).
drop policy if exists "relatorios_exportados_select" on storage.objects;
create policy "relatorios_exportados_select" on storage.objects
  for select using (
    bucket_id = 'relatorios-exportados'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.can_manage_orders()
    )
  );

drop policy if exists "relatorios_exportados_insert" on storage.objects;
create policy "relatorios_exportados_insert" on storage.objects
  for insert with check (
    bucket_id = 'relatorios-exportados'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "relatorios_exportados_update" on storage.objects;
create policy "relatorios_exportados_update" on storage.objects
  for update using (
    bucket_id = 'relatorios-exportados'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "relatorios_exportados_delete" on storage.objects;
create policy "relatorios_exportados_delete" on storage.objects
  for delete using (
    bucket_id = 'relatorios-exportados'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.can_manage_orders()
    )
  );

commit;
