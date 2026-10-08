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
  | 'finalizada'
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

export type CategoriaFotoOS = 'antes' | 'depois';

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

  /** Ponte manual pro app "Aniel" até existir integração via API — editável na aba Encerramento, opcionalmente já preenchida na delegação. */
  referenciaExterna?: string | null;

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
  // Terminal do ponto de vista do técnico — não depende de nenhuma aprovação
  // manual do gestor/supervisor pra "valer". Supervisor só intervém se
  // precisar reabrir pra retrabalho (ver AbaAprovacao em ManutencaoOrderDetail.tsx).
  finalizada: 'Finalizada',
  // Encerramento definitivo pelo gestor/supervisor — reaproveita o valor
  // 'aprovada' do banco (já existe na constraint/trigger desde a 0013), só
  // com um rótulo que não reintroduz a ideia de "aprovação obrigatória" que
  // o fluxo deixou de exigir.
  aprovada: 'Encerrada',
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

/**
 * Os cinco templates de manutenção. Cada um abre a SUA árvore de atividades
 * (`ATIVIDADES_POR_TIPO`) — antes havia uma lista única de problemas de CTO
 * para todo tipo de OS, o que obrigava quem abre uma preventiva de backbone a
 * procurar a atividade dela no meio de drop e splitter.
 *
 * A troca também é o que permite o relatório discriminar quantidade por
 * atividade e por estado: com vocabulário por template, "cabo baixo no BKB" e
 * "drop danificado na CTO" deixam de cair no mesmo balaio.
 *
 * OS abertas antes desta mudança guardam tipos que não estão mais aqui
 * ('Manutenção Corretiva', 'Instalação', 'Vistoria Técnica'...). Elas seguem
 * sendo exibidas e filtradas pelo tipo que têm; a lista abaixo só governa o
 * que pode ser aberto de agora em diante.
 */
export const TIPOS_MANUTENCAO = [
  'Preventiva BKB',
  'Preventiva Rede Acesso (GPON)',
  'Preventiva CTO',
  'Identificação',
  'Troca de Poste',
] as const;

export type TipoManutencao = (typeof TIPOS_MANUTENCAO)[number];

/**
 * Explícito em vez de `TIPOS_MANUTENCAO[0]`: o padrão não é "o primeiro da
 * lista", e deixá-lo posicional faria reordenar o seletor trocar o padrão sem
 * querer. É o tipo que o fluxo de vistoria mais gera.
 */
export const TIPO_MANUTENCAO_PADRAO: TipoManutencao = 'Preventiva CTO';

export interface GrupoDeAtividades {
  /** Sem título quando a árvore é curta o bastante para não precisar de seções. */
  grupo?: string;
  itens: string[];
}

/**
 * A árvore de atividades de cada template, na ordem e com a grafia definidas
 * pela operação — é esse texto que vai para o banco, para o PDF e para a
 * contagem do relatório, então mudá-lo exige migrar o histórico junto (ver
 * supabase/migrations/0024_atividades_por_tipo.sql).
 *
 * A mesma atividade aparece em mais de uma árvore quando cabe em mais de um
 * serviço ('Cabo Solto' está no BKB, no GPON e na troca de poste). O texto é
 * o mesmo nos três de propósito: o relatório soma por atividade, e duas
 * grafias virariam duas linhas.
 */
