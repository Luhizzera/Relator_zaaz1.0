// src/lib/manutencaoService.ts
import {
  supabase,
  uploadFotoManutencao,
  uploadVideoManutencao,
  deleteFotoManutencaoFromStorage,
  deleteVideoManutencaoFromStorage,
} from '@/lib/supabaseClient';
import type {
  OrdemManutencaoRow,
  OcorrenciaManutencaoRow,
  MaterialManutencaoRow,
  ChecklistItemManutencaoRow,
  HistoricoManutencaoRow,
  FotoManutencaoRow,
  VideoManutencaoRow,
  EquipeRow,
  ProfileRow,
  TipoEquipe,
  UserRole,
} from '@/lib/supabaseClient';
import { ManutencaoOrdem, StatusOS, ChecklistItemOS, SOLUCAO_PROBLEMA_CTO } from '@/types/manutencao';
import { normalizarNomeCidade, normalizarUf } from '@/lib/geocoding';

type ProfileRowLite = Pick<ProfileRow, 'id' | 'nome' | 'email' | 'ativo' | 'equipe_id'>;

/**
 * Camada de acesso a dados do módulo de Manutenção.
 *
 * Persistência real via Supabase/Postgres — ver
 * supabase/migrations/0001_manutencao_schema.sql para o schema.
 *
 * Mantém o padrão Repository já estabelecido: a UI depende do CONTRATO
 * (assinatura das funções abaixo), não de como os dados são obtidos. Nenhuma
 * tela precisou mudar de forma estrutural na troca do mock para o banco real.
 *
 * Escopo por papel (técnico só vê suas próprias OS) é garantido pelas
 * políticas RLS do banco — não precisa ser replicado aqui.
 */

const DEFAULT_CHECKLIST_LABELS = [
  'Caixa fechada',
  'CTO identificada',
  'Reserva técnica',
  'Medição realizada',
  'Limpeza executada',
  'Etiquetas instaladas',
];

const ORDEM_SELECT = `
  *,
  tecnico:tecnico_id ( nome ),
  equipe:equipe_id ( nome )
`;

interface OrdemManutencaoRowJoined extends OrdemManutencaoRow {
  tecnico?: { nome: string } | null;
  equipe?: { nome: string } | null;
}

function rowToOcorrencia(row: OcorrenciaManutencaoRow) {
  return {
    id: row.id,
    tipo: row.tipo,
    categoria: row.categoria,
    descricao: row.descricao,
    observacao: row.observacao ?? undefined,
    quantidade: row.quantidade,
  };
}

function rowToMaterial(row: MaterialManutencaoRow) {
  return {
    id: row.id,
    material: row.material,
    quantidade: row.quantidade,
    unidade: row.unidade,
    observacao: row.observacao ?? undefined,
    valor: row.valor ?? undefined,
  };
}

function rowToChecklistItem(row: ChecklistItemManutencaoRow): ChecklistItemOS {
  return {
    id: row.id,
    label: row.label,
    estado: row.estado,
    observacao: row.observacao ?? undefined,
  };
}

function rowToHistorico(row: HistoricoManutencaoRow) {
  return {
    id: row.id,
    usuario: row.usuario_nome,
    data: row.created_at,
    acao: row.acao,
    descricao: row.descricao ?? undefined,
  };
}

function rowToFoto(row: FotoManutencaoRow) {
  return {
    id: row.id,
    storagePath: row.storage_path,
    categoria: row.categoria,
    descricao: row.descricao ?? undefined,
    createdAt: row.created_at,
  };
}

function rowToVideo(row: VideoManutencaoRow) {
  return {
    id: row.id,
    storagePath: row.storage_path,
    descricao: row.descricao ?? undefined,
    createdAt: row.created_at,
  };
}

