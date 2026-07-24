-- ============================================================================
-- Migração 0001 — ZAAZ System: base (perfis/relatório fotográfico) + módulo
-- de Manutenção (Field Service) com papéis reais
-- ============================================================================
-- Este banco estava vazio (não tinha nem `public.profiles`), então este
-- arquivo agora é AUTOSSUFICIENTE: recria a base inteira do domínio de
-- Relatório Fotográfico (profiles, ordens_servico, fotos, bucket
-- fotos-relatorio — igual ao schema.sql original do projeto, compartilhado
-- para comparação) e, em cima disso, o módulo de Manutenção com 3 papéis:
--   gestor      — aprova, cancela, reabre OS; gerencia usuários
--   supervisor  — distribui OS para equipe/técnico; acompanha operação
--   tecnico     — executa a OS em campo (mobile)
--
-- Escrito de forma idempotente (create if not exists / drop policy if
-- exists / create or replace function) — pode ser rodado tanto num banco
-- vazio quanto num banco que já tenha essas tabelas de uma instalação
-- anterior, sem duplicar nem quebrar nada.
-- ============================================================================

begin;

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 0. Base — profiles, ordens_servico, fotos, bucket fotos-relatorio
-- ----------------------------------------------------------------------------

create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text not null,
  email      text not null,
  role       text not null default 'tecnico' check (role in ('gestor', 'supervisor', 'tecnico')),
  ativo      boolean not null default true,
  created_at timestamptz not null default now()
);

-- Cria automaticamente um profile ('tecnico' por padrão) quando um usuário se
-- cadastra. Promova o primeiro gestor manualmente, por exemplo:
--   update public.profiles set role = 'gestor' where email = 'seu-email@zaaz.com';
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
    'tecnico'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create table if not exists public.ordens_servico (
  id                 uuid primary key default gen_random_uuid(),
  codigo_referencia  text not null default '',
  razao_social       text default 'ZAAZ PROVEDOR DE INTERNET E TELECOMUNICAÇÕES',
  titulo_relatorio   text default 'RESPOSTAS DE NOTIFICAÇÃO',
  objetivo           text default 'TAREFA DE REGULARIZAÇÃO DE REDE ÓPTICA',
  local              text default '',
  header             text default '',
  footer             text default '',
  preset_id          text default 'rede-optica',
  checklist_options  jsonb not null default '[]'::jsonb,
  status             text not null default 'em_andamento'
                        check (status in ('em_andamento', 'concluida', 'exportada', 'cancelada')),
  tecnico_id         uuid not null references public.profiles(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  concluded_at       timestamptz
);

create index if not exists idx_ordens_tecnico on public.ordens_servico(tecnico_id);
create index if not exists idx_ordens_status  on public.ordens_servico(status);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_ordens_updated_at on public.ordens_servico;
create trigger trg_ordens_updated_at
  before update on public.ordens_servico
  for each row execute procedure public.set_updated_at();

create table if not exists public.fotos (
  id            uuid primary key default gen_random_uuid(),
  ordem_id      uuid not null references public.ordens_servico(id) on delete cascade,
  storage_path  text not null,           -- caminho no bucket 'fotos-relatorio'
  description   text default '',         -- checklist serializado (itens separados por "||")
  observacoes   text default '',
  location      text,                    -- coordenadas UTM
  geo_attempted boolean default false,
  ordem_index   int default 0,           -- ordem de exibição dentro da OS
  created_at    timestamptz not null default now()
);

create index if not exists idx_fotos_ordem on public.fotos(ordem_id);

insert into storage.buckets (id, name, public)
values ('fotos-relatorio', 'fotos-relatorio', false)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 1. Papéis: gestor | supervisor | tecnico + funções utilitárias de RLS
-- ----------------------------------------------------------------------------
-- Redundante-mas-seguro: se `profiles` acabou de ser criada acima já com a
-- constraint de 3 papéis, este bloco só recria a mesma constraint. Se
-- `profiles` já existia de uma instalação anterior (2 papéis, 'admin'), é
-- aqui que a migração de verdade acontece.

alter table public.profiles
  drop constraint if exists profiles_role_check;

update public.profiles set role = 'gestor' where role = 'admin';

alter table public.profiles
  add constraint profiles_role_check check (role in ('gestor', 'supervisor', 'tecnico'));

alter table public.profiles
  alter column role set default 'tecnico';

-- Retorna o papel do usuário autenticado — evita repetir o subselect.
create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Gestor ou supervisor — quem distribui/acompanha/aprova (não executa em
-- campo). Usado tanto nas policies do domínio de Relatório Fotográfico logo
-- abaixo quanto nas do módulo de Manutenção mais adiante.
create or replace function public.can_manage_orders()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role in ('gestor', 'supervisor')
  );
$$;

-- Só gestor — usado nas ações de administração de usuários (profiles).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'gestor'
  );
