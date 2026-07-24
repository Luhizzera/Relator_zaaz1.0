-- ============================================================================
-- Migração 0005 — Habilita Realtime nas tabelas dos dois domínios
-- ============================================================================
-- Sem isso, `supabase.channel(...).on('postgres_changes', ...)` no cliente
-- nunca recebe nenhum evento — a tabela precisa estar na publicação
-- `supabase_realtime` do Postgres. Escrito de forma idempotente porque
-- `alter publication ... add table` dá erro se a tabela já estiver lá.
-- ============================================================================

begin;

do $$
declare
  t text;
begin
  foreach t in array array[
    -- Domínio Manutenção
    'ordens_manutencao', 'ocorrencias_manutencao', 'materiais_manutencao',
    'checklist_itens_manutencao', 'historico_manutencao', 'fotos_manutencao',
    'videos_manutencao',
    -- Domínio Relatório Fotográfico
    'ordens_servico', 'fotos'
  ]
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then
        null; -- já estava na publicação, segue o jogo
      when undefined_table then
        raise notice 'Tabela public.% não existe — pulando.', t;
    end;
  end loop;
end $$;

commit;
