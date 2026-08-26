-- ============================================================================
-- Migração 0016 — Categoria de foto passa a ser só "antes" e "depois"
-- ============================================================================
-- "Durante" deixa de existir como categoria — as fotos tiradas pelo técnico
-- de manutenção em campo (que antes entravam como "durante") agora entram
-- como "depois". Backfill primeiro (linhas existentes), constraint e default
-- depois — mesma ordem já usada na 0013, pra não quebrar em cima de dado
-- histórico com o valor antigo.
-- ============================================================================

begin;

update public.fotos_manutencao set categoria = 'depois' where categoria = 'durante';

alter table public.fotos_manutencao drop constraint if exists fotos_manutencao_categoria_check;
alter table public.fotos_manutencao
  add constraint fotos_manutencao_categoria_check check (categoria in ('antes', 'depois'));

alter table public.fotos_manutencao alter column categoria set default 'depois';

commit;
