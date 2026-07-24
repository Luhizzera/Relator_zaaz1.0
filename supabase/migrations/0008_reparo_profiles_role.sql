-- ============================================================================
-- Migração 0008 — Reparo defensivo da constraint de profiles.role
-- ============================================================================
-- Erro relatado: "check constraint profiles_role_check is violated by some
-- row" ao rodar uma migração que reforça essa regra. Isso só acontece se
-- existe alguma linha em profiles com um valor de role fora do esperado —
-- por exemplo um NULL, uma string vazia, ou um valor de uma versão anterior
-- do schema que nunca foi migrado (ex: algo diferente de 'admin'/'tecnico'
-- criado manualmente). Em vez de tentar adivinhar a causa exata, este
-- arquivo primeiro NORMALIZA qualquer linha fora do padrão atual, e só
-- depois reforça a constraint — funciona não importa o que sobrou.
-- ============================================================================

begin;

alter table public.profiles
  drop constraint if exists profiles_role_check;

-- Qualquer linha que não seja um dos 4 papéis válidos hoje vira
-- 'tecnico_manutencao' (o papel mais "neutro" — dá pra reclassificar depois
-- em Usuários). Cobre NULL, string vazia, ou qualquer resquício antigo.
update public.profiles
set role = 'tecnico_manutencao'
where role is null
   or role not in ('gestor', 'supervisor', 'tecnico_la', 'tecnico_manutencao');

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('gestor', 'supervisor', 'tecnico_la', 'tecnico_manutencao'));

alter table public.profiles
  alter column role set default 'tecnico_manutencao';

commit;
