-- ============================================================================
-- Migração 0006 — Divide o papel técnico em Técnico LA e Técnico de Manutenção
-- ============================================================================
-- Fluxo real: o Técnico LA identifica o problema em campo e abre a OS; o
-- Técnico de Manutenção (rede) é quem recebe a delegação e executa o reparo.
-- Antes disso, `profiles.role` tinha um único valor genérico 'tecnico' — essa
-- migração o substitui por dois valores específicos.
--
-- RLS não muda: `can_manage_orders()`/`is_admin()` (0001) não referenciam
-- 'tecnico' — o escopo do técnico já é por `tecnico_id = auth.uid()`, não
-- pelo valor do papel. Só o app-level (DelegarTecnicoModal) passa a filtrar
-- por 'tecnico_manutencao'.
-- ============================================================================

begin;

alter table public.profiles
  drop constraint if exists profiles_role_check;

-- Linhas existentes com o papel genérico antigo migram para
-- 'tecnico_manutencao' (o mais próximo do comportamento anterior — quem
-- executa). Reclassifique manualmente quem for Técnico LA depois, na tela
-- de Usuários.
update public.profiles set role = 'tecnico_manutencao' where role = 'tecnico';

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('gestor', 'supervisor', 'tecnico_la', 'tecnico_manutencao'));

alter table public.profiles
  alter column role set default 'tecnico_manutencao';

-- Novo cadastro (handle_new_user, ver 0001) também precisa nascer com um
-- valor válido pela nova constraint.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, nome, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    new.email,
    'tecnico_manutencao'
  );
  return new;
end;
$$;

commit;
