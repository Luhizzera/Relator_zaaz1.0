-- ============================================================================
-- Migração 0022 — Problemas estruturados na pendência de vistoria
-- ============================================================================
-- Até aqui a pendência guardava só `observacao` (texto livre), enquanto o
-- módulo de Manutenção já tinha uma taxonomia pronta: PROBLEMAS_CTO_GRUPOS
-- (14 problemas agrupados por família) e SOLUCAO_PROBLEMA_CTO, que traduz
-- cada problema na solução correspondente e vira item de checklist.
--
-- Consequência prática: a OS corretiva gerada a partir de uma pendência
-- nascia com o checklist genérico de 6 itens ('Caixa fechada', 'CTO
-- identificada', ...), sem relação com o defeito encontrado — e quem
-- administra o backlog tinha que reinterpretar o texto livre e preencher
-- tudo à mão.
--
-- Com esta coluna o técnico marca o problema em campo, no mesmo vocabulário
-- da manutenção, e `gerarOSCorretivaDaPendencia` repassa como
-- `problema_informado`. Daí `sincronizarOcorrenciasEChecklist` (já existente)
-- cria ocorrências reais e o checklist de solução sozinho, sem código novo.
--
-- Formato: mesma convenção de serialização por '||' usada em
-- `ordens_manutencao.problema_informado` (ver deserializeProblemas em
-- types/manutencao.ts) — não inventa formato novo pro mesmo dado.
--
-- Sem RLS nova: as policies de `pendencias_vistoria` (0018) são por linha,
-- não por coluna, e já cobrem quem pode inserir/ler.
-- ============================================================================

begin;

alter table public.pendencias_vistoria
  add column if not exists problemas text;

comment on column public.pendencias_vistoria.problemas is
  'Problemas marcados pelo técnico em campo, serializados por ''||'' — mesmo vocabulário de PROBLEMAS_CTO_GRUPOS. Vira problema_informado da OS corretiva.';

commit;
