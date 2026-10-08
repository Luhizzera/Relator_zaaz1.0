// shared/relatorioManutencao.mjs

/**
 * Definições que o resumo diário por e-mail (scripts/resumo-atividade.mjs) e o
 * botão Excel do app (src/lib/manutencaoXlsx.ts) precisam compartilhar.
 *
 * Mora fora de `src/` porque os dois rodam em mundos diferentes: o script é
 * Node puro, sem TypeScript, e o app é Vite. ESM simples é o que os dois
 * entendem sem build.
 *
 * E precisam compartilhar porque contam a mesma coisa para o mesmo gestor. Se
 * o e-mail disser 12 e a planilha disser 11, o problema não é qual dos dois
 * está certo — é que ninguém mais confia em nenhum dos dois.
 */

/** Status que tiram a OS da fila: ela não espera mais ninguém. */
export const ENCERRADOS = ['concluida', 'aprovada', 'finalizada'];

/** Encerrados + cancelada: nada aqui pode "vencer" um prazo. */
export const FORA_DO_FLUXO = [...ENCERRADOS, 'cancelada'];

/**
 * Canceladas ficam fora de toda métrica operacional: não esperam técnico, não
 * atrasam e não pertencem ao backlog. Contá-las inflava o total e podia
 * apontar uma OS cancelada como a mais antiga aguardando delegação.
 *
 * Elas continuam na aba de dados brutos, com o rótulo "Cancelada", porque lá a
 * planilha é registro e não painel.
 */
export const vivas = (ordens) => ordens.filter((o) => o.status !== 'cancelada');

/** Passou do prazo e ainda depende de alguém. */
export const estaVencida = (ordem, agora) =>
  !!ordem.dataPrevista && ordem.dataPrevista < agora && !FORA_DO_FLUXO.includes(ordem.status);

/**
 * Matriz "linha × estado": uma linha por chave (tipo de manutenção, atividade),
 * com a quantidade em cada UF e o total.
 *
 * `chavesDe` devolve pares [chave, quantidade] porque uma OS rende uma linha
 * quando a chave é o tipo, e várias quando são as atividades registradas nela.
 *
 * Ordena por volume, e desempata por nome para a ordem não dançar entre duas
 * execuções com os mesmos números.
 */
export function matrizPorUf(ordens, chavesDe) {
  const porChave = new Map();
  for (const ordem of ordens) {
    const uf = ordem.uf || '—';
    for (const [chave, quantidade] of chavesDe(ordem)) {
      if (!chave) continue;
      const linha = porChave.get(chave) ?? { chave, porUf: {}, total: 0 };
      linha.porUf[uf] = (linha.porUf[uf] ?? 0) + quantidade;
      linha.total += quantidade;
      porChave.set(chave, linha);
    }
  }
  return [...porChave.values()]
    .sort((a, b) => b.total - a.total || a.chave.localeCompare(b.chave, 'pt-BR'));
}

/**
 * Um resumo por estado, na ordem de volume — a mesma ordem que vira coluna nas
 * matrizes, para quem lê não ter que reencontrar o estado a cada tabela.
 *
 * "Situação" é derivada da proporção de ordens com técnico: sem nenhuma, a
 * região está parada; de 70% para cima, operando; no meio, parcial.
 */
export function resumoPorUf(ordens, agora) {
  const porUf = new Map();
  for (const o of ordens) {
    const uf = o.uf || '—';
    const r = porUf.get(uf) ?? { uf, total: 0, comTecnico: 0, encerradas: 0, vencidas: 0 };
    r.total += 1;
    if (o.tecnicoId) r.comTecnico += 1;
    if (ENCERRADOS.includes(o.status)) r.encerradas += 1;
    if (estaVencida(o, agora)) r.vencidas += 1;
    porUf.set(uf, r);
  }
  return [...porUf.values()]
    .map((r) => ({
      ...r,
      situacao: r.comTecnico === 0 ? 'Parado' : (r.comTecnico / r.total >= 0.7 ? 'Operando' : 'Parcial'),
    }))
    .sort((a, b) => b.total - a.total);
}
