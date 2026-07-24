-- ============================================================================
-- Migração 0009 — Setor automático por cargo + Equipes com supervisor dono
-- ============================================================================
-- 1) Setor deixa de ser texto livre — passa a ser derivado do cargo (ver
--    SETOR_POR_ROLE em src/lib/supabaseClient.ts). Normaliza quem já existe.
-- 2) `equipes` ganha um supervisor dono, e passa a ser gerenciável pela nova
--    tela "Minha Equipe". Precisa que supervisor consiga atualizar o
--    `equipe_id` de um técnico — a policy de update de `profiles` só
--    permitia o próprio usuário ou gestor; estendida pra can_manage_orders().
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Setor automático por cargo
-- ---------------------------------------------------------------------------

update public.profiles
set setor = case role
  when 'gestor' then 'Gestão'
  when 'supervisor' then 'Supervisão'
  when 'tecnico_la' then 'Localização e Ativação'
  when 'tecnico_manutencao' then 'Manutenção'
  else setor
end;

-- ---------------------------------------------------------------------------
-- 2. Equipes com supervisor dono
-- ---------------------------------------------------------------------------

alter table public.equipes
  add column if not exists supervisor_id uuid references public.profiles(id) on delete set null;

create index if not exists idx_equipes_supervisor on public.equipes(supervisor_id);

-- Supervisor precisa poder gravar `equipe_id` nos técnicos que adiciona à
-- própria equipe — a policy antiga só deixava o próprio usuário ou gestor
-- editar um profile. Simplificação deliberada (mesmo padrão de confiança já
-- usado em `equipes_write_gestor_supervisor`): isso tecnicamente permite
-- supervisor editar qualquer campo de qualquer perfil via API direta, não
-- só `equipe_id` — mas a única tela que exerce esse poder é "Minha Equipe";
-- a troca de CARGO continua restrita a gestor lá na UI (UserManagement.tsx).
drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin" on public.profiles
  for update using (id = auth.uid() or public.can_manage_orders());

commit;
