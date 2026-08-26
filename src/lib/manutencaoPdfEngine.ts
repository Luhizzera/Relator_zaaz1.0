// @ts-nocheck
import jsPDF from 'jspdf';
import { ManutencaoOrdem, STATUS_LABEL, PRIORIDADE_LABEL, deserializeProblemas } from '@/types/manutencao';
import { getSignedFotoManutencaoUrl } from '@/lib/supabaseClient';

/**
 * Exporta um PDF de uma OS de manutenção no mesmo padrão visual do relatório
 * fotográfico (pdfEngine.ts): papel timbrado com logo, caixa amarela de
 * referência, tabela de identificação e grade de fotos 2 colunas — mas com os
 * dados da manutenção (checklist, materiais, ocorrências, UTM da OS) em vez
 * dos campos do relatório.
 */

const YELLOW = [234, 179, 8];
const DARK = [30, 41, 59];
const GRAY = [100, 116, 139];

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

/** Baixa a foto pela URL assinada (1h) e converte pra data URL, pra poder embutir no PDF. */
async function fotoParaDataUrl(storagePath: string): Promise<string | null> {
  try {
    const signedUrl = await getSignedFotoManutencaoUrl(storagePath);
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

const CATEGORIA_LABEL: Record<string, string> = {
  antes: 'Antes',
  depois: 'Depois',
};

export async function exportManutencaoPdf(
  ordem: ManutencaoOrdem,
  opts: { returnBlob?: boolean } = {},
): Promise<Blob | void> {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const margin = 10;
  const pageWidth = 210;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const logo = await getLogoBase64();
  const dataAbertura = new Date(ordem.createdAt).toLocaleDateString('pt-BR');
  const coordenadas = ordem.latitude != null && ordem.longitude != null
    ? `${ordem.latitude.toFixed(6)}, ${ordem.longitude.toFixed(6)}`
    : '—';

  // Fotos são baixadas ANTES de desenhar qualquer página, pra saber quantas
  // páginas o PDF vai ter e numerar "Pág X de Y" corretamente no cabeçalho,
  // igual ao motor de relatório. Página 1 é sempre texto (dados da OS); as
  // fotos vêm em páginas próprias depois, 4 por página (2x2), só se houver.
  const fotosComImagem = await Promise.all(
    ordem.fotos.map(async (f) => ({ ...f, dataUrl: await fotoParaDataUrl(f.storagePath) })),
  );
  const photosPerPage = 4;
  const totalPaginasFotos = Math.ceil(fotosComImagem.length / photosPerPage);
  const totalPaginas = 1 + totalPaginasFotos;

  const ensureSpace = (needed: number) => {
    if (y + needed > 280) {
      pdf.addPage();
      y = margin;
    }
  };

  const sectionTitle = (title: string) => {
    ensureSpace(12);
    pdf.setFillColor(YELLOW[0], YELLOW[1], YELLOW[2]);
    pdf.rect(margin, y, contentWidth, 7, 'F');
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(DARK[0], DARK[1], DARK[2]);
    pdf.text(title, margin + 2, y + 5);
    y += 11;
  };

  const line = (label: string, value: string) => {
    ensureSpace(6);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
    pdf.text(`${label}:`, margin, y);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(DARK[0], DARK[1], DARK[2]);
    const lines = pdf.splitTextToSize(value || '—', contentWidth - 45);
    pdf.text(lines, margin + 45, y);
    y += 5.5 * lines.length;
  };

  // Mesma ideia de `line`, mas pro valor vir como lista com marcador — usado
  // pra "Problema informado", que guarda vários itens serializados por '||'
  // (ver deserializeProblemas) e não deve virar um texto corrido com "||" no meio.
  const bulletList = (label: string, items: string[]) => {
    ensureSpace(6);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
    pdf.text(`${label}:`, margin, y);
    if (items.length === 0) {
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(DARK[0], DARK[1], DARK[2]);
      pdf.text('—', margin + 45, y);
      y += 5.5;
      return;
    }
    items.forEach((item) => {
      const lines = pdf.splitTextToSize(`• ${item}`, contentWidth - 45);
      ensureSpace(5.5 * lines.length);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(DARK[0], DARK[1], DARK[2]);
      pdf.text(lines, margin + 45, y);
      y += 5.5 * lines.length;
    });
  };

  // ── Cabeçalho (papel timbrado, igual ao motor de relatório) ──────────────
  const drawHeader = (pageNum: number) => {
    const startX = margin;
    const startY = margin;
    const refW = 40;
    const refH = 7;
    pdf.setFillColor(YELLOW[0], YELLOW[1], YELLOW[2]);
    pdf.rect(pageWidth - margin - refW, startY, refW, refH, 'F');
    pdf.setDrawColor(0);
    pdf.setLineWidth(0.3);
    pdf.rect(pageWidth - margin - refW, startY, refW, refH, 'D');
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(DARK[0], DARK[1], DARK[2]);
    pdf.text(ordem.numero, pageWidth - margin - refW / 2, startY + 4.5, { align: 'center' });

    pdf.setFontSize(13);
    pdf.setTextColor(0);
    pdf.text('ORDEM DE SERVIÇO — MANUTENÇÃO', pageWidth / 2, startY + 4.5, { align: 'center' });

    const infoY = startY + 12;
    const infoH = 34;
    const rowH = infoH / 4;
    const col1W = 40;
    const col3W = 40;
    const col2W = contentWidth - col1W - col3W;
    const b1 = startX + col1W;
    const b2 = b1 + col2W;

    pdf.rect(startX, infoY, contentWidth, infoH, 'D');
    pdf.line(b1, infoY, b1, infoY + infoH);
    pdf.line(b2, infoY, b2, infoY + infoH);
    for (let r = 1; r < 4; r++) {
      pdf.line(b1, infoY + rowH * r, startX + contentWidth, infoY + rowH * r);
    }

    if (logo) {
      try { pdf.addImage(logo, 'JPEG', startX + 5, infoY + 2, 30, 30); } catch { /* logo opcional */ }
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
      if (isRight) {
        pdf.text(pdf.splitTextToSize(val || '—', w)[0], x + labelW + 2, yCell);
      } else {
        pdf.text(pdf.splitTextToSize(val || 'NÃO INFORMADO', w - labelW - 2)[0], x + labelW + 2, yCell);
      }
    };

    fillCell(0, 'Razão Social', 'ZAAZ Telecom');
    fillCell(0, 'Pág', `${pageNum} de ${totalPaginas}`, true);
    fillCell(1, 'Tipo', `${ordem.tipo} · ${PRIORIDADE_LABEL[ordem.prioridade]}`);
    fillCell(1, 'Status', STATUS_LABEL[ordem.status], true);
    fillCell(2, 'Solicitante', ordem.solicitante || '—');
    fillCell(2, 'Técnico', ordem.tecnico || '—', true);
    fillCell(3, 'Endereço', `${ordem.municipio || '—'}${ordem.uf ? `/${ordem.uf}` : ''}`);
    fillCell(3, 'UTM', coordenadas, true);

    y = infoY + infoH + 8;
  };

  drawHeader(1);

  // Referência manual pro app "Aniel" (ponte até existir integração via API)
  // — mesma exibida/editável na aba Encerramento (ver AbaAprovacao em
  // ManutencaoOrderDetail.tsx). Fica logo no topo, fora de qualquer seção,
  // porque é identificação da OS, não um dado de localização ou execução.
  line('OS Aniel', ordem.referenciaExterna || '');
  y += 3;

  // ── Seções de texto ────────────────────────────────────────────────────
  sectionTitle('Localização');
  line('Endereço', `${ordem.endereco || '—'}${ordem.numeroEndereco ? `, ${ordem.numeroEndereco}` : ''}`);
  line('Bairro / Cidade', `${ordem.bairro || '—'} — ${ordem.municipio || '—'}/${ordem.uf || ''}`);
  line('UTM (coordenadas)', coordenadas);
  line('Data de abertura', dataAbertura);
  y += 3;

  sectionTitle('Problema e execução');
  bulletList('Problema informado', deserializeProblemas(ordem.problemaInformado));
  line('Observações', ordem.observacoes || '');
  line('Início da execução', ordem.execucaoInicioEm ? new Date(ordem.execucaoInicioEm).toLocaleString('pt-BR') : '—');
  line('Fim da execução', ordem.execucaoFimEm ? new Date(ordem.execucaoFimEm).toLocaleString('pt-BR') : '—');
  y += 3;

  sectionTitle(`Checklist (${ordem.checklist.filter((c) => c.estado === 'concluido').length}/${ordem.checklist.length})`);
  ordem.checklist.forEach((c) => {
    ensureSpace(6);
    const marca = c.estado === 'concluido' ? '[x]' : c.estado === 'nao_aplica' ? '[-]' : '[ ]';
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(DARK[0], DARK[1], DARK[2]);
    pdf.text(`${marca} ${c.label}`, margin, y);
    y += 5.5;
  });
  y += 3;

  sectionTitle(`Materiais utilizados (${ordem.materiais.length})`);
  if (ordem.materiais.length === 0) {
    ensureSpace(6);
    pdf.setFontSize(9); pdf.setFont('helvetica', 'italic'); pdf.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
    pdf.text('Nenhum material registrado.', margin, y);
    y += 6;
  } else {
    ordem.materiais.forEach((m) => {
      ensureSpace(6);
      pdf.setFontSize(9); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(DARK[0], DARK[1], DARK[2]);
      pdf.text(`• ${m.material} — ${m.quantidade} ${m.unidade}`, margin, y);
      y += 5.5;
    });
  }
  y += 3;

  sectionTitle(`Ocorrências registradas (${ordem.ocorrencias.length})`);
  if (ordem.ocorrencias.length === 0) {
    ensureSpace(6);
    pdf.setFontSize(9); pdf.setFont('helvetica', 'italic'); pdf.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
    pdf.text('Nenhuma ocorrência registrada.', margin, y);
    y += 6;
  } else {
    ordem.ocorrencias.forEach((o) => {
      ensureSpace(10);
      pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(DARK[0], DARK[1], DARK[2]);
      pdf.text(`• ${o.tipo} (${o.categoria})`, margin, y);
      y += 5;
      pdf.setFont('helvetica', 'normal'); pdf.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
      const desc = pdf.splitTextToSize(o.descricao || '', contentWidth - 6);
      pdf.text(desc, margin + 4, y);
      y += 5 * desc.length;
    });
  }

  // ── Grade de fotos (2 colunas, igual ao motor de relatório) ──────────────
  // Uma página dedicada a cada 4 fotos (2x2), sempre começando em página
  // nova — mesma divisão de `photosPerPage` usada acima pra calcular
  // `totalPaginas`, então o cabeçalho "Pág X de Y" bate com o PDF real.
  const photoSpacingX = 8;
  const photoSpacingY = 12;
  const pw = (contentWidth - photoSpacingX) / 2;
  const ph = pw * 0.75;

  for (let pagina = 0; pagina < totalPaginasFotos; pagina++) {
    pdf.addPage();
    drawHeader(2 + pagina);
    sectionTitle(`Fotos (${fotosComImagem.length})`);
    const photosStartY = y;

    const fotosDaPagina = fotosComImagem.slice(pagina * photosPerPage, (pagina + 1) * photosPerPage);
    fotosDaPagina.forEach((foto, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const px = margin + col * (pw + photoSpacingX);
      const py = photosStartY + row * (ph + photoSpacingY + 8);
      const globalIdx = pagina * photosPerPage + idx + 1;

      pdf.setDrawColor(0);
      pdf.setLineWidth(0.2);
      pdf.rect(px, py, pw, ph, 'D');
      if (foto.dataUrl) {
        try { pdf.addImage(foto.dataUrl, 'JPEG', px + 0.3, py + 0.3, pw - 0.6, ph - 0.6, undefined, 'MEDIUM'); } catch { /* foto ilegível, mantém a moldura vazia */ }
      }

      let textY = py + ph + 4;
      pdf.setFontSize(8.5);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(0);
      pdf.text(`Foto ${globalIdx} — ${CATEGORIA_LABEL[foto.categoria] || foto.categoria}`, px, textY);
      textY += 4;

      if (foto.descricao) {
        pdf.setFontSize(7.5);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
        const descLines = pdf.splitTextToSize(foto.descricao, pw);
        pdf.text(descLines, px, textY);
      }
    });
  }

  // `returnBlob` devolve o PDF sem baixar — usado pela pré-visualização na
  // aba Encerramento, que só oferece "Baixar PDF" depois de o gestor ver o
  // resultado. Sem a flag, mantém o comportamento antigo (baixa direto),
  // usado pelo atalho na lista de ordens.
  const blob = pdf.output('blob');
  if (opts.returnBlob) return blob;
  pdf.save(`${ordem.numero}.pdf`);
  return blob;
}
