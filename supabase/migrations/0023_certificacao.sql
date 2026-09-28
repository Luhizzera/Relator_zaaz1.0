-- ============================================================================
-- Migração 0023 — Módulo de Certificação (OS + pontos por CTO)
-- ============================================================================
-- Certificação de sinal para obra nova. Estrutura espelha o módulo de Vistoria
-- (migração 0018), porque o formato é o mesmo: uma OS que carrega uma lista de
-- pontos, percorrida por um técnico em campo. O que muda é o que se registra em
-- cada ponto — aqui, sinal esperado contra sinal medido.
--
-- Decisões (definidas com o gestor antes desta migração):
--
--   1 — Aprovação por MARGEM em dB sobre o esperado: o ponto passa quando
--       `sinal_medido_dbm >= sinal_esperado_dbm - margem_db`. A margem é da OS
--       inteira (não de cada ponto), com padrão 3 dB.
--
--       O resultado (pendente/aprovado/reprovado) NÃO é coluna: é calculado na
--       leitura, como a cor do pino da vistoria (decisão 3-A da 0018). Corrigir
--       a margem de uma OS reclassifica os pontos sozinho, sem reprocessar
--       nada nem deixar dado velho contradizendo a regra atual.
--
--   2 — Só gestor/supervisor cria os pontos, na abertura da OS. O técnico não
--       acrescenta CTO em campo: ele preenche medição, foto e observação dos
--       pontos planejados. Está nas policies de insert/update de
--       `pontos_certificacao`.
--
--   3 — Tem conferência: o técnico FINALIZA (status 'finalizada'), o gestor
--       confere ponto a ponto e então APROVA (status 'aprovada') ou DEVOLVE
--       (status 'reaberta'), marcando em `refazer` quais pontos precisam ser
--       refeitos e por quê. A medição devolvida não é apagada — fica visível
--       até o técnico medir por cima.
--
--   4 — Mesmo isolamento por supervisor da vistoria (decisão 5-B da 0018):
--       gestor vê tudo; supervisor só as equipes que administra; técnico só o
--       que está com ele.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Ordens de certificação
-- ----------------------------------------------------------------------------

create sequence if not exists public.ordens_certificacao_numero_seq start 1;

