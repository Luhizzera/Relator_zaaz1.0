-- ============================================================================
-- Migração 0007 — Setor do usuário (auto-preenchido na abertura de OS)
-- ============================================================================
-- O campo "Setor" do wizard de abertura de OS de manutenção passa a ser
-- preenchido automaticamente com o setor de quem está abrindo (normalmente
-- o Técnico LA) — precisa de um lugar pra guardar isso no perfil.
-- ============================================================================

begin;

alter table public.profiles
  add column if not exists setor text;

commit;
