// src/lib/consultaEmLotes.ts
import { supabase } from '@/lib/supabaseClient';

/**
 * Dois limites do PostgREST que este app já bateu em produção — e que não dão
 * erro nenhum que ajude a entender o que aconteceu:
 *
 * 1. O filtro vai na URL. Um `in.(id1,id2,...)` com os 631 ids de OS gera uns
 *    24 KB de query string, e aí o gateway responde `400 Bad Request` em texto
 *    puro: sem `code`, sem `details`, sem `hint`. Na tela isso chega como
 *    "deu erro ao carregar" e parece que o banco caiu. Medido no projeto:
 *    300 ids passam, 631 não.
 *
 * 2. O projeto corta a resposta em 1000 linhas (`db-max-rows`). Passar disso
 *    NÃO é erro: vêm 1000 linhas e pronto. Era isso que fazia o checklist
 *    (4505 linhas no banco) e o histórico (7672) chegarem incompletos sem
 *    ninguém perceber.
 *
 * Toda leitura que varre várias OS de uma vez passa por aqui: lotes pequenos
 * de ids para a URL caber, e paginação até a última linha para não truncar.
 */

/** 150 UUIDs dão ~5,9 KB de query string — bem abaixo do limite medido. */
const IDS_POR_LOTE = 150;

/** Teto do servidor. Página menor que isso quer dizer que acabou. */
const LINHAS_POR_PAGINA = 1000;

export interface Ordenacao {
  coluna: string;
  ascendente?: boolean;
}

/** O builder do supabase-js é tipado pelo schema gerado, que este projeto não usa. */
type Consulta = any;

/** Lê página por página até a resposta vir menor que o teto. */
async function paginar<T>(montarConsulta: () => Consulta): Promise<T[]> {
  const linhas: T[] = [];
  for (let inicio = 0; ; inicio += LINHAS_POR_PAGINA) {
    const { data, error } = await montarConsulta().range(inicio, inicio + LINHAS_POR_PAGINA - 1);
    if (error) throw error;
    const pagina = (data ?? []) as T[];
    linhas.push(...pagina);
    if (pagina.length < LINHAS_POR_PAGINA) return linhas;
  }
}

/**
 * `id` entra sempre como critério de desempate: sem uma ordem total, duas
 * linhas com o mesmo `created_at` podem cair nas duas páginas (duplicata) ou
 * em nenhuma (furo), porque cada página é uma consulta nova no servidor.
 */
function ordenar(consulta: Consulta, ordenacao?: Ordenacao): Consulta {
  const comOrdem = ordenacao
    ? consulta.order(ordenacao.coluna, { ascending: ordenacao.ascendente ?? true })
    : consulta;
  return comOrdem.order('id', { ascending: true });
}

function dividirEmLotes(ids: string[]): string[][] {
  const lotes: string[][] = [];
  for (let i = 0; i < ids.length; i += IDS_POR_LOTE) lotes.push(ids.slice(i, i + IDS_POR_LOTE));
  return lotes;
}

/**
 * Linhas filhas de um conjunto de ids (ex: todas as fotos das OS visíveis).
 *
 * A ordem pedida vale dentro de cada id, que é o que a UI usa — cada id cai
 * em um lote só, e dentro do lote a ordenação é a do banco.
 */
export async function buscarPorIds<T>(
  tabela: string,
  coluna: string,
  ids: string[],
  ordenacao?: Ordenacao,
): Promise<T[]> {
  if (ids.length === 0) return [];
  const porLote = await Promise.all(
    dividirEmLotes(ids).map((lote) =>
      paginar<T>(() => ordenar(supabase.from(tabela).select('*').in(coluna, lote), ordenacao)),
    ),
  );
  return porLote.flat();
}

/** Uma listagem inteira, sem o corte em 1000 linhas. `filtrar` recebe a consulta pronta pra receber `.eq()`, `.neq()` etc. */
export async function buscarTudo<T>(
  tabela: string,
  select: string,
  ordenacao?: Ordenacao,
  filtrar?: (consulta: Consulta) => Consulta,
): Promise<T[]> {
  return paginar<T>(() => {
    const base = supabase.from(tabela).select(select);
    return ordenar(filtrar ? filtrar(base) : base, ordenacao);
  });
}

/** Escrita (update/delete) filtrada por uma lista de ids, dividida pelo mesmo motivo do item 1. */
export async function escreverPorIds(
  ids: string[],
  escrever: (lote: string[]) => PromiseLike<{ error: unknown }>,
): Promise<void> {
  for (const lote of dividirEmLotes(ids)) {
    const { error } = await escrever(lote);
    if (error) throw error;
  }
}