export const ATIVIDADES_POR_TIPO: Record<TipoManutencao, GrupoDeAtividades[]> = {
  'Preventiva BKB': [
    {
      grupo: 'Cabo',
      itens: [
        'Cabo não identificado',
        'Cabo Solto',
        'Sobra Tec. acomodada indevidamente ou não acomodada',
        'cabo baixo',
        'Cruzamento abaixo de 5m',
      ],
    },
    {
      grupo: 'Espinação e cordoalha',
      itens: ['Espinação Solta', 'Espinação Arrebentada', 'Cordoalha arrebentada'],
    },
    {
      grupo: 'Caixa subterrânea e CEO',
      itens: [
        'Caixa Sub sem tampa',
        'Cabo enterrado Exposto (cabo/ceo)',
        'Subida lateral faltando acabamento (Duto/Canaleta/Fita de aço/Plaqueta)',
        'CEO fora da caixa Sub',
      ],
    },
    {
      grupo: 'Vegetação',
      itens: ['Necessidade de aceiro', 'necessidade de Poda de árvore', 'necessidade de roçada'],
    },
    {
      grupo: 'Poste',
      itens: [
        'Poste de madeira/concreto quebrado',
        'Poste fora de Prumo',
        'Poste fletido',
        'Realocação de poste',
        'poste baixo (cruzamento de rua)',
      ],
    },
  ],

  'Preventiva Rede Acesso (GPON)': [
    {
      grupo: 'Cabo',
      itens: [
        'Cabo não identificado',
        'Cabo Solto',
        'Sobra Tec. acomodada indevidamente ou não acomodada',
        'cabo baixo',
        'Cruzamento abaixo de 5m',
      ],
    },
    {
      grupo: 'Espinação e cordoalha',
      itens: ['Espinação Solta', 'Espinação Arrebentada', 'Cordoalha arrebentada'],
    },
  ],

  'Preventiva CTO': [
    {
      grupo: 'CTO',
      itens: ['CTO Quebrada', 'CTO Sem Tampa', 'CTO Solta', 'CTO Apresenta Infestação de Formigas'],
    },
    {
      grupo: 'Splitter',
      itens: ['Splitter Quebrado', 'Splitter Atenuado', 'Splitter Roubado'],
    },
    {
      grupo: 'Adaptador/acoplador',
      itens: ['Adaptador/Acoplador Danificado', 'Adaptador/Acoplador Roubado'],
    },
    {
      grupo: 'Drop',
      itens: [
        'Drop Danificado',
        'Drop sem anilha de Identificação',
        'Drop com conector quebrado',
        'Drop com atenuação',
      ],
    },
  ],

  Identificação: [
    {
      itens: [
        'Numeração incompleta',
        'Numeração incorreta',
        'CTO com identificação interna (falta externa)',
      ],
    },
  ],

  'Troca de Poste': [
    {
      itens: [
        'Cabo Solto',
        'Faltando BAP',
        'CTO Solta',
        'Drop Solto',
        'CEO Solta',
        'Cabo cortado',
        'Rede sem identificação (plaquetas)',
      ],
    },
  ],
};

/**
 * A árvore do tipo escolhido. Tipo antigo (OS aberta antes dos cinco
 * templates) não tem árvore: devolve vazio em vez de quebrar, e a tela cai no
 * caminho de "descreva na observação".
 */
export const atividadesDoTipo = (tipo: string): GrupoDeAtividades[] =>
  ATIVIDADES_POR_TIPO[tipo as TipoManutencao] ?? [];

/** Lista achatada de tudo que pode ser marcado hoje — para validar e para o relatório. */
export const TODAS_AS_ATIVIDADES = Array.from(new Set(
  Object.values(ATIVIDADES_POR_TIPO).flatMap((grupos) => grupos.flatMap((g) => g.itens)),
));

/**
 * O que a vistoria oferece quando o técnico registra uma pendência em rota:
 * as árvores dos dois tipos de corretiva que a vistoria gera (ver
 * TIPOS_CORRETIVA_VISTORIA em types/vistoria.ts). O que for marcado vira
 * ocorrência e checklist na corretiva, sem ninguém redigitar.
 */
export const ATIVIDADES_VISTORIA: GrupoDeAtividades[] = [
  ...ATIVIDADES_POR_TIPO['Preventiva CTO'],
  ...ATIVIDADES_POR_TIPO['Preventiva Rede Acesso (GPON)'],
];

/**
 * `problemaInformado` é salvo como string serializada por `||` (mesma
 * convenção usada em PhotoCard.tsx pra descrição de fotos) — várias telas
 * (execução, detalhe da OS) precisam do array de volta pra exibir cada
 * ocorrência como item de lista em vez do texto bruto com "||" no meio.
 */
export const deserializeProblemas = (value?: string | null): string[] =>
  value ? value.split('||').map((item) => item.trim()).filter(Boolean) : [];

/** Contraparte de `deserializeProblemas` — usada na abertura da OS e no registro de pendência de vistoria, pra que os dois gravem no mesmo formato. */
export const serializeProblemas = (selected: string[]): string => selected.join('||');

/**
 * A cada atividade reportada (na abertura da OS ou numa ocorrência durante a
 * execução) corresponde uma "solução" — é isso que vira item de checklist, e
 * não a atividade em si (ex: "CTO Quebrada" no checklist não faz sentido
 * marcar como concluído; "CTO reparada/substituída" faz).
 *
 * Atividade sem entrada aqui vira item de checklist com o próprio texto (ver
 * `sincronizarOcorrenciasEChecklist`), então faltar uma não quebra nada — só
 * deixa o checklist esquisito.
 */
