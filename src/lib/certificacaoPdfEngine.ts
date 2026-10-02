// @ts-nocheck
import jsPDF from 'jspdf';
import {
  OrdemCertificacao, STATUS_CERTIFICACAO_LABEL, RESULTADO_LABEL,
  resultadoDoPonto, resumoCertificacao, limiteAceitavelDbm, formatarDbm, formatarDiferencaDb,
} from '@/types/certificacao';
import { getSignedFotoCertificacaoUrl } from '@/lib/supabaseClient';

/**
 * Exporta o laudo de uma OS de certificação no mesmo padrão visual do
 * relatório fotográfico (pdfEngine.ts) e da OS de manutenção
 * (manutencaoPdfEngine.ts): papel timbrado com logo, caixa amarela de
 * referência, tabela de identificação e grade de fotos em duas colunas.
 *
 * O que muda é o miolo, porque o documento aqui tem outra função: ele ATESTA
 * um resultado. Por isso ganha o veredito em destaque, a tabela ponto a ponto
 * com esperado/medido/diferença e o critério escrito por extenso — quem recebe
 * o PDF precisa poder refazer a conta sem abrir o sistema.
 */

const YELLOW = [234, 179, 8];
const DARK = [30, 41, 59];
const GRAY = [100, 116, 139];
const GREEN = [22, 163, 74];
const RED = [220, 38, 38];
const ZEBRA = [248, 250, 252];

const MARGEM = 10;
const LARGURA_PAGINA = 210;
const ALTURA_UTIL = 280;
const LARGURA_CONTEUDO = LARGURA_PAGINA - MARGEM * 2;

/** Colunas da tabela de pontos. As larguras somam exatamente a área útil. */
const COLUNAS = [
  { titulo: '#', largura: 8, alinhamento: 'left' },
  { titulo: 'CTO', largura: 48, alinhamento: 'left' },
  { titulo: 'UTM', largura: 46, alinhamento: 'left' },
  { titulo: 'Esperado', largura: 22, alinhamento: 'right' },
  { titulo: 'Medido', largura: 22, alinhamento: 'right' },
  { titulo: 'Dif.', largura: 18, alinhamento: 'right' },
  { titulo: 'Resultado', largura: 26, alinhamento: 'center' },
];

async function getLogoBase64(): Promise<string> {
  try {
    const res = await fetch('/images/logo-zaaz.jpeg');
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    return '';
  }
}

