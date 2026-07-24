// src/types/manutencao.ts

/**
 * Domínio de Manutenção (Field Service).
 *
 * IMPORTANTE — separação de responsabilidades:
 * Este é um domínio DIFERENTE do "Relatório Fotográfico" (report.ts).
 * Mesmo que hoje ambos rodem sobre dados mockados/temporários, eles
 * representam conceitos de negócio distintos (uma "OS de manutenção" tem
 * ciclo de vida, aprovação e SLA; uma "ordem de relatório" é só um conjunto
 * de fotos + checklist). Não force os dois a compartilhar o mesmo shape
 * só porque parecem "parecidos" agora — isso é o tipo de acoplamento que
 * vira dívida técnica difícil de desfazer depois.
 */

export type PrioridadeOS = 'baixa' | 'media' | 'alta' | 'critica';

export type StatusOS =
  | 'aberta'
  | 'atribuida'
  | 'recebida'
  | 'deslocamento'
  | 'no_local'
  | 'em_execucao'
  | 'pausada'
  | 'aguardando_aprovacao'
  | 'aprovada'
  | 'reaberta'
  | 'cancelada'
  | 'concluida';

export interface OcorrenciaOS {
  id: string;
  tipo: string;
  categoria: string;
  descricao: string;
  observacao?: string;
  quantidade: number;
}

export interface MaterialOS {
  id: string;
  material: string;
  quantidade: number;
  unidade: string;
  observacao?: string;
  valor?: number;
}

export type EstadoChecklistItem = 'pendente' | 'concluido' | 'nao_aplica';

export interface ChecklistItemOS {
  id: string;
  label: string;
  estado: EstadoChecklistItem;
  observacao?: string;
}

export interface HistoricoEventoOS {
  id: string;
  usuario: string;
  data: string; // ISO string
  acao: string;
  descricao?: string;
}

export type CategoriaFotoOS = 'antes' | 'durante' | 'depois';

export interface FotoOS {
  id: string;
  storagePath: string;
  categoria: CategoriaFotoOS;
  descricao?: string;
  createdAt: string;
}

export interface VideoOS {
  id: string;
  storagePath: string;
  descricao?: string;
  createdAt: string;
}

export interface ManutencaoOrdem {
  id: string;
  numero: string; // ex: "OS-2026-0001"

  tipo: string;
  origem: string;
  prioridade: PrioridadeOS;
  status: StatusOS;

  solicitante: string;
  setor?: string;
  responsavel?: string;
  responsavelId?: string | null;

  uf?: string;
  municipio?: string;
  bairro?: string;
  endereco?: string;
  numeroEndereco?: string;
  referencia?: string;
  latitude?: number;
  longitude?: number;

  problemaInformado?: string;
  observacoes?: string;

  // `equipe`/`tecnico` são os nomes (denormalizados, prontos pra exibir na
  // UI); `equipeId`/`tecnicoId` são os uuids reais usados nas mutações
  // (assignTecnico etc.) — ver nota de dívida técnica em
  // DelegarTecnicoModal.tsx sobre por que isso deixou de ser por nome.
  equipe?: string;
  equipeId?: string | null;
  tecnico?: string;
  tecnicoId?: string | null;
  dataPrevista?: string;
  horarioPrevisto?: string;

  execucaoInicioEm?: string | null;
  execucaoFimEm?: string | null;

  // Usados a partir da aba Aprovação (Fase 3) — já fazem parte do shape
  // desde a Fase 1 pra não exigir outra migração de coluna depois.
  aprovadoPor?: string | null;
  aprovadoEm?: string | null;
  motivoRecusa?: string | null;
  canceladoEm?: string | null;
  motivoCancelamento?: string | null;

  ocorrencias: OcorrenciaOS[];
  materiais: MaterialOS[];
  checklist: ChecklistItemOS[];
  historico: HistoricoEventoOS[];
  fotos: FotoOS[];
  videos: VideoOS[];

  createdAt: string;
  updatedAt: string;
}

