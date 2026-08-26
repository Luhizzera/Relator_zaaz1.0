-- ============================================================================
-- Migração 0013 — Finalizar OS não depende mais de aprovação manual
-- ============================================================================
-- Antes: técnico terminava a execução e a OS ia pra 'aguardando_aprovacao',
-- travada até o gestor clicar em "Aprovar" (ou devolver com "Retrabalho").
-- Na prática a UI já rotulava esse status como "Finalizada" pro técnico (ver
-- STATUS_LABEL em types/manutencao.ts) — só o gestor via a fila de aprovação
-- por trás. Essa migração formaliza isso: 'aguardando_aprovacao' vira
-- 'finalizada' de verdade (não precisa mais de nenhum clique pra "liberar"),
-- e o supervisor passa a poder reabrir uma OS finalizada quando precisar de
-- retrabalho — antes só gestor tinha essa permissão no banco (o trigger de
-- guarda checava só `= 'gestor'`, embora o comentário já dissesse
-- "gestor/supervisor").
-- ============================================================================

begin;

-- Nenhuma OS nova nasce com 'aguardando_aprovacao' desde a rewrite do app,
-- mas qualquer linha antiga que ainda esteja nesse status vira 'finalizada'
-- (mesmo significado, só o nome interno mudou).
update public.ordens_manutencao set status = 'finalizada' where status = 'aguardando_aprovacao';

alter table public.ordens_manutencao drop constraint if exists ordens_manutencao_status_check;
alter table public.ordens_manutencao add constraint ordens_manutencao_status_check
  check (status in (
    'aberta', 'atribuida', 'recebida', 'deslocamento', 'no_local', 'em_execucao',
    'pausada', 'finalizada', 'aprovada', 'reaberta', 'cancelada', 'concluida'
  ));

-- Supervisor também pode reabrir/cancelar uma OS (não só gestor) — é quem, na
-- prática, revisa as OS finalizadas do dia a dia. "Aprovada" continua restrita
-- por completude (fluxo antigo, não é mais alcançado por nenhuma tela).
create or replace function public.tg_ordens_manutencao_guard()
returns trigger
language plpgsql
as $$
begin
  if not public.can_manage_orders() then
    if new.tecnico_id is distinct from old.tecnico_id
       or new.equipe_id is distinct from old.equipe_id then
      raise exception 'Somente gestor ou supervisor pode alterar a atribuição da OS';
    end if;
  end if;

  if not public.can_manage_orders()
     and new.status is distinct from old.status
     and new.status in ('aprovada', 'cancelada', 'reaberta') then
    raise exception 'Somente gestor ou supervisor pode aprovar, cancelar ou reabrir uma OS';
  end if;

  return new;
end;
$$;

commit;
