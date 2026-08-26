-- ============================================================================
-- Migração 0019 — Equipes de Técnico LA (supervisor também administra LA)
-- ============================================================================
-- Até aqui, `equipes` só existia pra Técnico de Manutenção (delegação de OS).
-- Agora o mesmo mecanismo passa a valer pra Técnico LA — não como um cargo
-- novo, mas como mais um `tipo` de equipe que um supervisor (o mesmo papel
-- 'supervisor' de sempre) pode administrar. A tela "Minha Equipe" ganha um
-- toggle LA/Manutenção pra alternar entre as duas (ver MinhaEquipe.tsx) —
-- aqui só entra a coluna que sustenta essa distinção.
-- ============================================================================

begin;

-- Equipes já existentes eram, por definição, todas de Manutenção (só esse
-- tipo era possível até agora) — o default abaixo já as classifica assim
-- automaticamente ao adicionar a coluna, sem precisar de um update separado.
alter table public.equipes
  add column if not exists tipo text not null default 'manutencao'
    check (tipo in ('la', 'manutencao'));

commit;
