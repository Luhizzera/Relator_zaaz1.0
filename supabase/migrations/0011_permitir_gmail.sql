-- ============================================================================
-- Migração 0011 — Passa a permitir também cadastro/login com @gmail.com
-- ============================================================================
-- A 0010 restringiu cadastro só a @zaaztelecom.com.br. Decisão revista: com
-- login Google habilitado, faz sentido aceitar também contas @gmail.com
-- pessoais (nem toda conta Google logada é do Workspace da empresa). Mantém
-- o mesmo mecanismo (gatilho em auth.users, dentro da mesma transação do
-- insert — uma exceção aqui desfaz o cadastro inteiro), só troca o domínio
-- aceito de um único valor pra uma lista.
-- ============================================================================

begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.email is null or lower(new.email) !~ '@(zaaztelecom\.com\.br|gmail\.com)$' then
    raise exception 'Cadastro permitido apenas para e-mails @zaaztelecom.com.br ou @gmail.com'
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
