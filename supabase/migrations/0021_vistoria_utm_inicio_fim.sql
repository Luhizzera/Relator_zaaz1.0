-- ============================================================================
-- Migração 0021 — UTM Início/Fim na rota de vistoria
-- ============================================================================
-- A rota tem um trajeto (não um ponto único como as OS de manutenção), então
-- em vez de latitude/longitude soltas, a abertura passa a guardar os dois
-- extremos do trajeto — escolhidos no mapa (mesmo LocationMapPicker.tsx já
-- usado em NovaOrdemManutencao), pra dar ao técnico uma referência visual
-- objetiva de onde começar e onde terminar. Sem RLS nova: a policy de update
-- de ordens_vistoria (0018) já cobre supervisor/gestor/técnico dono.
-- ============================================================================

begin;

alter table public.ordens_vistoria
  add column if not exists utm_inicio_lat double precision,
  add column if not exists utm_inicio_lng double precision,
  add column if not exists utm_fim_lat double precision,
  add column if not exists utm_fim_lng double precision;

commit;
