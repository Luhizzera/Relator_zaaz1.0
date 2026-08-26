// src/types/vistoria.ts

/**
 * Domínio de Vistoria — anexo ao de Manutenção (ver types/manutencao.ts).
 *
 * Uma "OS de Vistoria" é uma ROTA: o técnico percorre pontos definidos pelo
 * supervisor e registra pendências (foto + geolocalização + observação) ao
 * longo do caminho, tudo dentro da MESMA ordem de vistoria. Cada pendência
 * pode, depois, gerar uma OS corretiva — e essa OS corretiva é uma
 * `ManutencaoOrdem` normal (tipo "Preventiva CTO"/"Preventiva Rede"), não
 * uma entidade nova. Só a rota e a pendência em si são novas.
 */

import type { ManutencaoOrdem } from './manutencao';

export type StatusOrdemVistoria = 'aberta' | 'em_andamento' | 'concluida' | 'cancelada';

export const STATUS_VISTORIA_LABEL: Record<StatusOrdemVistoria, string> = {
  aberta: 'Aberta',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

export interface PendenciaVistoria {
  id: string;
  ordemVistoriaId: string;
  storagePath: string;
  latitude: number;
  longitude: number;
  observacao?: string | null;
  /**
   * Problemas marcados pelo técnico em campo, serializados por '||' — mesmo
   * vocabulário de PROBLEMAS_CTO_GRUPOS. Vira `problemaInformado` da OS
   * corretiva, que por sua vez gera ocorrências e checklist de solução.
   */
  problemas?: string | null;
  ordemCorretivaId?: string | null;
  criadoPor?: string | null;
  createdAt: string;
}

export interface OrdemVistoria {
  id: string;
  numero: string;
  titulo: string;
  status: StatusOrdemVistoria;

  equipe?: string;
  equipeId?: string | null;
  tecnico?: string;
  tecnicoId?: string | null;
  responsavel?: string;
  responsavelId?: string | null;

  dataPrevista?: string | null;
  /** Rotulada como "Descrição da atividade" na UI — o nome do campo no banco continua `observacoes`. */
  observacoes?: string | null;

  /** Extremos do trajeto, escolhidos no mapa na abertura — referência visual pro técnico saber onde começar/terminar. */
  utmInicioLat?: number | null;
  utmInicioLng?: number | null;
  utmFimLat?: number | null;
  utmFimLng?: number | null;

  pendencias: PendenciaVistoria[];

  createdAt: string;
  updatedAt: string;
}

/**
 * Cor do pino no mapa de backlog — SEMPRE calculada a partir do status da OS
 * corretiva vinculada (Decisão 3-A: nada disso é persistido). Vermelho = sem
 * OS corretiva ainda; laranja = OS aberta e em andamento; verde = OS
 * finalizada/aprovada/concluída. Uma corretiva cancelada volta a exigir
 * atenção, por isso trata como vermelho (a pendência continua sem solução).
 */
export type CorPendencia = 'vermelho' | 'laranja' | 'verde';

const STATUS_CORRETIVA_CONCLUIDOS = new Set(['finalizada', 'aprovada', 'concluida']);

export function corDaPendencia(statusOrdemCorretiva: string | null | undefined): CorPendencia {
  if (!statusOrdemCorretiva || statusOrdemCorretiva === 'cancelada') return 'vermelho';
  return STATUS_CORRETIVA_CONCLUIDOS.has(statusOrdemCorretiva) ? 'verde' : 'laranja';
}

/** Item pronto para o mapa de backlog — pendência + o essencial da OS de vistoria e da corretiva (se existir). */
export interface PendenciaBacklog extends PendenciaVistoria {
  ordemVistoriaNumero: string;
  /** Título da rota — usado pra rotular a "atividade" nos filtros e na exportação. */
  ordemVistoriaTitulo?: string;
  ordemCorretivaNumero?: string | null;
  ordemCorretivaStatus?: string | null;
  ordemCorretiva?: ManutencaoOrdem | null;
  cor: CorPendencia;
}

/** Tipos de OS corretiva gerados a partir de uma pendência — ver TIPOS em NovaOrdemManutencao.tsx. */
export const TIPOS_CORRETIVA_VISTORIA = ['Preventiva CTO', 'Preventiva Rede'] as const;
export type TipoCorretivaVistoria = (typeof TIPOS_CORRETIVA_VISTORIA)[number];
