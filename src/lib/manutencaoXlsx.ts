// src/lib/manutencaoXlsx.ts
import { saveAs } from 'file-saver';
import { ManutencaoOrdem, STATUS_LABEL, PRIORIDADE_LABEL, tempoEmAtendimento } from '@/types/manutencao';
import {
  vivas, estaVencida, matrizPorUf, resumoPorUf, ENCERRADOS,
} from '../../shared/relatorioManutencao.mjs';

/**
 * Exportação de Manutenção em três abas: um painel tratado, a matriz de
 * atividades por estado e os dados brutos.
 *
 * Antes saía só o despejo da lista. Dado bruto serve para auditar, mas obriga
 * o gestor a refazer no Excel a mesma apuração que o resumo diário por e-mail
 * já faz — e a refazer do jeito dele, que não bate com o do e-mail.
 *
 * A apuração vem de `shared/relatorioManutencao.mjs`, o mesmo módulo que o
 * script do e-mail usa: as duas peças respondem ao mesmo gestor e não podem
 * divergir.
 *
 * Sobre "interativa": as abas de matriz e de dados saem como Tabela do Excel
 * de verdade (filtro em cada coluna, faixas alternadas, intervalo nomeado), o
 * que permite filtrar, ordenar e inserir uma Tabela Dinâmica em dois cliques.
 * Uma Tabela Dinâmica JÁ montada não dá: o exceljs não escreve esse tipo de
 * objeto, e forjar o XML à mão produziria arquivo que o Excel recusa a abrir.
 */

const VERDE = 'FF1F6F68';
const CINZA = 'FFF3F6F6';

type Celula = string | number | Date | null;

/** Uma atividade pode ter quantidade > 1 na mesma OS — a coluna existe no banco. */
const atividadesDaOrdem = (o: ManutencaoOrdem): [string, number][] =>
  o.ocorrencias.map((oc) => [(oc.tipo ?? '').trim(), Number(oc.quantidade) || 1]);

