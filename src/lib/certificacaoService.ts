// src/lib/certificacaoService.ts
import {
  supabase,
  uploadFotoCertificacao,
  deleteFotoCertificacaoFromStorage,
} from '@/lib/supabaseClient';
import type { OrdemCertificacaoRow, PontoCertificacaoRow } from '@/lib/supabaseClient';
import {
  OrdemCertificacao, PontoCertificacao, StatusOrdemCertificacao, MARGEM_DB_PADRAO, resumoCertificacao,
} from '@/types/certificacao';

/**
 * Camada de acesso a dados do módulo de Certificação. O escopo por papel e
 * equipe é garantido pelas policies de
 * `supabase/migrations/0023_certificacao.sql` — mesmo isolamento real por
 * supervisor do módulo de Vistoria —, então não é replicado aqui.
 */

const ORDEM_CERTIFICACAO_SELECT = `
  *,
  tecnico:tecnico_id ( nome ),
  equipe:equipe_id ( nome ),
  responsavel:responsavel_id ( nome )
`;

interface OrdemCertificacaoRowJoined extends OrdemCertificacaoRow {
  tecnico?: { nome: string } | null;
  equipe?: { nome: string } | null;
  responsavel?: { nome: string } | null;
}

/**
 * `numeric` do Postgres chega como string no supabase-js, para não perder
 * precisão em valores grandes. Aqui são dBm e margem, onde `number` é exato —
 * mas a conversão tem que ser explícita, senão `-19.4 >= -21` viraria
 * comparação de texto e o resultado da certificação sairia errado em silêncio.
 */
const numero = (valor: number | string | null | undefined): number | null => {
  if (valor == null || valor === '') return null;
  const n = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(n) ? n : null;
};

function rowToPonto(row: PontoCertificacaoRow): PontoCertificacao {
  return {
    id: row.id,
    ordemCertificacaoId: row.ordem_certificacao_id,
    nomeCto: row.nome_cto,
    latitude: row.latitude,
    longitude: row.longitude,
    sinalEsperadoDbm: numero(row.sinal_esperado_dbm) ?? 0,
    ordemIndex: row.ordem_index,
    sinalMedidoDbm: numero(row.sinal_medido_dbm),
    storagePath: row.storage_path,
    observacao: row.observacao,
    medidoPor: row.medido_por,
    medidoEm: row.medido_em,
    refazer: row.refazer,
    motivoRefazer: row.motivo_refazer,
    createdAt: row.created_at,
  };
}