$$;

-- ----------------------------------------------------------------------------
-- 1b. RLS — domínio Relatório Fotográfico (profiles / ordens_servico / fotos)
-- ----------------------------------------------------------------------------

alter table public.profiles       enable row level security;
alter table public.ordens_servico enable row level security;
alter table public.fotos          enable row level security;

-- PROFILES: todo mundo logado lê todos os perfis (exibir "técnico
-- responsável"); só gestor edita role/ativo de outros; cada um edita o
-- próprio nome.
drop policy if exists "profiles_select_all_logged_in" on public.profiles;
create policy "profiles_select_all_logged_in" on public.profiles
  for select using (auth.role() = 'authenticated');

drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin" on public.profiles
  for update using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_admin_insert" on public.profiles;
create policy "profiles_admin_insert" on public.profiles
  for insert with check (public.is_admin());

-- ORDENS_SERVICO: técnico vê/edita só as suas; gestor/supervisor veem/editam
-- todas (mesmo critério de "canManageOrders" usado no frontend).
drop policy if exists "ordens_select_own_or_admin" on public.ordens_servico;
create policy "ordens_select_own_or_admin" on public.ordens_servico
  for select using (tecnico_id = auth.uid() or public.can_manage_orders());

drop policy if exists "ordens_insert_own" on public.ordens_servico;
create policy "ordens_insert_own" on public.ordens_servico
  for insert with check (tecnico_id = auth.uid() or public.can_manage_orders());

drop policy if exists "ordens_update_own_or_admin" on public.ordens_servico;
create policy "ordens_update_own_or_admin" on public.ordens_servico
  for update using (tecnico_id = auth.uid() or public.can_manage_orders());

drop policy if exists "ordens_delete_own_or_admin" on public.ordens_servico;
create policy "ordens_delete_own_or_admin" on public.ordens_servico
  for delete using (tecnico_id = auth.uid() or public.can_manage_orders());

-- FOTOS: segue a permissão da ordem de serviço "pai".
drop policy if exists "fotos_select_via_ordem" on public.fotos;
create policy "fotos_select_via_ordem" on public.fotos
  for select using (
    exists (
      select 1 from public.ordens_servico o
      where o.id = fotos.ordem_id
        and (o.tecnico_id = auth.uid() or public.can_manage_orders())
    )
  );

drop policy if exists "fotos_insert_via_ordem" on public.fotos;
create policy "fotos_insert_via_ordem" on public.fotos
  for insert with check (
    exists (
      select 1 from public.ordens_servico o
      where o.id = fotos.ordem_id
        and (o.tecnico_id = auth.uid() or public.can_manage_orders())
    )
  );

drop policy if exists "fotos_update_via_ordem" on public.fotos;
create policy "fotos_update_via_ordem" on public.fotos
  for update using (
    exists (
      select 1 from public.ordens_servico o
      where o.id = fotos.ordem_id
        and (o.tecnico_id = auth.uid() or public.can_manage_orders())
    )
  );

drop policy if exists "fotos_delete_via_ordem" on public.fotos;
create policy "fotos_delete_via_ordem" on public.fotos
  for delete using (
    exists (
      select 1 from public.ordens_servico o
      where o.id = fotos.ordem_id
        and (o.tecnico_id = auth.uid() or public.can_manage_orders())
    )
  );

-- STORAGE.OBJECTS (bucket fotos-relatorio) — convenção de path
-- {tecnico_id}/{ordem_id}/{foto_id}.jpg.
drop policy if exists "storage_select_own_or_admin" on storage.objects;
create policy "storage_select_own_or_admin" on storage.objects
  for select using (
    bucket_id = 'fotos-relatorio'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.can_manage_orders()
    )
  );

drop policy if exists "storage_insert_own" on storage.objects;
create policy "storage_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'fotos-relatorio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "storage_delete_own_or_admin" on storage.objects;
create policy "storage_delete_own_or_admin" on storage.objects
  for delete using (
    bucket_id = 'fotos-relatorio'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.can_manage_orders()
    )
  );

-- ----------------------------------------------------------------------------
-- 2. Equipes de campo
-- ----------------------------------------------------------------------------

create table if not exists public.equipes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ativa boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists equipe_id uuid references public.equipes(id) on delete set null;

alter table public.equipes enable row level security;

drop policy if exists "equipes_select_authenticated" on public.equipes;
create policy "equipes_select_authenticated" on public.equipes
  for select using (auth.role() = 'authenticated');

drop policy if exists "equipes_write_gestor_supervisor" on public.equipes;
create policy "equipes_write_gestor_supervisor" on public.equipes
  for all using (public.can_manage_orders())
  with check (public.can_manage_orders());

-- ----------------------------------------------------------------------------
-- 3. Ordens de manutenção (tabela principal)
-- ----------------------------------------------------------------------------

