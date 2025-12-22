// @ts-nocheck
import jsPDF from 'jspdf';

/** * MOTOR PDF ZAAZ V6 - MÁXIMO APROVEITAMENTO VERTICAL
 * Objetivo: Expandir as imagens para ocupar o espaço ocioso e manter legendas claras.
 */

async function getLogoBase64(): Promise<string> {
  try {
    const res = await fetch('/images/logo-zaaz.jpeg');
    const blob = await res.blob();
    return new Promise((r) => {
      const reader = new FileReader();
      reader.onload = () => r(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch (e) { return ''; }
}

export async function runConsolidatedPDF(data: any): Promise<void> {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = 210;
  const pageHeight = 297; // A4 Standard
  const margin = 10;
  const contentWidth = pageWidth - (margin * 2);

  const YELLOW_ACCENT = [234, 179, 8];
  const TEXT_DARK = [30, 41, 59];
  
  const logo = await getLogoBase64();
  const dateStr = new Date().toLocaleDateString('pt-BR');
  const photosPerPage = 4;
  const totalPages = Math.ceil(data.photos.length / photosPerPage) || 1;

  const drawHeader = (pageNum: number) => {
    // ... (Cabeçalho idêntico à V5 para manter a fidelidade da foto meta)
    const startX = margin; const startY = margin;
    const refW = 35; const refH = 7;
    pdf.setFillColor(YELLOW_ACCENT[0], YELLOW_ACCENT[1], YELLOW_ACCENT[2]);
    pdf.rect(pageWidth - margin - refW, startY, refW, refH, 'F');
    pdf.setDrawColor(0); pdf.setLineWidth(0.3);
    pdf.rect(pageWidth - margin - refW, startY, refW, refH, 'D');
    pdf.setFontSize(9); pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
    pdf.text(data.config.codigoReferencia || 'NOT-XXXX', pageWidth - margin - (refW/2), startY + 4.5, { align: 'center' });
    pdf.setFontSize(14); pdf.setTextColor(0);
    pdf.text('RELATÓRIO FOTOGRÁFICO', pageWidth / 2, startY + 4.5, { align: 'center' });
    const infoY = startY + 12; const infoH = 34; const rowH = infoH / 3;
    const col1W = 40; const col3W = 40; const col2W = contentWidth - col1W - col3W;
    const b1 = startX + col1W; const b2 = b1 + col2W;
    pdf.rect(startX, infoY, contentWidth, infoH, 'D');
    pdf.line(b1, infoY, b1, infoY + infoH);
    pdf.line(b2, infoY, b2, infoY + infoH);
    pdf.line(b1, infoY + rowH, startX + contentWidth, infoY + rowH);
    pdf.line(b1, infoY + rowH * 2, startX + contentWidth, infoY + rowH * 2);
    if (logo) try { pdf.addImage(logo, 'JPEG', startX + 5, infoY + 2, 30, 30); } catch(e){}
    const fillCell = (row: number, label: string, val: string, isRight: boolean = false) => {
      const x = isRight ? b2 + 2 : b1 + 2;
      const y = infoY + (row * rowH) + 7.0;
      pdf.setFontSize(8); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(YELLOW_ACCENT[0], YELLOW_ACCENT[1], YELLOW_ACCENT[2]);
      pdf.text(`${label}:`, x, y);
      const labelW = pdf.getTextWidth(`${label}:`);
      pdf.setFontSize(isRight && label === 'Pág' ? 10 : 8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
      if (isRight) pdf.text(val || '', pageWidth - margin - 2, y, { align: 'right' });
      else pdf.text(pdf.splitTextToSize(val || 'NÃO INFORMADO', col2W - labelW - 4)[0], x + labelW + 2, y);
    };
    fillCell(0, 'Razão Social', data.config.razaoSocial);
    fillCell(0, 'Pág', `${pageNum} de ${totalPages}`, true);
    fillCell(1, 'Título do Relatório', data.config.tituloRelatorio);
    fillCell(1, 'Data', dateStr, true);
    fillCell(2, 'Objetivo', data.config.objetivo);
    fillCell(2, 'Local', data.config.local, true);
  };

  for (let i = 1; i <= totalPages; i++) {
    if (i > 1) pdf.addPage();
    drawHeader(i);

    // --- 🚀 RECALCULO DE ESPAÇO (EXPANSÃO VERTICAL) ---
    const photosStartY = 58; 
    const availableHeight = pageHeight - photosStartY - margin; // Espaço útil total
    const photoSpacingX = 8;
    const photoSpacingY = 8; // Espaço entre a Foto 1/2 e a Foto 3/4
    
    const pw = (contentWidth - photoSpacingX) / 2;
    
    // 💡 Aumentei a proporção para 0.90 (Imagem bem maior e imponente)
    const ph = pw * 0.90; 
    
    // Espaço reservado para o texto abaixo de cada foto
    const descAreaHeight = 32; 

    const photosOnPage = data.photos.slice((i - 1) * photosPerPage, i * photosPerPage);

    photosOnPage.forEach((photo, idx) => {
      const r = Math.floor(idx / 2);
      const c = idx % 2;
      const px = margin + c * (pw + photoSpacingX);
      
      // Cálculo do Y para que a segunda linha de fotos ocupe o final da página
      const py = photosStartY + r * (ph + descAreaHeight + photoSpacingY);

      // Moldura da Foto (Preenchimento maior)
      pdf.setDrawColor(0);
      pdf.setLineWidth(0.2);
      pdf.rect(px, py, pw, ph, 'D');

      if (photo.src) {
        try {
          // 'MEDIUM' compression para não travar o PDF com imagens gigantes
          pdf.addImage(photo.src, 'JPEG', px + 0.3, py + 0.3, pw - 0.6, ph - 0.6, undefined, 'MEDIUM');
        } catch (e) {
          pdf.text('Erro na imagem', px + pw/2, py + ph/2, { align: 'center' });
        }
      }
      
      // --- LEGENDA ---
      let currentY = py + ph + 5;
      const globalIdx = (i - 1) * 4 + idx + 1;
      
      pdf.setFontSize(8.5); // Aumentei levemente a fonte
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(0);
      const labelText = `Foto ${globalIdx} - `;
      pdf.text(labelText, px, currentY);
      
      const lW = pdf.getTextWidth(labelText);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(30, 41, 59);

      // Descrição tratada
      const descText = (photo.description || 'Sem descrição').replace(/\|\|/g, '\n- ');
      const splitDesc = pdf.splitTextToSize(descText, pw - lW);
      pdf.text(splitDesc, px + lW, currentY);

      // Observações (Se existirem, aparecem logo abaixo da descrição)
      if (photo.observacoes) {
        const obsY = currentY + (splitDesc.length * 4);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Obs:', px, obsY);
        pdf.setFont('helvetica', 'normal');
        pdf.text(pdf.splitTextToSize(photo.observacoes, pw - 10), px + 8, obsY);
      }
    });
  }

  const cleanRef = (data.config.codigoReferencia || 'SEM_REF')
    .replace(/[/\\?%*:|"<>]/g, '-'); 

const fileName = `RESP.NOT-${cleanRef}.pdf`;

// ===== 2. Comando de Download =====
pdf.save(fileName);
}