-- ============================================================================
-- Migração 0020 — Referência externa (ponte manual pro sistema "Aniel")
-- ============================================================================
-- Hoje a atividade equivalente é registrada à parte, num app vizinho (o
-- "Aniel"), que ainda não tem integração via API com este sistema. Enquanto
-- isso não existe, esse campo guarda manualmente a referência daquela
-- atividade — texto livre, sem formato imposto, porque não se sabe ainda que
-- forma a referência do outro sistema vai ter quando a integração acontecer
-- de verdade. Nome da coluna é genérico de propósito (não "aniel"): no dia
-- da integração real, o significado pode mudar sem precisar de outra
-- migration só pra renomear.
-- ============================================================================

begin;

alter table public.ordens_manutencao
  add column if not exists referencia_externa text;

commit;
