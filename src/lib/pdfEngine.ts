// @ts-nocheck
import jsPDF from 'jspdf';

/** * MOTOR PDF ZAAZ V9 - FIDELIDADE WORD (TÓPICOS)
 * Objetivo: Renderização de legendas em formato de lista com recuo e UTM centralizado.
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

export async function runConsolidatedPDF(data: any): Promise<Blob | void> {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 10;
  const contentWidth = pageWidth - (margin * 2);

  const YELLOW_ACCENT = [234, 179, 8];
  const TEXT_DARK = [30, 41, 59];
  
  const logo = await getLogoBase64();
  const dateStr = new Date().toLocaleDateString('pt-BR');
  const photosPerPage = 4;
  const totalPages = Math.ceil(data.photos.length / photosPerPage) || 1;

  const drawHeader = (pageNum: number) => {
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
      pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
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

    const photosStartY = 58; 
    const photoSpacingX = 8;
    const photoSpacingY = 12;
    
    const pw = (contentWidth - photoSpacingX) / 2;
    const ph = pw * 0.90; 
    const descAreaHeight = 35; 

    const photosOnPage = data.photos.slice((i - 1) * photosPerPage, i * photosPerPage);

    photosOnPage.forEach((photo, idx) => {
      const r = Math.floor(idx / 2);
      const c = idx % 2;
      const px = margin + c * (pw + photoSpacingX);
      const py = photosStartY + r * (ph + descAreaHeight + photoSpacingY);

      // Moldura
      pdf.setDrawColor(0);
      pdf.setLineWidth(0.2);
      pdf.rect(px, py, pw, ph, 'D');

      if (photo.src) {
        try {
          pdf.addImage(photo.src, 'JPEG', px + 0.3, py + 0.3, pw - 0.6, ph - 0.6, undefined, 'MEDIUM');
        } catch (e) {}
      }
      
      let currentY = py + ph + 4;

      // 1. UTM (Centralizado)
      if (photo.location) {
        pdf.setFontSize(7);
        pdf.setFont('courier', 'bold');
        pdf.setTextColor(0);
        pdf.text(`UTM: ${photo.location}`, px + (pw / 2), currentY, { align: 'center' });
        currentY += 5;
      }
      
      // 2. TÍTULO DA FOTO ("Foto X:")
      const globalIdx = (i - 1) * 4 + idx + 1;
      pdf.setFontSize(8.5);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(0);
      pdf.text(`Foto ${globalIdx}:`, px, currentY);
      currentY += 4.5; // Salto para começar a lista abaixo do título

      // --- 🚀 LISTA DE TÓPICOS (ESTILO WORD) ---
      const items = (photo.description || '').split('||').filter(t => t.trim() !== '');
      
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(30, 41, 59);

      items.forEach(item => {
        const bullet = "• ";
        const bulletW = pdf.getTextWidth(bullet);
        
        // Quebra o texto considerando o recuo do bullet
        const lines = pdf.splitTextToSize(item.trim(), pw - bulletW - 2);
        
        lines.forEach((line, lIdx) => {
          if (lIdx === 0) {
            // Primeira linha com o bullet
            pdf.setFont('helvetica', 'bold');
            pdf.text(bullet, px + 1, currentY);
            pdf.setFont('helvetica', 'normal');
            pdf.text(line, px + 1 + bulletW, currentY);
          } else {
            // Linhas seguintes alinhadas com o texto (sem bullet abaixo)
            pdf.text(line, px + 1 + bulletW, currentY);
          }
          currentY += 3.8; // Espaçamento entre linhas
        });
        currentY += 0.5; // Pequeno respiro entre tópicos
      });

      // 3. OBSERVAÇÕES
      if (photo.observacoes) {
        currentY += 1.5;
        pdf.setFontSize(7.5);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(0);
        pdf.text('Obs:', px + 1, currentY);
        
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(71, 85, 105);
        const splitObs = pdf.splitTextToSize(photo.observacoes, pw - 8);
        pdf.text(splitObs, px + 8, currentY);
        
        currentY += (splitObs.length * 3.5);
      }
    });
  }

  const cleanRef = (data.config.codigoReferencia || 'SEM_REF').replace(/[/\\?%*:|"<>]/g, '-');

  if (data.returnBlob) {
    return pdf.output('blob');
  }
  pdf.save(`RESP.NOT-${cleanRef}.pdf`);
}