export async function exportManutencaoXlsx(
  ordens: ManutencaoOrdem[],
  opts: { arquivo?: string; escopo?: string } = {},
): Promise<void> {
  const { default: ExcelJS } = await import('exceljs');
  const agora = new Date();

  const wb = new ExcelJS.Workbook();
  wb.creator = 'SurveyOS';
  wb.created = agora;

  const operacionais = vivas(ordens);
  const ufs = resumoPorUf(operacionais, agora);
  const colunasUf = ufs.map((r) => r.uf);
  const tipos = matrizPorUf(operacionais, (o) => [[o.tipo, 1]]);
  const atividades = matrizPorUf(operacionais, atividadesDaOrdem);

  // ── Aba 1: painel ────────────────────────────────────────────────────────
  const painel = wb.addWorksheet('Painel', { views: [{ state: 'frozen', ySplit: 3 }] });
  painel.getColumn(1).width = 46;
  for (let i = 0; i < colunasUf.length + 2; i++) painel.getColumn(i + 2).width = 13;

  let linha = 1;

  const titulo = (texto: string) => {
    const l = painel.getRow(linha);
    l.getCell(1).value = texto;
    l.getCell(1).font = { bold: true, size: 12, color: { argb: VERDE } };
    linha += 1;
  };

  const textoSolto = (texto: string) => {
    painel.getRow(linha).getCell(1).value = texto;
    painel.getRow(linha).getCell(1).font = { size: 9, color: { argb: 'FF667A80' } };
    linha += 1;
  };

  /** Uma tabela do Excel de verdade: cabeçalho com filtro e faixas alternadas. */
  const tabela = (nome: string, cabecalho: string[], linhas: Celula[][]) => {
    painel.addTable({
      name: nome,
      ref: `A${linha}`,
      headerRow: true,
      style: { theme: 'TableStyleLight13', showRowStripes: true },
      columns: cabecalho.map((c) => ({ name: c, filterButton: true })),
      // O Excel recusa a abrir um arquivo com tabela sem nenhuma linha de
      // dados, então uma linha vazia entra no lugar quando não há o que mostrar.
      rows: linhas.length ? linhas : [cabecalho.map(() => '')],
    });
    linha += (linhas.length || 1) + 2;
  };

  titulo('PAINEL DE MANUTENÇÃO');
  textoSolto(`Gerado em ${agora.toLocaleString('pt-BR')}`
    + (opts.escopo ? ` · ${opts.escopo}` : '')
    + ` · ${ordens.length - operacionais.length} cancelada(s) fora das contas abaixo`);
  linha += 1;

  tabela('Resumo', ['Indicador', 'Quantidade'], [
    ['Ordens no período', operacionais.length],
    ['Encerradas', operacionais.filter((o) => ENCERRADOS.includes(o.status)).length],
    ['Sem técnico', operacionais.filter((o) => !o.tecnicoId).length],
    ['Com prazo vencido', operacionais.filter((o) => estaVencida(o, agora)).length],
    ['Atividades registradas', atividades.reduce((t, a) => t + a.total, 0)],
  ]);

  titulo('SITUAÇÃO POR ESTADO');
  tabela('PorEstado', ['UF', 'Situação', 'Ordens', 'Com técnico', 'Encerradas', 'Vencidas'],
    ufs.map((r) => [r.uf, r.situacao, r.total, r.comTecnico, r.encerradas, r.vencidas]));

  titulo('ORDENS POR TIPO E ESTADO');
  tabela('PorTipo', ['Tipo de manutenção', ...colunasUf, 'Total'],
    tipos.map((l) => [l.chave, ...colunasUf.map((uf) => l.porUf[uf] ?? 0), l.total]));

  // ── Aba 2: a matriz que motivou tudo ─────────────────────────────────────
  const abaAtiv = wb.addWorksheet('Atividades por estado', {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }],
  });
  abaAtiv.columns = [
    { header: 'Atividade', key: 'atividade', width: 52 },
    ...colunasUf.map((uf) => ({ header: uf, key: `uf_${uf}`, width: 11 })),
    { header: 'Total', key: 'total', width: 11 },
  ];
  abaAtiv.addTable({
    name: 'AtividadesPorEstado',
    ref: 'A1',
    headerRow: true,
    style: { theme: 'TableStyleLight13', showRowStripes: true },
    columns: [{ name: 'Atividade', filterButton: true },
      ...colunasUf.map((uf) => ({ name: uf, filterButton: true })),
      { name: 'Total', filterButton: true }],
    rows: atividades.length
      ? atividades.map((l) => [l.chave, ...colunasUf.map((uf) => l.porUf[uf] ?? 0), l.total])
      : [['Nenhuma atividade registrada', ...colunasUf.map(() => 0), 0]],
  });

  // ── Aba 3: o dado bruto, que continua sendo o lastro ─────────────────────
  const abaOrdens = wb.addWorksheet('Ordens', { views: [{ state: 'frozen', ySplit: 1 }] });
  const colunas: { nome: string; largura: number; data?: boolean }[] = [
    { nome: 'Número', largura: 16 },
    { nome: 'Status', largura: 20 },
    { nome: 'Prioridade', largura: 12 },
    { nome: 'Tipo', largura: 26 },
    { nome: 'Atividades', largura: 50 },
    { nome: 'Solicitante', largura: 22 },
    { nome: 'UF', largura: 8 },
    { nome: 'Cidade', largura: 18 },
    { nome: 'Bairro', largura: 18 },
    { nome: 'Endereço', largura: 30 },
    { nome: 'UTM', largura: 24 },
    { nome: 'Equipe', largura: 16 },
    { nome: 'Técnico', largura: 20 },
    { nome: 'Prazo', largura: 14, data: true },
    { nome: 'Abertura', largura: 14, data: true },
    { nome: 'Tempo em atendimento', largura: 20 },
  ];
  colunas.forEach((c, i) => {
    abaOrdens.getColumn(i + 1).width = c.largura;
    if (c.data) abaOrdens.getColumn(i + 1).numFmt = 'dd/mm/yyyy';
  });
  abaOrdens.addTable({
    name: 'Ordens',
    ref: 'A1',
    headerRow: true,
    style: { theme: 'TableStyleLight13', showRowStripes: true },
    columns: colunas.map((c) => ({ name: c.nome, filterButton: true })),
    rows: ordens.map((o) => [
      o.numero,
      STATUS_LABEL[o.status] ?? o.status,
      PRIORIDADE_LABEL[o.prioridade] ?? o.prioridade,
      o.tipo,
      // Uma célula por OS; a contagem por atividade está na aba própria.
      o.ocorrencias.map((oc) => oc.tipo).filter(Boolean).join('; '),
      o.solicitante ?? '',
      (o.uf ?? '').toUpperCase(),
      o.municipio ?? '',
      o.bairro ?? '',
      `${o.endereco ?? ''}${o.numeroEndereco ? `, ${o.numeroEndereco}` : ''}`,
      o.latitude != null && o.longitude != null ? `${o.latitude.toFixed(6)}, ${o.longitude.toFixed(6)}` : '',
      o.equipe ?? '',
      o.tecnico ?? '',
      o.dataPrevista ? new Date(o.dataPrevista) : null,
      new Date(o.createdAt),
      tempoEmAtendimento(o),
    ]),
  });

  // Cabeçalho do painel não entra em tabela, então ganha o destaque aqui.
  painel.getRow(1).height = 20;
  [painel, abaAtiv, abaOrdens].forEach((ws) => {
    ws.getRow(1).alignment = { vertical: 'middle' };
  });
  abaAtiv.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CINZA } };

  const buffer = await wb.xlsx.writeBuffer();
  saveAs(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    opts.arquivo ?? `manutencao-${agora.toISOString().slice(0, 10)}.xlsx`,
  );
}