create table if not exists public.ordens_certificacao (
  id uuid primary key default gen_random_uuid(),
  numero text unique,

  titulo text not null default '',
  status text not null default 'aberta'
    check (status in ('aberta', 'em_andamento', 'finalizada', 'aprovada', 'reaberta', 'cancelada')),

  -- Quanto o sinal medido pode ficar PIOR que o esperado e ainda passar.
  -- Numeric (não float) porque é valor de engenharia lido e conferido por
  -- gente: 3.0 tem que continuar 3.0 na tela e no PDF.
  margem_db numeric(5, 2) not null default 3 check (margem_db >= 0),

  equipe_id uuid references public.equipes(id) on delete set null,
  tecnico_id uuid references public.profiles(id) on delete set null,
  -- Quem abriu a OS (gestor ou supervisor) — auditoria, igual às outras tabelas.
  responsavel_id uuid references public.profiles(id) on delete set null,

  data_prevista date,
  observacoes text,

  -- Conferência do gestor.
  aprovado_por uuid references public.profiles(id) on delete set null,
  aprovado_em timestamptz,
  motivo_devolucao text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.tg_gerar_numero_crt()
returns trigger
language plpgsql
as $$
begin
  if new.numero is null then
    new.numero := 'CRT-' || to_char(now(), 'YYYY') || '-'
      || lpad(nextval('public.ordens_certificacao_numero_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ordens_certificacao_numero on public.ordens_certificacao;
create trigger trg_ordens_certificacao_numero
  before insert on public.ordens_certificacao
  for each row execute function public.tg_gerar_numero_crt();

drop trigger if exists trg_ordens_certificacao_updated_at on public.ordens_certificacao;
create trigger trg_ordens_certificacao_updated_at
  before update on public.ordens_certificacao
  for each row execute function public.tg_set_updated_at();

alter table public.ordens_certificacao enable row level security;

drop policy if exists "ordens_certificacao_select" on public.ordens_certificacao;
create policy "ordens_certificacao_select" on public.ordens_certificacao
  for select using (
    public.is_admin()
    or tecnico_id = auth.uid()
    or responsavel_id = auth.uid()
    or exists (
      select 1 from public.equipes e
      where e.id = ordens_certificacao.equipe_id and e.supervisor_id = auth.uid()
    )
  );

-- Criação: gestor, ou supervisor da equipe de destino.
drop policy if exists "ordens_certificacao_insert" on public.ordens_certificacao;
create policy "ordens_certificacao_insert" on public.ordens_certificacao
  for insert with check (
    public.is_admin()
    or (
      responsavel_id = auth.uid()
      and (
        equipe_id is null
        or exists (
          select 1 from public.equipes e
          where e.id = ordens_certificacao.equipe_id and e.supervisor_id = auth.uid()
        )
      )
    )
  );

drop policy if exists "ordens_certificacao_update" on public.ordens_certificacao;
create policy "ordens_certificacao_update" on public.ordens_certificacao
  for update using (
    public.is_admin()
    or tecnico_id = auth.uid()
    or exists (
      select 1 from public.equipes e
      where e.id = ordens_certificacao.equipe_id and e.supervisor_id = auth.uid()
    )
  );

drop policy if exists "ordens_certificacao_delete" on public.ordens_certificacao;
create policy "ordens_certificacao_delete" on public.ordens_certificacao
  for delete using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 2. Pontos (uma CTO por linha)
-- ----------------------------------------------------------------------------

create table if not exists public.pontos_certificacao (
  id uuid primary key default gen_random_uuid(),
  ordem_certificacao_id uuid not null references public.ordens_certificacao(id) on delete cascade,

  -- Planejado pelo gestor na abertura.
  nome_cto text not null,
  latitude double precision not null,
  longitude double precision not null,
  sinal_esperado_dbm numeric(6, 2) not null,
  -- Ordem em que o técnico vê os pontos — a sequência da obra importa em campo.
  ordem_index integer not null default 0,

  -- Preenchido pelo técnico em campo. Nulo = ainda não certificado.
  sinal_medido_dbm numeric(6, 2),
  -- Foto da CTO junto do powermeter — é ela que sustenta a medição no PDF.
  storage_path text,
  observacao text,
  medido_por uuid references public.profiles(id) on delete set null,
  medido_em timestamptz,

  -- Conferência: gestor devolveu este ponto para refazer.
  refazer boolean not null default false,
  motivo_refazer text,

  created_at timestamptz not null default now()
);

create index if not exists idx_pontos_certificacao_ordem on public.pontos_certificacao(ordem_certificacao_id);

alter table public.pontos_certificacao enable row level security;

-- Mesmo escopo da OS dona, sempre via join — ponto não tem equipe própria.
drop policy if exists "pontos_certificacao_select" on public.pontos_certificacao;
create policy "pontos_certificacao_select" on public.pontos_certificacao
  for select using (
    exists (
      select 1 from public.ordens_certificacao c
      where c.id = pontos_certificacao.ordem_certificacao_id
        and (
          public.is_admin()
          or c.tecnico_id = auth.uid()
          or c.responsavel_id = auth.uid()
          or exists (
            select 1 from public.equipes e
            where e.id = c.equipe_id and e.supervisor_id = auth.uid()
          )
        )
    )
  );

-- Quem PLANEJA os pontos é gestor/supervisor (decisão 2) — o técnico não cria
-- CTO em campo, só mede as que foram planejadas.
drop policy if exists "pontos_certificacao_insert" on public.pontos_certificacao;
create policy "pontos_certificacao_insert" on public.pontos_certificacao
  for insert with check (
    exists (
      select 1 from public.ordens_certificacao c
      where c.id = pontos_certificacao.ordem_certificacao_id
        and (
          public.is_admin()
          or c.responsavel_id = auth.uid()
          or exists (
            select 1 from public.equipes e
            where e.id = c.equipe_id and e.supervisor_id = auth.uid()
          )
        )
    )
  );

-- Update serve a dois papéis: o técnico gravando a medição, e o gestor
-- marcando `refazer` na conferência. Quem pode o quê é decidido na tela; aqui
-- garantimos que ninguém de fora da OS encoste.
drop policy if exists "pontos_certificacao_update" on public.pontos_certificacao;
create policy "pontos_certificacao_update" on public.pontos_certificacao
  for update using (
    exists (
      select 1 from public.ordens_certificacao c
      where c.id = pontos_certificacao.ordem_certificacao_id
        and (
          public.is_admin()
          or c.tecnico_id = auth.uid()
          or c.responsavel_id = auth.uid()
          or exists (
            select 1 from public.equipes e
            where e.id = c.equipe_id and e.supervisor_id = auth.uid()
          )
        )
    )
  );

drop policy if exists "pontos_certificacao_delete" on public.pontos_certificacao;
create policy "pontos_certificacao_delete" on public.pontos_certificacao
  for delete using (
    public.is_admin()
    or exists (
      select 1 from public.ordens_certificacao c
      where c.id = pontos_certificacao.ordem_certificacao_id
        and (
          c.responsavel_id = auth.uid()
          or exists (
            select 1 from public.equipes e
            where e.id = c.equipe_id and e.supervisor_id = auth.uid()
          )
        )
    )
  );

-- ----------------------------------------------------------------------------
-- 3. Storage das fotos de certificação — pasta por OS, mesmo padrão das 0014,
--    0015 (manutenção) e 0018 (vistoria).
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('fotos-certificacao', 'fotos-certificacao', false)
on conflict (id) do nothing;

drop policy if exists "fotos_certificacao_select" on storage.objects;
create policy "fotos_certificacao_select" on storage.objects
  for select using (
    bucket_id = 'fotos-certificacao'
    and exists (
      select 1 from public.ordens_certificacao c
      where c.id::text = (storage.foldername(name))[1]
        and (
          public.is_admin()
          or c.tecnico_id = auth.uid()
          or c.responsavel_id = auth.uid()
          or exists (
            select 1 from public.equipes e
            where e.id = c.equipe_id and e.supervisor_id = auth.uid()
          )
        )
    )
  );

-- Só quem mede envia foto: o técnico da OS (ou o gestor, em correção).
drop policy if exists "fotos_certificacao_insert" on storage.objects;
create policy "fotos_certificacao_insert" on storage.objects
  for insert with check (
    bucket_id = 'fotos-certificacao'
    and exists (
      select 1 from public.ordens_certificacao c
      where c.id::text = (storage.foldername(name))[1]
        and (public.is_admin() or c.tecnico_id = auth.uid())
    )
  );

-- Update do objeto: a medição pode ser refeita depois de uma devolução, e o
-- upload usa upsert no mesmo caminho (id do ponto), sobrescrevendo a foto.
drop policy if exists "fotos_certificacao_update" on storage.objects;
create policy "fotos_certificacao_update" on storage.objects
  for update using (
    bucket_id = 'fotos-certificacao'
    and exists (
      select 1 from public.ordens_certificacao c
      where c.id::text = (storage.foldername(name))[1]
        and (public.is_admin() or c.tecnico_id = auth.uid())
    )
  );

drop policy if exists "fotos_certificacao_delete" on storage.objects;
create policy "fotos_certificacao_delete" on storage.objects
  for delete using (
    bucket_id = 'fotos-certificacao'
    and exists (
      select 1 from public.ordens_certificacao c
      where c.id::text = (storage.foldername(name))[1]
        and (
          public.is_admin()
          or c.tecnico_id = auth.uid()
          or exists (
            select 1 from public.equipes e
            where e.id = c.equipe_id and e.supervisor_id = auth.uid()
          )
        )
    )
  );

-- ----------------------------------------------------------------------------
-- 4. Realtime — a lista do gestor acompanha o técnico medindo, sem F5.
-- ----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['ordens_certificacao', 'pontos_certificacao']
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
