// src/types/certificacao.ts

/**
 * Domínio de Certificação — irmão do de Vistoria (ver types/vistoria.ts).
 *
 * Uma "OS de Certificação" é uma obra nova a atestar: o gestor abre a OS com a
 * lista de CTOs, cada uma com o sinal ESPERADO de projeto. Em campo, o técnico
 * mede cada CTO, fotografa a caixa junto do powermeter e registra o sinal
 * MEDIDO. No fim, o gestor confere ponto a ponto e aprova ou devolve.
 *
 * Diferente da vistoria, a lista de pontos é fechada na abertura: o técnico não
 * acrescenta CTO em campo, ele mede o que foi planejado (ver policies de
 * `pontos_certificacao` na migração 0023).
 */

export type StatusOrdemCertificacao =
  | 'aberta'
  | 'em_andamento'
  | 'finalizada'
  | 'aprovada'
  | 'reaberta'
  | 'cancelada';

export const STATUS_CERTIFICACAO_LABEL: Record<StatusOrdemCertificacao, string> = {
  aberta: 'Aberta',
  em_andamento: 'Em andamento',
  // Técnico terminou de medir; espera a conferência do gestor.
  finalizada: 'Aguardando conferência',
  // Encerramento definitivo — é este status que autoriza emitir o PDF final.
  aprovada: 'Certificada',
  // Gestor devolveu: existem pontos marcados para refazer.
  reaberta: 'Devolvida',
  cancelada: 'Cancelada',
};

/**
 * Quanto o sinal medido pode ficar pior que o esperado e ainda passar. Fica na
 * OS (coluna `margem_db`), não no código: obra diferente negocia tolerância
 * diferente, e o valor precisa aparecer no PDF junto do resultado.
 */
export const MARGEM_DB_PADRAO = 3;

export interface PontoCertificacao {
  id: string;
  ordemCertificacaoId: string;

  // Planejado pelo gestor.
  nomeCto: string;
  latitude: number;
  longitude: number;
  sinalEsperadoDbm: number;
  ordemIndex: number;

  // Medido em campo. Nulo = ainda não certificado.
  sinalMedidoDbm?: number | null;
  /** Foto da CTO junto do powermeter — é o que sustenta a medição no PDF. */
  storagePath?: string | null;
  observacao?: string | null;
  medidoPor?: string | null;
  medidoEm?: string | null;

  // Conferência do gestor.
  refazer: boolean;
  motivoRefazer?: string | null;

  createdAt: string;
}

export interface OrdemCertificacao {
  id: string;
  numero: string;
  titulo: string;
  status: StatusOrdemCertificacao;
  margemDb: number;

  equipe?: string;
  equipeId?: string | null;
  tecnico?: string;
  tecnicoId?: string | null;
  responsavel?: string;
  responsavelId?: string | null;

  dataPrevista?: string | null;
  observacoes?: string | null;

  aprovadoPor?: string | null;
  aprovadoEm?: string | null;
  motivoDevolucao?: string | null;

  pontos: PontoCertificacao[];

  createdAt: string;
  updatedAt: string;
}

export type ResultadoPonto = 'pendente' | 'aprovado' | 'reprovado';

export const RESULTADO_LABEL: Record<ResultadoPonto, string> = {
  pendente: 'A medir',
  aprovado: 'Aprovado',
  reprovado: 'Reprovado',
};

/**
 * Pior sinal que ainda passa. Sinal óptico é negativo e quanto MENOR o número,
 * pior a potência — por isso a margem subtrai: esperado -18 com margem 3 aceita
 * até -21.
 */
export const limiteAceitavelDbm = (sinalEsperadoDbm: number, margemDb: number) => sinalEsperadoDbm - margemDb;

/**
 * Resultado SEMPRE calculado, nunca gravado — mesmo princípio da cor do pino da
 * vistoria (decisão 3-A da migração 0018). Corrigir a margem da OS reclassifica
 * os pontos sozinho, em vez de deixar um resultado velho contradizendo a regra.
 */
export function resultadoDoPonto(ponto: PontoCertificacao, margemDb: number): ResultadoPonto {
  if (ponto.sinalMedidoDbm == null) return 'pendente';
  return ponto.sinalMedidoDbm >= limiteAceitavelDbm(ponto.sinalEsperadoDbm, margemDb) ? 'aprovado' : 'reprovado';
}

export interface ResumoCertificacao {
  total: number;
  medidos: number;
  aprovados: number;
  reprovados: number;
  pendentes: number;
  /** Pontos que o gestor devolveu para refazer — continuam medidos, mas não valem. */
  aRefazer: number;
  /** Todos medidos e nenhum aguardando refação: é o que libera "Finalizar". */
  prontaParaConferencia: boolean;
}

export function resumoCertificacao(ordem: OrdemCertificacao): ResumoCertificacao {
  const resultados = ordem.pontos.map((p) => resultadoDoPonto(p, ordem.margemDb));
  const medidos = resultados.filter((r) => r !== 'pendente').length;
  const aRefazer = ordem.pontos.filter((p) => p.refazer).length;
  return {
    total: ordem.pontos.length,
    medidos,
    aprovados: resultados.filter((r) => r === 'aprovado').length,
    reprovados: resultados.filter((r) => r === 'reprovado').length,
    pendentes: resultados.filter((r) => r === 'pendente').length,
    aRefazer,
    prontaParaConferencia: ordem.pontos.length > 0 && medidos === ordem.pontos.length && aRefazer === 0,
  };
}

/**
 * Lê o que foi digitado num campo de sinal. Aceita vírgula (teclado brasileiro)
 * e o sinal de menos.
 *
 * Não completa o sinal sozinho: "18,4" vira +18,4 e não -18,4. Potência óptica
 * em CTO é negativa, então um valor positivo é quase sempre erro de digitação —
 * mas adivinhar o sinal esconderia esse erro justamente onde ele muda o
 * resultado (qualquer positivo passa por qualquer limite negativo). Quem chama
 * avisa; ver o alerta de sinal positivo na tela de medição.
 */
export function parseDbm(texto: string): number | null {
  const limpo = texto.trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(limpo)) return null;
  const valor = Number(limpo);
  return Number.isFinite(valor) ? valor : null;
}

/** Uma casa decimal e vírgula — como o técnico lê no powermeter e como sai no PDF. */
export const formatarDbm = (valor: number | null | undefined) =>
  valor == null ? '—' : `${valor.toFixed(2).replace('.', ',')} dBm`;