export const SOLUCAO_DA_ATIVIDADE: Record<string, string> = {
  // Cabo e espinação (BKB, GPON e troca de poste)
  'Cabo não identificado': 'Cabo identificado (plaqueta instalada)',
  'Cabo Solto': 'Cabo fixado',
  'Sobra Tec. acomodada indevidamente ou não acomodada': 'Sobra técnica acomodada',
  'cabo baixo': 'Altura do cabo corrigida',
  'Cruzamento abaixo de 5m': 'Altura do cruzamento corrigida',
  'Espinação Solta': 'Espinação refeita',
  'Espinação Arrebentada': 'Espinação substituída',
  'Cordoalha arrebentada': 'Cordoalha substituída',
  'Cabo cortado': 'Cabo emendado/substituído',

  // Caixa subterrânea e CEO
  'Caixa Sub sem tampa': 'Tampa da caixa subterrânea reposta',
  'Cabo enterrado Exposto (cabo/ceo)': 'Cabo enterrado protegido/reenterrado',
  'Subida lateral faltando acabamento (Duto/Canaleta/Fita de aço/Plaqueta)': 'Acabamento da subida lateral instalado',
  'CEO fora da caixa Sub': 'CEO reacomodada na caixa subterrânea',
  'CEO Solta': 'CEO fixada',

  // Vegetação
  'Necessidade de aceiro': 'Aceiro executado',
  'necessidade de Poda de árvore': 'Poda executada',
  'necessidade de roçada': 'Roçada executada',

  // Poste
  'Poste de madeira/concreto quebrado': 'Poste substituído',
  'Poste fora de Prumo': 'Poste aprumado',
  'Poste fletido': 'Poste substituído/corrigido',
  'Realocação de poste': 'Poste realocado',
  'poste baixo (cruzamento de rua)': 'Altura do poste corrigida',
  'Faltando BAP': 'BAP instalado',

  // CTO e acessórios
  'CTO Quebrada': 'CTO reparada/substituída',
  'CTO Sem Tampa': 'Tampa da CTO reposta',
  'CTO Solta': 'CTO fixada no poste',
  'CTO Apresenta Infestação de Formigas': 'Infestação eliminada e CTO vedada',
  'Splitter Quebrado': 'Splitter substituído',
  'Splitter Atenuado': 'Splitter substituído/regulado',
  'Splitter Roubado': 'Splitter reinstalado',
  'Adaptador/Acoplador Danificado': 'Adaptador/acoplador substituído',
  'Adaptador/Acoplador Roubado': 'Adaptador/acoplador reinstalado',
  'Drop Danificado': 'Drop substituído',
  'Drop sem anilha de Identificação': 'Anilha de identificação instalada no drop',
  'Drop com conector quebrado': 'Conector do drop substituído',
  'Drop com atenuação': 'Drop substituído/regulado',
  'Drop Solto': 'Drop fixado',

  // Identificação
  'Numeração incompleta': 'Numeração completada',
  'Numeração incorreta': 'Numeração corrigida',
  'CTO com identificação interna (falta externa)': 'Identificação externa da CTO instalada',
  'Rede sem identificação (plaquetas)': 'Plaqueta de identificação instalada na rede',

  // Grafias de antes da migração 0024. A migração reescreve o histórico, mas
  // estas ficam porque uma OS duplicada ou um backup restaurado ainda pode
  // trazer o texto velho — e aí o problema continua gerando a solução certa.
  'CTO quebrada': 'CTO reparada/substituída',
  'CTO sem tampa': 'Tampa da CTO reposta',
  'CTO solta do poste': 'CTO fixada no poste',
  'CTO apresenta infestação de formigas': 'Infestação eliminada e CTO vedada',
  'CTO sem identificação (sem nome)': 'Nome da CTO identificado e cadastrado',
  'CTO não identificada': 'Plaqueta de identificação instalada na rede',
  'CTO sem plaquetas de identificação': 'Plaqueta de identificação instalada na rede',
  'CTO sem identificação': 'Nome da CTO identificado e cadastrado',
  'Rede sem identificação (sem plaqueta)': 'Plaqueta de identificação instalada na rede',
  'Splitter quebrado': 'Splitter substituído',
  'Splitter atenuado': 'Splitter substituído/regulado',
  'Splitter roubado': 'Splitter reinstalado',
  'Adaptador/acoplador danificado': 'Adaptador/acoplador substituído',
  'Adaptador/acoplador roubado': 'Adaptador/acoplador reinstalado',
  'Adaptador/acoplador atenuado': 'Adaptador/acoplador substituído/regulado',
  'Drop danificado': 'Drop substituído',
  'Drop sem anilha de identificação': 'Anilha de identificação instalada no drop',
  'Drop com conector roubado': 'Conector do drop reinstalado',
  'Drop atenuado': 'Drop substituído/regulado',
};

/** Tempo decorrido entre abertura e encerramento (ou "agora", se ainda em aberto) — usado na lista e na exportação Excel. */
export function tempoEmAtendimento(ordem: ManutencaoOrdem): string {
  const fim = ordem.execucaoFimEm || ordem.aprovadoEm || ordem.canceladoEm;
  const fimData = fim ? new Date(fim) : new Date();
  const min = Math.round((fimData.getTime() - new Date(ordem.createdAt).getTime()) / 60000);
  if (min < 60) return `${min}min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `${horas}h`;
  return `${Math.floor(horas / 24)}d`;
}