create sequence if not exists public.ordens_manutencao_numero_seq start 1;

create table if not exists public.ordens_manutencao (
  id uuid primary key default gen_random_uuid(),
  numero text unique,

  tipo text not null,
  origem text not null,
  prioridade text not null default 'media'
    check (prioridade in ('baixa', 'media', 'alta', 'critica')),
  status text not null default 'aberta'
    check (status in (
      'aberta', 'atribuida', 'recebida', 'deslocamento', 'no_local', 'em_execucao',
      'pausada', 'aguardando_aprovacao', 'aprovada', 'reaberta', 'cancelada', 'concluida'
    )),

  solicitante text not null default '',
  setor text,
  -- responsavel_id: quem (usuário do sistema) abriu a OS, para auditoria.
  -- responsavel_nome: texto livre exibido/editável na tela de abertura —
  -- normalmente é o nome de quem abriu, mas o wizard permite sobrescrever
  -- (ex: abertura em nome de outra pessoa), por isso não é só um join.
  responsavel_id uuid references public.profiles(id) on delete set null,
  responsavel_nome text,

  uf text,
  municipio text,
  bairro text,
  endereco text,
  numero_endereco text,
  referencia text,
  latitude double precision,
  longitude double precision,

  problema_informado text,
  observacoes text,

  equipe_id uuid references public.equipes(id) on delete set null,
  tecnico_id uuid references public.profiles(id) on delete set null,
  data_prevista date,
  horario_previsto time,

  execucao_inicio_em timestamptz,
  execucao_fim_em timestamptz,

  -- Usados só a partir da Fase 3 (aba Aprovação), já criados agora para
  -- não exigir outra migração de coluna depois.
  aprovado_por uuid references public.profiles(id) on delete set null,
  aprovado_em timestamptz,
  motivo_recusa text,
  cancelado_em timestamptz,
  motivo_cancelamento text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ordens_manutencao_status on public.ordens_manutencao(status);
create index if not exists idx_ordens_manutencao_tecnico on public.ordens_manutencao(tecnico_id);
create index if not exists idx_ordens_manutencao_equipe on public.ordens_manutencao(equipe_id);

-- Geração automática do número "OS-YYYY-NNNN" (NNNN é uma sequência global,
-- não reinicia por ano — mais simples e sem risco de corrida).
create or replace function public.tg_gerar_numero_os()
returns trigger
language plpgsql
as $$
begin
  if new.numero is null then
    new.numero := 'OS-' || to_char(now(), 'YYYY') || '-'
      || lpad(nextval('public.ordens_manutencao_numero_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ordens_manutencao_numero on public.ordens_manutencao;
create trigger trg_ordens_manutencao_numero
  before insert on public.ordens_manutencao
  for each row execute function public.tg_gerar_numero_os();

create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_ordens_manutencao_updated_at on public.ordens_manutencao;
create trigger trg_ordens_manutencao_updated_at
  before update on public.ordens_manutencao
  for each row execute function public.tg_set_updated_at();

-- Impede que técnico altere atribuição (equipe/técnico) ou avance a OS pra
-- aprovada/cancelada/reaberta — essas ações são de gestor/supervisor.
-- Defesa em profundidade: a UI (Fase 3) também vai esconder esses botões,
-- mas a regra de negócio real mora aqui.
create or replace function public.tg_ordens_manutencao_guard()
returns trigger
language plpgsql
as $$
declare
  v_role text := public.current_profile_role();
begin
  if not public.can_manage_orders() then
    if new.tecnico_id is distinct from old.tecnico_id
       or new.equipe_id is distinct from old.equipe_id then
      raise exception 'Somente gestor ou supervisor pode alterar a atribuição da OS';
    end if;
  end if;

  if v_role <> 'gestor'
     and new.status is distinct from old.status
     and new.status in ('aprovada', 'cancelada', 'reaberta') then
    raise exception 'Somente gestor pode aprovar, cancelar ou reabrir uma OS';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ordens_manutencao_guard on public.ordens_manutencao;
create trigger trg_ordens_manutencao_guard
  before update on public.ordens_manutencao
  for each row execute function public.tg_ordens_manutencao_guard();

alter table public.ordens_manutencao enable row level security;

drop policy if exists "ordens_manutencao_select" on public.ordens_manutencao;
create policy "ordens_manutencao_select" on public.ordens_manutencao
  for select using (
    public.can_manage_orders()
    or tecnico_id = auth.uid()
  );

drop policy if exists "ordens_manutencao_insert" on public.ordens_manutencao;
create policy "ordens_manutencao_insert" on public.ordens_manutencao
  for insert with check (
    public.can_manage_orders()
  );

drop policy if exists "ordens_manutencao_update" on public.ordens_manutencao;
create policy "ordens_manutencao_update" on public.ordens_manutencao
  for update using (
    public.can_manage_orders()
    or tecnico_id = auth.uid()
  );

-- ----------------------------------------------------------------------------
-- 4. Tabelas filhas (ocorrências, materiais, checklist, fotos, vídeos, histórico)
-- ----------------------------------------------------------------------------

create table if not exists public.ocorrencias_manutencao (
  id uuid primary key default gen_random_uuid(),
  ordem_id uuid not null references public.ordens_manutencao(id) on delete cascade,
  tipo text not null,
  categoria text not null,
  descricao text not null default '',
  observacao text,
  quantidade integer not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.materiais_manutencao (
  id uuid primary key default gen_random_uuid(),
  ordem_id uuid not null references public.ordens_manutencao(id) on delete cascade,
  material text not null,
  quantidade numeric not null default 1,
  unidade text not null default 'un',
  observacao text,
  valor numeric,
  created_at timestamptz not null default now()
);

create table if not exists public.checklist_itens_manutencao (
  id uuid primary key default gen_random_uuid(),
  ordem_id uuid not null references public.ordens_manutencao(id) on delete cascade,
  label text not null,
  estado text not null default 'pendente'
    check (estado in ('pendente', 'concluido', 'nao_aplica')),
  observacao text,
  ordem_index integer not null default 0
);

create table if not exists public.fotos_manutencao (
  id uuid primary key default gen_random_uuid(),
  ordem_id uuid not null references public.ordens_manutencao(id) on delete cascade,
  storage_path text not null,
  categoria text not null default 'durante'
    check (categoria in ('antes', 'durante', 'depois')),
  descricao text,
  created_at timestamptz not null default now()
);

create table if not exists public.videos_manutencao (
  id uuid primary key default gen_random_uuid(),
  ordem_id uuid not null references public.ordens_manutencao(id) on delete cascade,
  storage_path text not null,
  descricao text,
  created_at timestamptz not null default now()
);

create table if not exists public.historico_manutencao (
  id uuid primary key default gen_random_uuid(),
  ordem_id uuid not null references public.ordens_manutencao(id) on delete cascade,
  usuario_id uuid references public.profiles(id) on delete set null,
  usuario_nome text not null,
  acao text not null,
  descricao text,
  created_at timestamptz not null default now()
);

create index if not exists idx_ocorrencias_manutencao_ordem on public.ocorrencias_manutencao(ordem_id);
create index if not exists idx_materiais_manutencao_ordem on public.materiais_manutencao(ordem_id);
create index if not exists idx_checklist_itens_manutencao_ordem on public.checklist_itens_manutencao(ordem_id);
create index if not exists idx_fotos_manutencao_ordem on public.fotos_manutencao(ordem_id);
create index if not exists idx_videos_manutencao_ordem on public.videos_manutencao(ordem_id);
create index if not exists idx_historico_manutencao_ordem on public.historico_manutencao(ordem_id);

-- RLS das tabelas filhas: acesso segue o mesmo escopo da OS pai (gestor/
-- supervisor veem tudo; técnico só o que é dele).
do $$
declare
  t text;
begin
  foreach t in array array[
    'ocorrencias_manutencao', 'materiais_manutencao', 'checklist_itens_manutencao',
    'fotos_manutencao', 'videos_manutencao', 'historico_manutencao'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s_scope" on public.%I', t, t);
    execute format($f$
      create policy "%s_scope" on public.%I
        for all using (
          exists (
            select 1 from public.ordens_manutencao o
            where o.id = ordem_id
              and (public.can_manage_orders() or o.tecnico_id = auth.uid())
          )
        )
        with check (
          exists (
            select 1 from public.ordens_manutencao o
            where o.id = ordem_id
              and (public.can_manage_orders() or o.tecnico_id = auth.uid())
          )
        )
    $f$, t, t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 5. Storage: buckets privados para fotos e vídeos de manutenção
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('fotos-manutencao', 'fotos-manutencao', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('videos-manutencao', 'videos-manutencao', false)
on conflict (id) do nothing;

-- Política permissiva por autenticação (mesmo nível do bucket fotos-relatorio
-- hoje) — refinar por pasta/usuário quando a aba Fotos/Vídeos entrar (Fase 3).
drop policy if exists "fotos_manutencao_rw" on storage.objects;
create policy "fotos_manutencao_rw" on storage.objects
  for all using (bucket_id = 'fotos-manutencao' and auth.role() = 'authenticated')
  with check (bucket_id = 'fotos-manutencao' and auth.role() = 'authenticated');

drop policy if exists "videos_manutencao_rw" on storage.objects;
create policy "videos_manutencao_rw" on storage.objects
  for all using (bucket_id = 'videos-manutencao' and auth.role() = 'authenticated')
  with check (bucket_id = 'videos-manutencao' and auth.role() = 'authenticated');

commit;