export const STATUS_LABEL: Record<StatusOS, string> = {
  aberta: 'Aberta',
  atribuida: 'Atribuída',
  recebida: 'Recebida',
  deslocamento: 'Em deslocamento',
  no_local: 'No local',
  em_execucao: 'Em execução',
  pausada: 'Pausada',
  // Do ponto de vista do técnico, a atividade em campo terminou aqui —
  // "aguardando aprovação" é jargão interno; quem decide/vê a fila de
  // aprovação já sabe que esse status significa "falta o gestor aprovar"
  // (ver AbaAprovacao em ManutencaoOrderDetail.tsx).
  aguardando_aprovacao: 'Finalizada',
  aprovada: 'Aprovada',
  // Retrabalho: gestor/supervisor devolveu a OS pro técnico com uma
  // observação adicional, mas SEM apagar nada do que já foi registrado
  // (ocorrências, materiais, checklist, fotos continuam intactos).
  reaberta: 'Retrabalho',
  cancelada: 'Cancelada',
  concluida: 'Concluída',
};

export const PRIORIDADE_LABEL: Record<PrioridadeOS, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  critica: 'Crítica',
};

// Opções de checklist de problemas de CTO — usadas tanto na abertura da OS
// (NovaOrdemManutencao.tsx, "Problema informado") quanto no registro de
// ocorrências durante a execução (ManutencaoExecucaoMobile.tsx), pra ser
// exatamente a mesma caixa de seleção nos dois lugares. Agrupadas por
// família de equipamento — uma lista de 14 itens sem separação virava uma
// parede de texto pra escanear no celular.
export const PROBLEMAS_CTO_GRUPOS: { grupo: string; itens: string[] }[] = [
  {
    grupo: 'CTO',
    itens: ['CTO quebrada', 'CTO sem tampa', 'CTO solta do poste'],
  },
  {
    grupo: 'Splitter',
    itens: ['Splitter quebrado', 'Splitter atenuado', 'Splitter roubado'],
  },
  {
    grupo: 'Adaptador/acoplador',
    itens: ['Adaptador/acoplador danificado', 'Adaptador/acoplador roubado', 'Adaptador/acoplador atenuado'],
  },
  {
    grupo: 'Drop',
    itens: [
      'Drop danificado',
      'Drop sem anilha de identificação',
      'Drop com conector quebrado',
      'Drop com conector roubado',
      'Drop atenuado',
    ],
  },
];

/** Lista achatada — pra código que só precisa iterar/validar sem se importar com o agrupamento (ex: `SOLUCAO_PROBLEMA_CTO`). */
export const PROBLEMAS_CTO = PROBLEMAS_CTO_GRUPOS.flatMap((g) => g.itens);

// A cada problema reportado (na abertura da OS ou numa ocorrência durante a
// execução) corresponde uma "solução" — é isso que vira item de checklist,
// não o problema em si (ex: "CTO quebrada" no checklist não faz sentido
// marcar como concluído; "CTO reparada" faz).
export const SOLUCAO_PROBLEMA_CTO: Record<string, string> = {
  'CTO quebrada': 'CTO reparada/substituída',
  'CTO sem tampa': 'Tampa da CTO reposta',
  'CTO solta do poste': 'CTO fixada no poste',
  'Splitter quebrado': 'Splitter substituído',
  'Splitter atenuado': 'Splitter substituído/regulado',
  'Splitter roubado': 'Splitter reinstalado',
  'Adaptador/acoplador danificado': 'Adaptador/acoplador substituído',
  'Adaptador/acoplador roubado': 'Adaptador/acoplador reinstalado',
  'Adaptador/acoplador atenuado': 'Adaptador/acoplador substituído/regulado',
  'Drop danificado': 'Drop substituído',
  'Drop sem anilha de identificação': 'Anilha de identificação instalada no drop',
  'Drop com conector quebrado': 'Conector do drop substituído',
  'Drop com conector roubado': 'Conector do drop reinstalado',
  'Drop atenuado': 'Drop substituído/regulado',
};