/** Baixa a foto pela URL assinada (1h) e converte pra data URL, pra embutir no PDF. */
async function fotoParaDataUrl(storagePath: string): Promise<string | null> {
  try {
    const signedUrl = await getSignedFotoCertificacaoUrl(storagePath);
    if (!signedUrl) return null;
    const res = await fetch(signedUrl);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Dimensões naturais da imagem. Sem elas, `addImage` estica a foto pra moldura. */
function medirImagem(dataUrl: string): Promise<{ largura: number; altura: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ largura: img.naturalWidth, altura: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/** Maior retângulo com a proporção da foto que cabe na moldura, centralizado nela. */
function encaixar(
  dim: { largura: number; altura: number } | null,
  px: number, py: number, pw: number, ph: number,
) {
  if (!dim || !dim.largura || !dim.altura) return { x: px, y: py, w: pw, h: ph };
  const escala = Math.min(pw / dim.largura, ph / dim.altura);
  const w = dim.largura * escala;
  const h = dim.altura * escala;
  return { x: px + (pw - w) / 2, y: py + (ph - h) / 2, w, h };
}

export async function exportCertificacaoPdf(
  ordem: OrdemCertificacao,
  opts: { returnBlob?: boolean } = {},
): Promise<Blob | void> {
  const pdf = new jsPDF('p', 'mm', 'a4');
  let y = MARGEM;

  const logo = await getLogoBase64();
  const resumo = resumoCertificacao(ordem);
  const emitidoEm = new Date().toLocaleDateString('pt-BR');

  // Só o status `aprovada` fecha a certificação (ver STATUS_CERTIFICACAO_LABEL).
  // Antes disso o PDF continua saindo — serve pra conferir e pra circular
  // internamente —, mas vai marcado em toda página, pra que uma prévia não
  // acabe arquivada no lugar do laudo final.
  const previa = ordem.status !== 'aprovada';

  const fotos = await Promise.all(
    ordem.pontos.map(async (ponto, indice) => {
      const dataUrl = ponto.storagePath ? await fotoParaDataUrl(ponto.storagePath) : null;
      return { ponto, indice: indice + 1, dataUrl, dim: dataUrl ? await medirImagem(dataUrl) : null };
    }),
  );
  const comFoto = fotos.filter((f) => f.dataUrl);

  // ── Papel timbrado ────────────────────────────────────────────────────────
  const infoY = MARGEM + 12;
  const infoH = 34;
  const rowH = infoH / 4;
  const col1W = 40;
  const col3W = 42;
  const col2W = LARGURA_CONTEUDO - col1W - col3W;
  const b1 = MARGEM + col1W;
  const b2 = b1 + col2W;
  // A página só é conhecida no fim (a tabela cresce com o número de CTOs),
  // então "Pág X de Y" é carimbado depois, nesta posição.
  const pagX = b2 + 2;
  const pagY = infoY + rowH / 2 + 1.2;

  const drawHeader = () => {
    const refW = 42;
    const refH = 7;
    pdf.setFillColor(YELLOW[0], YELLOW[1], YELLOW[2]);
    pdf.rect(LARGURA_PAGINA - MARGEM - refW, MARGEM, refW, refH, 'F');
    pdf.setDrawColor(0);
    pdf.setLineWidth(0.3);
    pdf.rect(LARGURA_PAGINA - MARGEM - refW, MARGEM, refW, refH, 'D');
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(DARK[0], DARK[1], DARK[2]);
    pdf.text(ordem.numero, LARGURA_PAGINA - MARGEM - refW / 2, MARGEM + 4.5, { align: 'center' });

    pdf.setFontSize(13);
    pdf.setTextColor(0);
    pdf.text('CERTIFICAÇÃO DE SINAL ÓPTICO', LARGURA_PAGINA / 2, MARGEM + 4.5, { align: 'center' });

    pdf.rect(MARGEM, infoY, LARGURA_CONTEUDO, infoH, 'D');
    pdf.line(b1, infoY, b1, infoY + infoH);
    pdf.line(b2, infoY, b2, infoY + infoH);
    for (let r = 1; r < 4; r++) {
      pdf.line(b1, infoY + rowH * r, MARGEM + LARGURA_CONTEUDO, infoY + rowH * r);
    }

    if (logo) {
      try { pdf.addImage(logo, 'JPEG', MARGEM + 5, infoY + 2, 30, 30); } catch { /* logo opcional */ }
    }

    const fillCell = (row: number, label: string, val: string, isRight = false) => {
      const x = isRight ? b2 + 2 : b1 + 2;
      const w = isRight ? col3W - 4 : col2W - 4;
      const yCell = infoY + row * rowH + rowH / 2 + 1.2;
      pdf.setFontSize(7.5);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(YELLOW[0] * 0.6, YELLOW[1] * 0.6, YELLOW[2] * 0.6);
      pdf.text(`${label}:`, x, yCell);
      const labelW = pdf.getTextWidth(`${label}:`);
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(DARK[0], DARK[1], DARK[2]);
      pdf.text(pdf.splitTextToSize(val || '—', w - labelW - 2)[0], x + labelW + 2, yCell);
    };

    fillCell(0, 'Razão Social', 'ZAAZ Telecom');
    fillCell(1, 'Obra', ordem.titulo);
    fillCell(1, 'Status', STATUS_CERTIFICACAO_LABEL[ordem.status], true);
    fillCell(2, 'Equipe', ordem.equipe || '—');
    fillCell(2, 'Técnico', ordem.tecnico || '—', true);
    fillCell(3, 'Margem aceita', `${ordem.margemDb} dB abaixo do esperado`);
    fillCell(3, 'Emitido em', emitidoEm, true);

    // Só o rótulo; o valor entra no carimbo final.
    pdf.setFontSize(7.5);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(YELLOW[0] * 0.6, YELLOW[1] * 0.6, YELLOW[2] * 0.6);
    pdf.text('Pág:', pagX, pagY);

    y = infoY + infoH + 8;
  };

  const novaPagina = () => {
    pdf.addPage();
    drawHeader();
  };

  const ensureSpace = (needed: number) => {
    if (y + needed > ALTURA_UTIL) novaPagina();
  };

  const sectionTitle = (title: string) => {
    ensureSpace(14);
    pdf.setFillColor(YELLOW[0], YELLOW[1], YELLOW[2]);
    pdf.rect(MARGEM, y, LARGURA_CONTEUDO, 7, 'F');
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(DARK[0], DARK[1], DARK[2]);
    pdf.text(title, MARGEM + 2, y + 5);
    y += 11;
  };

  const line = (label: string, value: string) => {
    ensureSpace(6);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
    pdf.text(`${label}:`, MARGEM, y);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(DARK[0], DARK[1], DARK[2]);
    const lines = pdf.splitTextToSize(value || '—', LARGURA_CONTEUDO - 45);
    pdf.text(lines, MARGEM + 45, y);
    y += 5.5 * lines.length;
  };

  drawHeader();

  // ── Veredito ──────────────────────────────────────────────────────────────
  // Primeira coisa da página: é a pergunta que o documento responde.
  const aprovadaDeFato = resumo.total > 0 && resumo.aprovados === resumo.total;
  const corVeredito = aprovadaDeFato ? GREEN : resumo.reprovados > 0 ? RED : GRAY;
  const textoVeredito = resumo.total === 0 ? 'SEM CTOs CADASTRADAS'
    : aprovadaDeFato ? 'TODAS AS CTOs APROVADAS'
      : resumo.reprovados > 0 ? `${resumo.reprovados} DE ${resumo.total} CTOs REPROVADAS`
        : `${resumo.pendentes} DE ${resumo.total} CTOs AINDA NÃO MEDIDAS`;

  pdf.setFillColor(corVeredito[0], corVeredito[1], corVeredito[2]);
  pdf.rect(MARGEM, y, LARGURA_CONTEUDO, 12, 'F');
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(255, 255, 255);
  pdf.text(textoVeredito, LARGURA_PAGINA / 2, y + 8, { align: 'center' });
  y += 16;

  if (previa) {
    pdf.setFillColor(254, 243, 199);
    pdf.rect(MARGEM, y, LARGURA_CONTEUDO, 9, 'F');
    pdf.setFontSize(8.5);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(180, 83, 9);
    pdf.text(
      `PRÉVIA — a certificação ainda não foi aprovada (${STATUS_CERTIFICACAO_LABEL[ordem.status]}). Documento sem valor de laudo.`,
      LARGURA_PAGINA / 2, y + 6, { align: 'center' },
    );
    y += 13;
  }

  // ── Resumo em números ─────────────────────────────────────────────────────
  const caixas = [
    { valor: resumo.total, rotulo: 'CTOs', cor: DARK },
    { valor: resumo.aprovados, rotulo: 'Aprovadas', cor: GREEN },
    { valor: resumo.reprovados, rotulo: 'Reprovadas', cor: RED },
    { valor: resumo.pendentes, rotulo: 'A medir', cor: GRAY },
  ];
  const caixaW = (LARGURA_CONTEUDO - 6) / 4;
  caixas.forEach((caixa, i) => {
    const x = MARGEM + i * (caixaW + 2);
    pdf.setFillColor(ZEBRA[0], ZEBRA[1], ZEBRA[2]);
    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.2);
    pdf.rect(x, y, caixaW, 16, 'FD');
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(caixa.cor[0], caixa.cor[1], caixa.cor[2]);
    pdf.text(String(caixa.valor), x + caixaW / 2, y + 8, { align: 'center' });
    pdf.setFontSize(7);
    pdf.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
    pdf.text(caixa.rotulo.toUpperCase(), x + caixaW / 2, y + 13, { align: 'center' });
  });
  y += 21;

  // O critério vai escrito por extenso: quem recebe o PDF tem que conseguir
  // refazer a conta sem abrir o sistema nem perguntar qual era a margem.
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'italic');
  pdf.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
  pdf.text(
    `Critério: aprova a CTO cujo sinal medido não fique mais de ${ordem.margemDb} dB abaixo do esperado de projeto.`,
    MARGEM, y,
  );
  y += 8;

  // ── Tabela ponto a ponto ──────────────────────────────────────────────────
  sectionTitle(`Pontos certificados (${resumo.total})`);

  const ALTURA_LINHA = 6.5;

  const cabecalhoTabela = () => {
    pdf.setFillColor(YELLOW[0], YELLOW[1], YELLOW[2]);
    pdf.rect(MARGEM, y, LARGURA_CONTEUDO, ALTURA_LINHA, 'F');
    pdf.setFontSize(7.5);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(DARK[0], DARK[1], DARK[2]);
    let x = MARGEM;
    COLUNAS.forEach((coluna) => {
      const alvo = coluna.alinhamento === 'right' ? x + coluna.largura - 2
        : coluna.alinhamento === 'center' ? x + coluna.largura / 2
          : x + 2;
      pdf.text(coluna.titulo, alvo, y + 4.5, { align: coluna.alinhamento });
      x += coluna.largura;
    });
    y += ALTURA_LINHA;
  };

  cabecalhoTabela();

  ordem.pontos.forEach((ponto, indice) => {
    if (y + ALTURA_LINHA > ALTURA_UTIL) {
      novaPagina();
      sectionTitle(`Pontos certificados (${resumo.total}) — continuação`);
      cabecalhoTabela();
    }

    const resultado = resultadoDoPonto(ponto, ordem.margemDb);
    const corResultado = resultado === 'aprovado' ? GREEN : resultado === 'reprovado' ? RED : GRAY;

    if (indice % 2 === 1) {
      pdf.setFillColor(ZEBRA[0], ZEBRA[1], ZEBRA[2]);
      pdf.rect(MARGEM, y, LARGURA_CONTEUDO, ALTURA_LINHA, 'F');
    }

    const valores = [
      String(indice + 1),
      ponto.nomeCto,
      `${ponto.latitude.toFixed(5)}, ${ponto.longitude.toFixed(5)}`,
      formatarDbm(ponto.sinalEsperadoDbm),
      formatarDbm(ponto.sinalMedidoDbm),
      ponto.sinalMedidoDbm == null ? '—' : formatarDiferencaDb(ponto.sinalMedidoDbm, ponto.sinalEsperadoDbm),
      RESULTADO_LABEL[resultado],
    ];

    let x = MARGEM;
    COLUNAS.forEach((coluna, c) => {
      const ultima = c === COLUNAS.length - 1;
      pdf.setFontSize(7.5);
      pdf.setFont('helvetica', ultima ? 'bold' : 'normal');
      if (ultima) pdf.setTextColor(corResultado[0], corResultado[1], corResultado[2]);
      else pdf.setTextColor(DARK[0], DARK[1], DARK[2]);
      const texto = pdf.splitTextToSize(valores[c], coluna.largura - 4)[0];
      const alvo = coluna.alinhamento === 'right' ? x + coluna.largura - 2
        : coluna.alinhamento === 'center' ? x + coluna.largura / 2
          : x + 2;
      pdf.text(texto, alvo, y + 4.5, { align: coluna.alinhamento });
      x += coluna.largura;
    });
    y += ALTURA_LINHA;
  });

  y += 6;

  // ── Observações ───────────────────────────────────────────────────────────
  if (ordem.observacoes || ordem.motivoDevolucao || ordem.aprovadoEm) {
    sectionTitle('Observações');
    if (ordem.observacoes) line('Atividade', ordem.observacoes);
    if (ordem.motivoDevolucao) line('Última devolução', ordem.motivoDevolucao);
    if (ordem.aprovadoEm) line('Aprovada em', new Date(ordem.aprovadoEm).toLocaleString('pt-BR'));
  }

  // ── Grade de fotos ────────────────────────────────────────────────────────
  // A foto da CTO junto do powermeter é o que sustenta cada medição da tabela
  // acima — por isso a legenda repete o sinal, pra foto e número serem lidos
  // juntos sem folhear de volta.
  const espacoX = 8;
  const espacoY = 10;
  const alturaLegenda = 32;
  const pw = (LARGURA_CONTEUDO - espacoX) / 2;

  // Foto de campo sai quase sempre em retrato (celular na vertical). Forçar
  // quatro por página nessa orientação deixa cada foto com ~40 mm de largura, e
  // o visor do powermeter — que é justamente o que a foto prova — vira um
  // borrão. Então retrato usa duas por página, em tamanho de leitura; paisagem
  // mantém a grade 2x2 do relatório fotográfico.
  const proporcoes = comFoto.map((f) => (f.dim ? f.dim.largura / f.dim.altura : 1));
  const retrato = proporcoes.length > 0
    && proporcoes.reduce((t, p) => t + p, 0) / proporcoes.length < 0.95;
  const linhasPorPagina = retrato ? 1 : 2;
  const photosPerPage = linhasPorPagina * 2;
  const ph = retrato ? 138 : 60;
  const totalPaginasFotos = Math.ceil(comFoto.length / photosPerPage);

  for (let pagina = 0; pagina < totalPaginasFotos; pagina++) {
    novaPagina();
    sectionTitle(`Fotos das CTOs (${comFoto.length})`);
    const inicioY = y;

    comFoto.slice(pagina * photosPerPage, (pagina + 1) * photosPerPage).forEach((item, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const px = MARGEM + col * (pw + espacoX);
      const py = inicioY + row * (ph + alturaLegenda + espacoY);
      const { ponto } = item;
      const resultado = resultadoDoPonto(ponto, ordem.margemDb);
      const corResultado = resultado === 'aprovado' ? GREEN : resultado === 'reprovado' ? RED : GRAY;

      // A moldura acompanha a foto encaixada, e não a célula da grade: assim
      // não sobra uma borda vazia em volta de uma foto mais estreita.
      const caixa = encaixar(item.dim, px, py, pw, ph);
      pdf.setDrawColor(0);
      pdf.setLineWidth(0.2);
      pdf.rect(caixa.x, caixa.y, caixa.w, caixa.h, 'D');
      try {
        pdf.addImage(item.dataUrl, 'JPEG', caixa.x + 0.3, caixa.y + 0.3, caixa.w - 0.6, caixa.h - 0.6, undefined, 'MEDIUM');
      } catch { /* foto ilegível, mantém a moldura vazia */ }

      let textY = py + ph + 4;

      pdf.setFontSize(7);
      pdf.setFont('courier', 'bold');
      pdf.setTextColor(0);
      pdf.text(`UTM: ${ponto.latitude.toFixed(5)}, ${ponto.longitude.toFixed(5)}`, caixa.x + caixa.w / 2, textY, { align: 'center' });
      textY += 5;

      pdf.setFontSize(8.5);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(0);
      pdf.text(pdf.splitTextToSize(`${item.indice}. ${ponto.nomeCto}`, caixa.w)[0], caixa.x, textY);
      textY += 4.5;

      pdf.setFontSize(7.5);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(DARK[0], DARK[1], DARK[2]);
      pdf.text(
        `Esperado ${formatarDbm(ponto.sinalEsperadoDbm)} · medido ${formatarDbm(ponto.sinalMedidoDbm)}`,
        caixa.x, textY,
      );
      textY += 4;

      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(corResultado[0], corResultado[1], corResultado[2]);
      const diferenca = ponto.sinalMedidoDbm == null
        ? ''
        : ` (${formatarDiferencaDb(ponto.sinalMedidoDbm, ponto.sinalEsperadoDbm)})`;
      pdf.text(`${RESULTADO_LABEL[resultado]}${diferenca}`, caixa.x, textY);
      textY += 4;

      if (ponto.observacao) {
        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
        pdf.text(pdf.splitTextToSize(ponto.observacao, caixa.w).slice(0, 3), caixa.x, textY);
      }
    });
  }

  // ── Carimbos que dependem do total de páginas ─────────────────────────────
  const totalPaginas = pdf.getNumberOfPages();
  for (let p = 1; p <= totalPaginas; p++) {
    pdf.setPage(p);

    pdf.setFontSize(7.5);
    pdf.setFont('helvetica', 'bold');
    const labelW = pdf.getTextWidth('Pág:');
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(DARK[0], DARK[1], DARK[2]);
    pdf.text(`${p} de ${totalPaginas}`, pagX + labelW + 2, pagY);

    if (previa) marcaDAgua(pdf);
  }

  const blob = pdf.output('blob');
  if (opts.returnBlob) return blob;
  pdf.save(`${ordem.numero}.pdf`);
  return blob;
}

/**
 * "PRÉVIA" atravessada na página. O risco real é uma prévia impressa ser
 * arquivada como laudo; a tarja do topo some quando alguém fotografa ou
 * recorta a folha, a marca d'água não.
 */
function marcaDAgua(pdf: jsPDF) {
  try {
    pdf.saveGraphicsState();
    pdf.setGState(new pdf.GState({ opacity: 0.1 }));
    pdf.setFontSize(72);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(180, 83, 9);
    pdf.text('PRÉVIA', LARGURA_PAGINA / 2, 170, { align: 'center', angle: 35 });
    pdf.restoreGraphicsState();
  } catch {
    // Sem suporte a opacidade: um cinza bem claro cumpre o mesmo papel.
    pdf.setFontSize(72);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(235, 235, 235);
    pdf.text('PRÉVIA', LARGURA_PAGINA / 2, 170, { align: 'center', angle: 35 });
  }
}
