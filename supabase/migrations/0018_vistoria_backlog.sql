-- ============================================================================
-- Migração 0018 — Módulo de Vistoria (rota + pendências + backlog no mapa)
-- ============================================================================
-- Novo módulo, anexo ao de Manutenção, decidido em 5 pontos (registrados na
-- conversa que originou esta migração):
--
--   1 (C) — "Vistoria" é uma entidade PRÓPRIA (ordens_vistoria), leve, com
--       seu próprio ciclo de vida de rota. Cada pendência registrada durante
--       a rota (pendencias_vistoria) pode gerar uma OS corretiva, e essa OS
--       corretiva É uma linha comum de `ordens_manutencao` (tipo 'Preventiva
--       CTO' / 'Preventiva Rede', já adicionadas ao array TIPOS da UI) —
--       assim a corretiva reaproveita 100% do que já existe (delegação,
--       execução mobile, PDF, encerramento).
--   2 (B) — gerar a corretiva a partir da pendência é uma ação confirmada
--       (modal), não automática — não muda nada aqui no banco, é decisão de
--       UI (ver vistoriaService.ts).
--   3 (A) — a cor do pino no mapa é CALCULADA na leitura (join pendência →
--       ordem corretiva → status), não guardada — por isso não existe coluna
--       de "status/cor" em pendencias_vistoria, só a FK nullable
--       `ordem_corretiva_id`. Vermelho = nula; laranja = preenchida e a OS
--       ainda não está finalizada/aprovada/concluída; verde = preenchida e
--       finalizada/aprovada/concluída.
--   4 (A) — mapa continua em react-leaflet/OpenStreetMap (sem mudança de
--       banco).
--   5 (B) — isolamento REAL por supervisor, diferente do padrão
--       `can_manage_orders()` usado no resto do módulo de Manutenção (onde
--       qualquer supervisor vê qualquer OS). Aqui, supervisor só enxerga
--       rotas/pendências de equipes que ele mesmo administra
--       (equipes.supervisor_id = auth.uid()); gestor continua vendo tudo.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Ordens de vistoria (a rota)
-- ----------------------------------------------------------------------------

create sequence if not exists public.ordens_vistoria_numero_seq start 1;

create table if not exists public.ordens_vistoria (
  id uuid primary key default gen_random_uuid(),
  numero text unique,

  titulo text not null default '',
  status text not null default 'aberta'
    check (status in ('aberta', 'em_andamento', 'concluida', 'cancelada')),

  equipe_id uuid references public.equipes(id) on delete set null,
  tecnico_id uuid references public.profiles(id) on delete set null,
  -- Quem criou a rota (supervisor ou gestor) — auditoria, igual ao
  -- responsavel_id de ordens_manutencao.
  responsavel_id uuid references public.profiles(id) on delete set null,

  data_prevista date,
  observacoes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.tg_gerar_numero_vst()
returns trigger
language plpgsql
as $$
begin
  if new.numero is null then
    new.numero := 'VST-' || to_char(now(), 'YYYY') || '-'
      || lpad(nextval('public.ordens_vistoria_numero_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ordens_vistoria_numero on public.ordens_vistoria;
create trigger trg_ordens_vistoria_numero
  before insert on public.ordens_vistoria
  for each row execute function public.tg_gerar_numero_vst();

drop trigger if exists trg_ordens_vistoria_updated_at on public.ordens_vistoria;
create trigger trg_ordens_vistoria_updated_at
  before update on public.ordens_vistoria
  for each row execute function public.tg_set_updated_at();

alter table public.ordens_vistoria enable row level security;

-- Escopo real por supervisor (Decisão 5-B) — só quem administra a equipe
-- (ou o próprio técnico da rota, ou o gestor) enxerga/edita.
drop policy if exists "ordens_vistoria_select" on public.ordens_vistoria;
create policy "ordens_vistoria_select" on public.ordens_vistoria
  for select using (
    public.is_admin()
    or tecnico_id = auth.uid()
    or responsavel_id = auth.uid()
    or exists (
      select 1 from public.equipes e
      where e.id = ordens_vistoria.equipe_id and e.supervisor_id = auth.uid()
    )
  );

-- Criação: só quem administra a equipe de destino, ou gestor. (Um supervisor
-- não pode criar uma rota pra uma equipe que não é dele.)
drop policy if exists "ordens_vistoria_insert" on public.ordens_vistoria;
create policy "ordens_vistoria_insert" on public.ordens_vistoria
  for insert with check (
    public.is_admin()
    or (
      responsavel_id = auth.uid()
      and (
        equipe_id is null
        or exists (
          select 1 from public.equipes e
          where e.id = ordens_vistoria.equipe_id and e.supervisor_id = auth.uid()
        )
      )
    )
  );

drop policy if exists "ordens_vistoria_update" on public.ordens_vistoria;
create policy "ordens_vistoria_update" on public.ordens_vistoria
  for update using (
    public.is_admin()
    or tecnico_id = auth.uid()
    or exists (
      select 1 from public.equipes e
      where e.id = ordens_vistoria.equipe_id and e.supervisor_id = auth.uid()
    )
  );

drop policy if exists "ordens_vistoria_delete" on public.ordens_vistoria;
create policy "ordens_vistoria_delete" on public.ordens_vistoria
  for delete using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 2. Pendências registradas durante a rota
-- ----------------------------------------------------------------------------

create table if not exists public.pendencias_vistoria (
  id uuid primary key default gen_random_uuid(),
  ordem_vistoria_id uuid not null references public.ordens_vistoria(id) on delete cascade,

  storage_path text not null,
  latitude double precision not null,
  longitude double precision not null,
  observacao text,

  -- Nula = pino vermelho (sem OS corretiva ainda). Preenchida = laranja/verde
  -- dependendo do status dessa ordens_manutencao (calculado na leitura, ver
  -- vistoriaService.ts — não há coluna de cor/status aqui de propósito).
  ordem_corretiva_id uuid references public.ordens_manutencao(id) on delete set null,

  criado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_pendencias_vistoria_ordem on public.pendencias_vistoria(ordem_vistoria_id);
create index if not exists idx_pendencias_vistoria_corretiva on public.pendencias_vistoria(ordem_corretiva_id);

alter table public.pendencias_vistoria enable row level security;

-- Mesmo escopo da ordens_vistoria dona, sempre via join (não duplica a regra
-- de equipe aqui — pendência não tem equipe própria).
drop policy if exists "pendencias_vistoria_select" on public.pendencias_vistoria;
create policy "pendencias_vistoria_select" on public.pendencias_vistoria
  for select using (
    exists (
      select 1 from public.ordens_vistoria v
      where v.id = pendencias_vistoria.ordem_vistoria_id
        and (
          public.is_admin()
          or v.tecnico_id = auth.uid()
          or v.responsavel_id = auth.uid()
          or exists (
            select 1 from public.equipes e
            where e.id = v.equipe_id and e.supervisor_id = auth.uid()
          )
        )
    )
  );

-- Só o técnico da rota registra pendência em campo (ou o gestor, em
-- correções administrativas). Supervisor não registra pendência — ele só
-- gera a corretiva a partir do que o técnico já registrou (política de
-- update, abaixo).
drop policy if exists "pendencias_vistoria_insert" on public.pendencias_vistoria;
create policy "pendencias_vistoria_insert" on public.pendencias_vistoria
  for insert with check (
    exists (
      select 1 from public.ordens_vistoria v
      where v.id = pendencias_vistoria.ordem_vistoria_id
        and (public.is_admin() or v.tecnico_id = auth.uid())
    )
  );

-- Update existe pra gravar `ordem_corretiva_id` ao gerar a OS a partir do
-- pino no mapa — ação de quem administra o backlog (gestor ou supervisor da
-- equipe), não do técnico em campo.
drop policy if exists "pendencias_vistoria_update" on public.pendencias_vistoria;
create policy "pendencias_vistoria_update" on public.pendencias_vistoria
  for update using (
    exists (
      select 1 from public.ordens_vistoria v
      where v.id = pendencias_vistoria.ordem_vistoria_id
        and (
          public.is_admin()
          or exists (
            select 1 from public.equipes e
            where e.id = v.equipe_id and e.supervisor_id = auth.uid()
          )
        )
    )
  );

drop policy if exists "pendencias_vistoria_delete" on public.pendencias_vistoria;
create policy "pendencias_vistoria_delete" on public.pendencias_vistoria
  for delete using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 3. Storage das fotos de pendência — mesmo padrão de pasta por dono
--    (storage.foldername(name))[1] = id da ordens_vistoria, já corrigido
--    nas migrações 0014/0015 pro módulo de Manutenção.
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('fotos-vistoria', 'fotos-vistoria', false)
on conflict (id) do nothing;

drop policy if exists "fotos_vistoria_select" on storage.objects;
create policy "fotos_vistoria_select" on storage.objects
  for select using (
    bucket_id = 'fotos-vistoria'
    and exists (
      select 1 from public.ordens_vistoria v
      where v.id::text = (storage.foldername(name))[1]
        and (
          public.is_admin()
          or v.tecnico_id = auth.uid()
          or v.responsavel_id = auth.uid()
          or exists (
            select 1 from public.equipes e
            where e.id = v.equipe_id and e.supervisor_id = auth.uid()
          )
        )
    )
  );

drop policy if exists "fotos_vistoria_insert" on storage.objects;
create policy "fotos_vistoria_insert" on storage.objects
  for insert with check (
    bucket_id = 'fotos-vistoria'
    and exists (
      select 1 from public.ordens_vistoria v
      where v.id::text = (storage.foldername(name))[1]
        and (public.is_admin() or v.tecnico_id = auth.uid())
    )
  );

drop policy if exists "fotos_vistoria_delete" on storage.objects;
create policy "fotos_vistoria_delete" on storage.objects
  for delete using (
    bucket_id = 'fotos-vistoria'
    and exists (
      select 1 from public.ordens_vistoria v
      where v.id::text = (storage.foldername(name))[1]
        and (
          public.is_admin()
          or v.tecnico_id = auth.uid()
          or exists (
            select 1 from public.equipes e
            where e.id = v.equipe_id and e.supervisor_id = auth.uid()
          )
        )
    )
  );

-- ----------------------------------------------------------------------------
-- 4. Realtime — mapa de backlog e execução da rota atualizam sem F5.
-- ----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['ordens_vistoria', 'pendencias_vistoria']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then
        null;
      when undefined_table then
        raise notice 'Tabela public.% não existe — pulando.', t;
    end;
  end loop;
end $$;

commit;