function rowToOrdem(row: OrdemCertificacaoRowJoined, pontos: PontoCertificacaoRow[]): OrdemCertificacao {
  return {
    id: row.id,
    numero: row.numero,
    titulo: row.titulo,
    status: row.status,
    margemDb: numero(row.margem_db) ?? MARGEM_DB_PADRAO,

    equipe: row.equipe?.nome ?? undefined,
    equipeId: row.equipe_id,
    tecnico: row.tecnico?.nome ?? undefined,
    tecnicoId: row.tecnico_id,
    responsavel: row.responsavel?.nome ?? undefined,
    responsavelId: row.responsavel_id,

    dataPrevista: row.data_prevista,
    observacoes: row.observacoes,

    aprovadoPor: row.aprovado_por,
    aprovadoEm: row.aprovado_em,
    motivoDevolucao: row.motivo_devolucao,

    pontos: pontos.map(rowToPonto).sort((a, b) => a.ordemIndex - b.ordemIndex),

    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listOrdensCertificacao(): Promise<OrdemCertificacao[]> {
  const { data, error } = await supabase
    .from('ordens_certificacao')
    .select(ORDEM_CERTIFICACAO_SELECT)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as OrdemCertificacaoRowJoined[];
  if (rows.length === 0) return [];

  const { data: pontosData, error: pontosError } = await supabase
    .from('pontos_certificacao')
    .select('*')
    .in('ordem_certificacao_id', rows.map((r) => r.id))
    .order('ordem_index', { ascending: true });
  if (pontosError) throw pontosError;

  const porOrdem = new Map<string, PontoCertificacaoRow[]>();
  (pontosData ?? []).forEach((p) => {
    const lista = porOrdem.get(p.ordem_certificacao_id) ?? [];
    lista.push(p as PontoCertificacaoRow);
    porOrdem.set(p.ordem_certificacao_id, lista);
  });

  return rows.map((row) => rowToOrdem(row, porOrdem.get(row.id) ?? []));
}

export async function getOrdemCertificacao(id: string): Promise<OrdemCertificacao | null> {
  const { data, error } = await supabase
    .from('ordens_certificacao')
    .select(ORDEM_CERTIFICACAO_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const { data: pontosData, error: pontosError } = await supabase
    .from('pontos_certificacao')
    .select('*')
    .eq('ordem_certificacao_id', id)
    .order('ordem_index', { ascending: true });
  if (pontosError) throw pontosError;

  return rowToOrdem(data as OrdemCertificacaoRowJoined, (pontosData ?? []) as PontoCertificacaoRow[]);
}

export interface PontoPlanejado {
  nomeCto: string;
  latitude: number;
  longitude: number;
  sinalEsperadoDbm: number;
}

/**
 * Cria a OS com os pontos já definidos. A lista de CTOs é fechada aqui: o
 * técnico mede o que foi planejado e não acrescenta ponto em campo.
 *
 * Se a gravação dos pontos falhar, a OS recém-criada é apagada — uma
 * certificação sem CTO nenhuma não tem o que certificar, e deixá-la na lista
 * só produziria uma OS fantasma que alguém teria que limpar depois.
 */
export async function createOrdemCertificacao(partial: {
  titulo: string;
  equipeId: string;
  tecnicoId?: string | null;
  dataPrevista?: string | null;
  observacoes?: string | null;
  margemDb?: number;
  pontos: PontoPlanejado[];
}): Promise<OrdemCertificacao> {
  if (partial.pontos.length === 0) throw new Error('Informe ao menos uma CTO para certificar.');

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;

  const { data: ordemRow, error } = await supabase
    .from('ordens_certificacao')
    .insert({
      titulo: partial.titulo,
      equipe_id: partial.equipeId,
      tecnico_id: partial.tecnicoId ?? null,
      responsavel_id: userId,
      data_prevista: partial.dataPrevista ?? null,
      observacoes: partial.observacoes ?? null,
      margem_db: partial.margemDb ?? MARGEM_DB_PADRAO,
    })
    .select('id')
    .single();
  if (error) throw error;

  const { error: pontosError } = await supabase.from('pontos_certificacao').insert(
    partial.pontos.map((p, index) => ({
      ordem_certificacao_id: ordemRow.id,
      nome_cto: p.nomeCto,
      latitude: p.latitude,
      longitude: p.longitude,
      sinal_esperado_dbm: p.sinalEsperadoDbm,
      ordem_index: index,
    })),
  );
  if (pontosError) {
    await supabase.from('ordens_certificacao').delete().eq('id', ordemRow.id);
    throw pontosError;
  }

  const criada = await getOrdemCertificacao(ordemRow.id);
  if (!criada) throw new Error('Falha ao carregar a certificação recém-criada.');
  return criada;
}

async function updateStatus(id: string, status: StatusOrdemCertificacao, extra: Record<string, unknown> = {}): Promise<void> {
  const { error } = await supabase.from('ordens_certificacao').update({ status, ...extra }).eq('id', id);
  if (error) throw error;
}

export const iniciarCertificacao = (id: string) => updateStatus(id, 'em_andamento');
export const cancelarCertificacao = (id: string) => updateStatus(id, 'cancelada');

/** Delega uma OS criada sem técnico. Não muda o status — o técnico ainda precisa iniciar. */
export async function delegarTecnicoCertificacao(ordemId: string, tecnicoId: string): Promise<void> {
  const { error } = await supabase.from('ordens_certificacao').update({ tecnico_id: tecnicoId }).eq('id', ordemId);
  if (error) throw error;
}

/**
 * Grava a medição de um ponto: sinal lido no powermeter, foto da CTO com o
 * aparelho e observação. Refazer a medição depois de uma devolução limpa a
 * marca `refazer` — é a própria medição nova que responde ao pedido do gestor.
 */
export async function registrarMedicao(
  ponto: PontoCertificacao,
  medicao: { sinalMedidoDbm: number; dataUrl?: string | null; observacao?: string | null },
): Promise<PontoCertificacao> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;

  const storagePath = medicao.dataUrl
    ? await uploadFotoCertificacao(medicao.dataUrl, ponto.ordemCertificacaoId, ponto.id)
    : ponto.storagePath ?? null;

  const { data, error } = await supabase
    .from('pontos_certificacao')
    .update({
      sinal_medido_dbm: medicao.sinalMedidoDbm,
      storage_path: storagePath,
      observacao: medicao.observacao ?? null,
      medido_por: userId,
      medido_em: new Date().toISOString(),
      refazer: false,
      motivo_refazer: null,
    })
    .eq('id', ponto.id)
    .select('*')
    .single();
  if (error) throw error;
  return rowToPonto(data as PontoCertificacaoRow);
}

/**
 * Técnico encerra a medição e manda para conferência. Barra aqui, e não só na
 * tela, porque uma OS que chega "finalizada" com ponto faltando vira certificado
 * incompleto — e o PDF é emitido a partir dela.
 */
export async function finalizarCertificacao(ordem: OrdemCertificacao): Promise<void> {
  const resumo = resumoCertificacao(ordem);
  if (!resumo.prontaParaConferencia) {
    throw new Error(
      resumo.aRefazer > 0
        ? `Ainda há ${resumo.aRefazer} ponto(s) marcado(s) para refazer.`
        : `Faltam ${resumo.pendentes} ponto(s) sem medição.`,
    );
  }
  await updateStatus(ordem.id, 'finalizada');
}

/** Conferência aprovada — é este status que autoriza o PDF final. */
export async function aprovarCertificacao(id: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  await updateStatus(id, 'aprovada', {
    aprovado_por: userData.user?.id ?? null,
    aprovado_em: new Date().toISOString(),
    motivo_devolucao: null,
  });
}

/**
 * Conferência devolvida: a OS volta para o técnico e os pontos escolhidos
 * ficam marcados. A medição anterior NÃO é apagada — ela continua visível em
 * campo, para o técnico saber o que tinha medido antes de medir de novo.
 */
export async function devolverCertificacao(
  ordemId: string,
  motivo: string,
  pontosParaRefazer: string[],
): Promise<void> {
  if (pontosParaRefazer.length === 0) throw new Error('Marque ao menos um ponto para refazer.');

  const { error } = await supabase
    .from('pontos_certificacao')
    .update({ refazer: true, motivo_refazer: motivo || null })
    .in('id', pontosParaRefazer);
  if (error) throw error;

  await updateStatus(ordemId, 'reaberta', { motivo_devolucao: motivo || null });
}

export async function removeOrdemCertificacao(ordem: OrdemCertificacao): Promise<void> {
  const { error } = await supabase.from('ordens_certificacao').delete().eq('id', ordem.id);
  if (error) throw error;
  // As linhas de ponto somem por cascade; as fotos, não — o bucket não sabe da OS.
  await Promise.all(
    ordem.pontos.filter((p) => p.storagePath).map((p) => deleteFotoCertificacaoFromStorage(p.storagePath as string)),
  );
}

/**
 * Mesma consulta de técnicos da vistoria — quem executa rota de vistoria é o
 * mesmo perfil que certifica obra. Reexportado com o nome do módulo para as
 * telas daqui não precisarem importar do módulo vizinho.
 */
export { listTecnicosParaVistoria as listTecnicosParaCertificacao } from '@/lib/vistoriaService';
