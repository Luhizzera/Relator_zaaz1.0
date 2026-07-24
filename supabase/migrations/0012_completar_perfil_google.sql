-- ============================================================================
-- Migração 0012 — Nome pendente para cadastros via Google sem nome disponível
-- ============================================================================
-- Login com Google não passa por um formulário nosso, então não tem como
-- coletar "nome" do jeito que o cadastro por e-mail/senha faz. O Google
-- normalmente devolve `full_name`/`name` no metadata da conta OAuth — o
-- gatilho passa a tentar essas chaves antes de cair no prefixo do e-mail.
-- Quando nem isso existe, marca `nome_definido = false`: a UI usa essa flag
-- pra levar o usuário a uma telinha de "complete seu perfil" no primeiro
-- acesso, em vez de deixar um nome tipo "joao.silva123" sem chance de troca.
-- ============================================================================

begin;

alter table public.profiles
  add column if not exists nome_definido boolean not null default true;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_nome text;
  v_definido boolean;
begin
  if new.email is null or lower(new.email) !~ '@(zaaztelecom\.com\.br|gmail\.com)$' then
    raise exception 'Cadastro permitido apenas para e-mails @zaaztelecom.com.br ou @gmail.com'
      using errcode = '23514';
  end if;

  v_nome := nullif(trim(coalesce(
    new.raw_user_meta_data->>'nome',
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name'
  )), '');
  v_definido := v_nome is not null;
  if not v_definido then
    v_nome := split_part(new.email, '@', 1);
  end if;

  insert into public.profiles (id, nome, email, role, nome_definido)
  values (new.id, v_nome, new.email, 'tecnico_manutencao', v_definido);
  return new;
end;
$$;

-- Backfill: perfis já criados antes desta migração (ex.: login Google feito
-- hoje mesmo, sem `full_name`/`name` no metadata) ficaram com nome = prefixo
-- do e-mail e nenhum jeito de saber disso depois. Marca como pendente quem
-- bate nesse padrão exato, pra cair na tela de completar perfil no próximo
-- login.
update public.profiles p
set nome_definido = false
from auth.users u
where u.id = p.id
  and p.nome = split_part(u.email, '@', 1)
  and coalesce(nullif(trim(coalesce(
        u.raw_user_meta_data->>'nome',
        u.raw_user_meta_data->>'full_name',
        u.raw_user_meta_data->>'name'
      )), ''), '') = '';

commit;