function rowToOrdem(
  row: OrdemManutencaoRowJoined,
  ocorrencias: OcorrenciaManutencaoRow[],
  materiais: MaterialManutencaoRow[],
  checklist: ChecklistItemManutencaoRow[],
  historico: HistoricoManutencaoRow[],
  fotos: FotoManutencaoRow[],
  videos: VideoManutencaoRow[],
): ManutencaoOrdem {
  return {
    id: row.id,
    numero: row.numero,

    tipo: row.tipo,
    origem: row.origem,
    prioridade: row.prioridade,
    status: row.status,

    solicitante: row.solicitante,
    setor: row.setor ?? undefined,
    responsavel: row.responsavel_nome ?? undefined,
    responsavelId: row.responsavel_id,

    uf: row.uf ?? undefined,
    municipio: row.municipio ?? undefined,
    bairro: row.bairro ?? undefined,
    endereco: row.endereco ?? undefined,
    numeroEndereco: row.numero_endereco ?? undefined,
    referencia: row.referencia ?? undefined,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,

    problemaInformado: row.problema_informado ?? undefined,
    observacoes: row.observacoes ?? undefined,

    equipe: row.equipe?.nome ?? undefined,
    equipeId: row.equipe_id,
    tecnico: row.tecnico?.nome ?? undefined,
    tecnicoId: row.tecnico_id,
    dataPrevista: row.data_prevista ?? undefined,
    horarioPrevisto: row.horario_previsto ?? undefined,

    execucaoInicioEm: row.execucao_inicio_em,
    execucaoFimEm: row.execucao_fim_em,

    aprovadoPor: row.aprovado_por,
    aprovadoEm: row.aprovado_em,
    motivoRecusa: row.motivo_recusa,
    canceladoEm: row.cancelado_em,
    motivoCancelamento: row.motivo_cancelamento,
    referenciaExterna: row.referencia_externa,

    ocorrencias: ocorrencias.map(rowToOcorrencia),
    materiais: materiais.map(rowToMaterial),
    checklist: checklist.map(rowToChecklistItem),
    historico: historico.map(rowToHistorico),
    fotos: fotos.map(rowToFoto),
    videos: videos.map(rowToVideo),

    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function groupByOrdemId<T extends { ordem_id: string }>(items: T[] | null): Map<string, T[]> {
  const map = new Map<string, T[]>();
  (items ?? []).forEach((item) => {
    const list = map.get(item.ordem_id) ?? [];
    list.push(item);
    map.set(item.ordem_id, list);
  });
  return map;
}

/** Busca as tabelas filhas de um lote de ordens em 6 queries (não N+1) e monta os objetos de domínio. */
async function attachChildren(rows: OrdemManutencaoRowJoined[]): Promise<ManutencaoOrdem[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const [ocorrenciasRes, materiaisRes, checklistRes, historicoRes, fotosRes, videosRes] = await Promise.all([
    supabase.from('ocorrencias_manutencao').select('*').in('ordem_id', ids),
    supabase.from('materiais_manutencao').select('*').in('ordem_id', ids),
    supabase.from('checklist_itens_manutencao').select('*').in('ordem_id', ids).order('ordem_index', { ascending: true }),
    supabase.from('historico_manutencao').select('*').in('ordem_id', ids).order('created_at', { ascending: true }),
    supabase.from('fotos_manutencao').select('*').in('ordem_id', ids).order('created_at', { ascending: true }),
    supabase.from('videos_manutencao').select('*').in('ordem_id', ids).order('created_at', { ascending: true }),
  ]);
  if (ocorrenciasRes.error) throw ocorrenciasRes.error;
  if (materiaisRes.error) throw materiaisRes.error;
  if (checklistRes.error) throw checklistRes.error;
  if (historicoRes.error) throw historicoRes.error;
  if (fotosRes.error) throw fotosRes.error;
  if (videosRes.error) throw videosRes.error;

  const ocorrenciasMap = groupByOrdemId(ocorrenciasRes.data as OcorrenciaManutencaoRow[] | null);
  const materiaisMap = groupByOrdemId(materiaisRes.data as MaterialManutencaoRow[] | null);
  const checklistMap = groupByOrdemId(checklistRes.data as ChecklistItemManutencaoRow[] | null);
  const historicoMap = groupByOrdemId(historicoRes.data as HistoricoManutencaoRow[] | null);
  const fotosMap = groupByOrdemId(fotosRes.data as FotoManutencaoRow[] | null);
  const videosMap = groupByOrdemId(videosRes.data as VideoManutencaoRow[] | null);

  return rows.map((row) =>
    rowToOrdem(
      row,
      ocorrenciasMap.get(row.id) ?? [],
      materiaisMap.get(row.id) ?? [],
      checklistMap.get(row.id) ?? [],
      historicoMap.get(row.id) ?? [],
      fotosMap.get(row.id) ?? [],
      videosMap.get(row.id) ?? [],
    ),
  );
}

async function resolveUsuarioNome(userId: string | null): Promise<string> {
  if (!userId) return 'Sistema';
  const { data } = await supabase.from('profiles').select('nome').eq('id', userId).maybeSingle();
  return data?.nome ?? 'Sistema';
}

async function registrarHistorico(ordemId: string, acao: string, descricao?: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;
  const usuarioNome = await resolveUsuarioNome(userId);
  const { error } = await supabase.from('historico_manutencao').insert({
    ordem_id: ordemId,
    usuario_id: userId,
    usuario_nome: usuarioNome,
    acao,
    descricao: descricao ?? null,
  });
  if (error) throw error;
}

/**
 * Compartilhada entre a abertura da OS (problemas marcados na Etapa 1 do
 * wizard) e o registro de ocorrências durante a execução — os dois casos
 * precisam do mesmo efeito: uma linha em `ocorrencias_manutencao` por
 * problema, e um item de checklist com a "solução" correspondente (ver
 * `SOLUCAO_PROBLEMA_CTO`), criado só se ainda não existir, pra não duplicar
 * quando o mesmo problema aparecer em mais de uma ocorrência.
 */
async function sincronizarOcorrenciasEChecklist(
  ordemId: string,
  problemas: string[],
  observacao: string | null,
): Promise<{ novosItensChecklist: number }> {
  if (problemas.length === 0) return { novosItensChecklist: 0 };

  const { error: ocorrenciasError } = await supabase.from('ocorrencias_manutencao').insert(
    problemas.map((problema) => ({
      ordem_id: ordemId,
      tipo: problema,
      categoria: 'Infraestrutura',
      descricao: observacao ?? '',
      observacao,
      quantidade: 1,
    })),
  );
  if (ocorrenciasError) throw ocorrenciasError;

  const { data: existentes, error: fetchError } = await supabase
    .from('checklist_itens_manutencao')
    .select('label, ordem_index')
    .eq('ordem_id', ordemId);
  if (fetchError) throw fetchError;

  const labelsExistentes = new Set((existentes ?? []).map((c) => c.label));
  const proximoIndexBase = Math.max(-1, ...(existentes ?? []).map((c) => c.ordem_index)) + 1;
  const solucoes = Array.from(new Set(problemas.map((p) => SOLUCAO_PROBLEMA_CTO[p] ?? p)));
  const novosItens = solucoes.filter((label) => !labelsExistentes.has(label));

  if (novosItens.length > 0) {
    const { error: checklistError } = await supabase.from('checklist_itens_manutencao').insert(
      novosItens.map((label, index) => ({
        ordem_id: ordemId,
        label,
        estado: 'pendente' as const,
        ordem_index: proximoIndexBase + index,
      })),
    );
    if (checklistError) throw checklistError;
  }

  return { novosItensChecklist: novosItens.length };
}

export async function listManutencaoOrders(): Promise<ManutencaoOrdem[]> {
  const { data, error } = await supabase
    .from('ordens_manutencao')
    .select(ORDEM_SELECT)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return attachChildren((data ?? []) as OrdemManutencaoRowJoined[]);
}

export async function getManutencaoOrder(id: string): Promise<ManutencaoOrdem | null> {
  const { data, error } = await supabase
    .from('ordens_manutencao')
    .select(ORDEM_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [ordem] = await attachChildren([data as OrdemManutencaoRowJoined]);
  return ordem;
}

export async function listEquipes(tipo: TipoEquipe): Promise<EquipeRow[]> {
  const { data, error } = await supabase
    .from('equipes')
    .select('*')
    .eq('tipo', tipo)
    .eq('ativa', true)
    .order('nome', { ascending: true });
  if (error) throw error;
  return (data ?? []) as EquipeRow[];
}

/** Equipes administradas por um supervisor específico — usado pra escopar quem ele pode delegar (ver DelegarTecnicoModal.tsx) e na tela de equipes (ver MinhaEquipe.tsx). */
export async function listEquipesDoSupervisor(supervisorId: string, tipo: TipoEquipe): Promise<EquipeRow[]> {
  const { data, error } = await supabase
    .from('equipes')
    .select('*')
    .eq('supervisor_id', supervisorId)
    .eq('tipo', tipo)
    .eq('ativa', true)
    .order('nome', { ascending: true });
  if (error) throw error;
  return (data ?? []) as EquipeRow[];
}

/** Cria uma equipe nova. `supervisorId` omitido = equipe sem dono ainda (gestor atribui depois). */
export async function criarEquipe(nome: string, tipo: TipoEquipe, supervisorId?: string): Promise<EquipeRow> {
  const { data, error } = await supabase
    .from('equipes')
    .insert({ nome, tipo, supervisor_id: supervisorId ?? null })
    .select('*')
    .single();
  if (error) throw error;
  return data as EquipeRow;
}

/** Troca o supervisor dono de uma equipe — ação de gestor (ver MinhaEquipe.tsx). */
export async function definirSupervisorDaEquipe(equipeId: string, supervisorId: string | null): Promise<void> {
  const { error } = await supabase.from('equipes').update({ supervisor_id: supervisorId }).eq('id', equipeId);
  if (error) throw error;
}

/** Lista os técnicos (LA ou de manutenção, conforme `role`) de uma equipe (perfis com esse `equipe_id`). */
export async function listTecnicosDaEquipe(equipeId: string, role: UserRole): Promise<ProfileRowLite[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nome, email, ativo, equipe_id')
    .eq('equipe_id', equipeId)
    .eq('role', role)
    .order('nome', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ProfileRowLite[];
}

/** Técnicos (LA ou de manutenção) sem equipe nenhuma — candidatos a adicionar (ver MinhaEquipe.tsx). */
export async function listTecnicosSemEquipe(role: UserRole): Promise<ProfileRowLite[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nome, email, ativo, equipe_id')
    .is('equipe_id', null)
    .eq('role', role)
    .eq('ativo', true)
    .order('nome', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ProfileRowLite[];
}

/** Adiciona (ou move) um técnico de manutenção pra uma equipe. */
export async function adicionarTecnicoAEquipe(tecnicoId: string, equipeId: string): Promise<void> {
  const { error } = await supabase.from('profiles').update({ equipe_id: equipeId }).eq('id', tecnicoId);
  if (error) throw error;
}

/** Remove um técnico da equipe atual (não apaga o usuário, só desvincula). */
export async function removerTecnicoDaEquipe(tecnicoId: string): Promise<void> {
  const { error } = await supabase.from('profiles').update({ equipe_id: null }).eq('id', tecnicoId);
  if (error) throw error;
}

export async function createManutencaoOrder(
  partial: Partial<ManutencaoOrdem> = {},
): Promise<ManutencaoOrdem> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;

  const insertPayload = {
    tipo: partial.tipo ?? 'Manutenção Corretiva',
    origem: partial.origem ?? 'Sistema',
    prioridade: partial.prioridade ?? 'media',
    status: 'aberta' as StatusOS,
    solicitante: partial.solicitante ?? '',
    setor: partial.setor ?? null,
    responsavel_id: userId,
    responsavel_nome: partial.responsavel ?? null,
    // Mesma razão do `municipio` logo abaixo: normalizado no ponto único de
    // entrada, pra sigla digitada à mão não virar um valor distinto no filtro.
    uf: normalizarUf(partial.uf),
    // Normalizado aqui — ponto único de entrada da OS no banco — pra cidade
    // digitada à mão ou vinda de geocodificação em momentos diferentes não
    // virar valores distintos no filtro (ver normalizarNomeCidade).
    municipio: partial.municipio ? normalizarNomeCidade(partial.municipio) : null,
    bairro: partial.bairro ?? null,
    endereco: partial.endereco ?? null,
    numero_endereco: partial.numeroEndereco ?? null,
    referencia: partial.referencia ?? null,
    latitude: partial.latitude ?? null,
    longitude: partial.longitude ?? null,
    problema_informado: partial.problemaInformado ?? null,
    observacoes: partial.observacoes ?? null,
    data_prevista: partial.dataPrevista ?? null,
    horario_previsto: partial.horarioPrevisto ?? null,
  };

  const { data: ordemRow, error } = await supabase
    .from('ordens_manutencao')
    .insert(insertPayload)
    .select('id')
    .single();
  if (error) throw error;

  const { error: checklistError } = await supabase.from('checklist_itens_manutencao').insert(
    DEFAULT_CHECKLIST_LABELS.map((label, index) => ({
      ordem_id: ordemRow.id,
      label,
      estado: 'pendente' as const,
      ordem_index: index,
    })),
  );
  if (checklistError) throw checklistError;

  // Problemas marcados na abertura (Etapa 1 do wizard) viram ocorrências de
  // verdade — o técnico de manutenção precisa vê-los na aba Ocorrências, não
  // só como um texto solto em "Problema informado" — e já entram no
  // checklist como itens de solução a resolver.
  const problemasIniciais = partial.problemaInformado
    ? partial.problemaInformado.split('||').filter((p) => p.trim() !== '')
    : [];
  if (problemasIniciais.length > 0) {
    await sincronizarOcorrenciasEChecklist(ordemRow.id, problemasIniciais, null);
  }

  await registrarHistorico(ordemRow.id, 'OS criada');

  const criada = await getManutencaoOrder(ordemRow.id);
  if (!criada) throw new Error('Falha ao carregar a OS recém-criada.');
  return criada;
}

/** Duplica uma OS (nova solicitação com os mesmos dados) — usada na Lista pra "reabrir" um caso parecido sem redigitar tudo. Nasce 'aberta', sem equipe/técnico, com checklist padrão novo. */
export async function duplicarOrdemManutencao(ordemId: string): Promise<ManutencaoOrdem> {
  const original = await getManutencaoOrder(ordemId);
  if (!original) throw new Error('OS original não encontrada.');

  const nova = await createManutencaoOrder({
    tipo: original.tipo,
    origem: original.origem,
    prioridade: original.prioridade,
    solicitante: original.solicitante,
    setor: original.setor,
    responsavel: original.responsavel,
    uf: original.uf,
    municipio: original.municipio,
    bairro: original.bairro,
    endereco: original.endereco,
    numeroEndereco: original.numeroEndereco,
    referencia: original.referencia,
    latitude: original.latitude,
    longitude: original.longitude,
    problemaInformado: original.problemaInformado,
    observacoes: original.observacoes,
    dataPrevista: original.dataPrevista,
    horarioPrevisto: original.horarioPrevisto,
  });

  await registrarHistorico(nova.id, 'OS duplicada', `A partir de ${original.numero}`);
  return nova;
}

export async function updateOrderStatus(
  id: string,
  status: StatusOS,
  acao: string,
  extra?: { execucaoInicioEm?: string; execucaoFimEm?: string; descricao?: string },
): Promise<void> {
  const patch: Record<string, unknown> = { status };
  if (extra?.execucaoInicioEm) patch.execucao_inicio_em = extra.execucaoInicioEm;
  if (extra?.execucaoFimEm) patch.execucao_fim_em = extra.execucaoFimEm;

  const { error } = await supabase.from('ordens_manutencao').update(patch).eq('id', id);
  if (error) throw error;
  await registrarHistorico(id, acao, extra?.descricao);
}

export async function updateChecklistItem(
  ordemId: string,
  itemId: string,
  estado: ChecklistItemOS['estado'],
): Promise<void> {
  const { error } = await supabase
    .from('checklist_itens_manutencao')
    .update({ estado })
    .eq('id', itemId)
    .eq('ordem_id', ordemId);
  if (error) throw error;
}

/**
 * Delega a OS para um técnico. `tecnicoId` é o uuid de `profiles.id` (não mais
 * o nome — resolvido pelo Supabase real, ver DelegarTecnicoModal.tsx).
 *
 * Também grava `equipe_id` da OS com a equipe do próprio técnico — antes
 * disso o campo "Equipe" (e o gráfico "Produtividade por Equipe") nunca era
 * preenchido, porque nenhuma tela setava esse valor.
 */
export async function assignTecnico(
  ordemId: string,
  tecnicoId: string,
  tecnicoNome: string,
  /** Referência da atividade equivalente no app "Aniel" — opcional, também editável depois (ver atualizarReferenciaExterna). */
  referenciaExterna?: string,
): Promise<void> {
  const { data: tecnico } = await supabase
    .from('profiles')
    .select('equipe_id')
    .eq('id', tecnicoId)
    .maybeSingle();

  const updatePayload: Record<string, unknown> = {
    tecnico_id: tecnicoId,
    equipe_id: tecnico?.equipe_id ?? null,
    status: 'atribuida' as StatusOS,
  };
  if (referenciaExterna) updatePayload.referencia_externa = referenciaExterna;

  const { error } = await supabase
    .from('ordens_manutencao')
    .update(updatePayload)
    .eq('id', ordemId);
  if (error) throw error;
  await registrarHistorico(ordemId, `OS delegada para ${tecnicoNome}`);
}

/** Referência da atividade equivalente no app "Aniel" (ponte manual até existir integração via API) — editável a qualquer momento na aba Encerramento. */
export async function atualizarReferenciaExterna(ordemId: string, valor: string | null): Promise<void> {
  const { error } = await supabase
    .from('ordens_manutencao')
    .update({ referencia_externa: valor })
    .eq('id', ordemId);
  if (error) throw error;
}

// ── Registros feitos durante a execução (mobile) ──────────────────────────

/**
 * Registra uma ou mais ocorrências de uma vez — a seleção vem da mesma caixa
 * de checklist usada na abertura da OS (`PROBLEMAS_CTO` em
 * NovaOrdemManutencao.tsx), não mais de um dropdown de tipo único.
 *
 * Cada problema marcado também garante um item de checklist com a solução
 * correspondente (`SOLUCAO_PROBLEMA_CTO`) — criado só se ainda não existir,
 * pra não duplicar quando o mesmo problema for reportado em ocorrências
 * diferentes (inclusive as já registradas na abertura da OS).
 */
export async function addOcorrencias(
  ordemId: string,
  problemas: string[],
  observacao?: string,
): Promise<{ novosItensChecklist: number }> {
  if (problemas.length === 0) return { novosItensChecklist: 0 };

  const { novosItensChecklist } = await sincronizarOcorrenciasEChecklist(ordemId, problemas, observacao ?? null);

  const resumo = problemas.length === 1 ? problemas[0] : problemas.join(', ');
  await registrarHistorico(
    ordemId,
    problemas.length === 1 ? 'Ocorrência registrada' : `${problemas.length} ocorrências registradas`,
    resumo,
  );

  return { novosItensChecklist };
}

/** Nota livre registrada durante a execução (aba Ocorrências no mobile) — vira uma entrada no histórico/timeline da OS, sem exigir nenhum problema do checklist selecionado. */
export async function adicionarObservacao(ordemId: string, texto: string): Promise<void> {
  await registrarHistorico(ordemId, 'Observação registrada', texto);
}

export async function addMaterial(
  ordemId: string,
  input: { material: string; quantidade: number; unidade: string; observacao?: string; valor?: number },
): Promise<void> {
  const { error } = await supabase.from('materiais_manutencao').insert({
    ordem_id: ordemId,
    material: input.material,
    quantidade: input.quantidade,
    unidade: input.unidade,
    observacao: input.observacao ?? null,
    valor: input.valor ?? null,
  });
  if (error) throw error;
  await registrarHistorico(ordemId, 'Material registrado', input.material);
}

/**
 * Registra vários materiais de uma vez (execução mobile — ver MaterialModal
 * em ManutencaoExecucaoMobile.tsx). Um único insert em lote + UM evento de
 * histórico resumindo a quantidade, em vez de chamar addMaterial em loop
 * (que geraria uma linha de histórico por item).
 */
export async function addMateriais(
  ordemId: string,
  itens: { material: string; quantidade: number; unidade: string; observacao?: string; valor?: number }[],
): Promise<void> {
  if (itens.length === 0) return;
  const { error } = await supabase.from('materiais_manutencao').insert(
    itens.map((input) => ({
      ordem_id: ordemId,
      material: input.material,
      quantidade: input.quantidade,
      unidade: input.unidade,
      observacao: input.observacao ?? null,
      valor: input.valor ?? null,
    })),
  );
  if (error) throw error;

  const resumo = itens.length === 1
    ? itens[0].material
    : itens.map((i) => i.material).join(', ');
  await registrarHistorico(ordemId, `${itens.length} material(is) registrado(s)`, resumo);
}

export async function addFotoManutencao(
  ordemId: string,
  dataUrl: string,
  categoria: 'antes' | 'depois' = 'depois',
): Promise<void> {
  const fotoId = crypto.randomUUID();
  const storagePath = await uploadFotoManutencao(dataUrl, ordemId, fotoId);
  const { error } = await supabase.from('fotos_manutencao').insert({
    id: fotoId,
    ordem_id: ordemId,
    storage_path: storagePath,
    categoria,
  });
  if (error) throw error;
  await registrarHistorico(ordemId, 'Foto anexada', categoria);
}

export async function addVideoManutencao(
  ordemId: string,
  blob: Blob,
  contentType: string,
  descricao?: string,
): Promise<void> {
  const videoId = crypto.randomUUID();
  const storagePath = await uploadVideoManutencao(blob, ordemId, videoId, contentType);
  const { error } = await supabase.from('videos_manutencao').insert({
    id: videoId,
    ordem_id: ordemId,
    storage_path: storagePath,
    descricao: descricao ?? null,
  });
  if (error) throw error;
  await registrarHistorico(ordemId, 'Vídeo anexado');
}

export async function removeFotoManutencao(fotoId: string, storagePath: string, ordemId: string): Promise<void> {
  const { error } = await supabase.from('fotos_manutencao').delete().eq('id', fotoId);
  if (error) throw error;
  await deleteFotoManutencaoFromStorage(storagePath);
  await registrarHistorico(ordemId, 'Foto removida');
}

export async function removeVideoManutencao(videoId: string, storagePath: string, ordemId: string): Promise<void> {
  const { error } = await supabase.from('videos_manutencao').delete().eq('id', videoId);
  if (error) throw error;
  await deleteVideoManutencaoFromStorage(storagePath);
  await registrarHistorico(ordemId, 'Vídeo removido');
}

// ── Encerramento (gestor/supervisor) ────────────────────────────────────────

/**
 * Reabre uma OS finalizada pro técnico com uma observação adicional opcional
 * — usado quando o gestor/supervisor percebe que algo precisa de retrabalho.
 * Não apaga nada do que já foi registrado (ocorrências, materiais, checklist,
 * fotos continuam intactos); só muda o status e vira uma entrada no histórico.
 */
export async function reabrirOrdem(ordemId: string, motivo?: string): Promise<void> {
  const { error } = await supabase
    .from('ordens_manutencao')
    .update({ status: 'reaberta' as StatusOS, motivo_recusa: motivo ?? null })
    .eq('id', ordemId);
  if (error) throw error;
  await registrarHistorico(ordemId, 'OS reaberta', motivo);
}

/**
 * Estorna uma delegação feita por engano: a OS volta pra fila de atribuição
 * como se nunca tivesse sido delegada — status 'aberta', sem técnico e sem
 * equipe.
 *
 * Diferente de `reabrirOrdem`, que é retrabalho: lá a OS continua com o mesmo
 * técnico, que a recebe de volta pra corrigir algo. Aqui o técnico é que
 * estava errado (ex: OS de Londrina delegada à equipe de MG), então o vínculo
 * precisa ser desfeito pra que outro supervisor possa delegar direito.
 *
 * Nada do que já foi registrado é apagado — ocorrências, materiais, checklist
 * e fotos continuam na OS. Só o vínculo some, e o histórico guarda o nome de
 * quem estava atribuído, senão o estorno apagaria o próprio rastro do erro.
 *
 * O trigger `tg_ordens_manutencao_guard` (migração 0001) já cobre a permissão:
 * mexer em tecnico_id/equipe_id exige gestor ou supervisor, e voltar pra
 * 'aberta' não está entre os status restritos a gestor.
 */
export async function devolverParaFilaDeAtribuicao(ordemId: string, motivo?: string): Promise<void> {
  // Lê antes de limpar: depois do update os nomes já se foram, e o histórico
  // ficaria sem dizer de quem a OS foi estornada. Reaproveita getManutencaoOrder
  // em vez de montar outro select com embeds — ele já resolve técnico e equipe.
  const antes = await getManutencaoOrder(ordemId);
  const tecnicoAnterior = antes?.tecnico;
  const equipeAnterior = antes?.equipe;

  const { error } = await supabase
    .from('ordens_manutencao')
    .update({ status: 'aberta' as StatusOS, tecnico_id: null, equipe_id: null })
    .eq('id', ordemId);
  if (error) throw error;

  const de = [tecnicoAnterior, equipeAnterior].filter(Boolean).join(' · ');
  await registrarHistorico(
    ordemId,
    'Delegação estornada',
    [de && `Estava atribuída a ${de}.`, motivo].filter(Boolean).join(' ') || undefined,
  );
}

export async function cancelarOrdem(ordemId: string, motivo: string): Promise<void> {
  const { error } = await supabase
    .from('ordens_manutencao')
    .update({ status: 'cancelada' as StatusOS, motivo_cancelamento: motivo, cancelado_em: new Date().toISOString() })
    .eq('id', ordemId);
  if (error) throw error;
  await registrarHistorico(ordemId, 'OS cancelada', motivo);
}

/**
 * Encerramento definitivo — ação opcional do gestor/supervisor sobre uma OS
 * já 'finalizada' pelo técnico. Não é um gate obrigatório (a OS já está
 * operacionalmente concluída desde que o técnico finalizou); é só o "carimbo"
 * de que o gestor revisou e não há mais nada pendente. Reaproveita o status
 * 'aprovada', que já existe na constraint e no trigger de permissão desde a
 * migração 0013 — só nunca tinha um botão que o setasse.
 */
export async function encerrarOrdem(ordemId: string): Promise<void> {
  const { error } = await supabase
    .from('ordens_manutencao')
    .update({ status: 'aprovada' as StatusOS, aprovado_em: new Date().toISOString() })
    .eq('id', ordemId);
  if (error) throw error;
  await registrarHistorico(ordemId, 'OS encerrada definitivamente');
}
