// Tipos do módulo compartilhado com o script de relatório (Node puro, sem TS).

export interface OrdemParaRelatorio {
  uf?: string;
  status: string;
  tecnicoId?: string | null;
  dataPrevista?: Date | null;
}

export interface LinhaDaMatriz {
  chave: string;
  porUf: Record<string, number>;
  total: number;
}

export interface ResumoDeUf {
  uf: string;
  total: number;
  comTecnico: number;
  encerradas: number;
  vencidas: number;
  situacao: 'Parado' | 'Parcial' | 'Operando';
}

export const ENCERRADOS: string[];
export const FORA_DO_FLUXO: string[];

export function vivas<T extends { status: string }>(ordens: T[]): T[];
export function estaVencida(ordem: OrdemParaRelatorio, agora: Date): boolean;

export function matrizPorUf<T extends { uf?: string }>(
  ordens: T[],
  chavesDe: (ordem: T) => [string, number][],
): LinhaDaMatriz[];

export function resumoPorUf<T extends OrdemParaRelatorio>(ordens: T[], agora: Date): ResumoDeUf[];
