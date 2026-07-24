-- ============================================================================
-- Migração 0010 — Restringe novos cadastros a e-mails @zaaztelecom.com.br
-- ============================================================================
-- A validação de domínio já existe no cliente (Login.tsx/AuthContext.tsx),
-- mas isso é só UX — qualquer um pode chamar a API do Supabase Auth direto e
-- pular a tela de login. A regra de verdade tem que morar aqui: o gatilho
-- `handle_new_user` (criado na 0001, redefinido na 0006) roda DEPOIS do
-- insert em auth.users, mas ainda dentro da MESMA transação — uma exceção
-- aqui desfaz o cadastro inteiro (auth.users incluído), não só o profile.
-- ============================================================================

begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.email is null or lower(new.email) !~ '@zaaztelecom\.com\.br$' then
    raise exception 'Cadastro permitido apenas para e-mails @zaaztelecom.com.br'
      using errcode = '23514';
  end if;

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
