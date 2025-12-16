// src/lib/exportPdf.ts

import jsPDF from 'jspdf';
import { ReportData } from '@/types/report';

// ===== 1. Função Auxiliar para Carregar Logo (Mantida) =====
async function loadLogoBase64(): Promise<string> {
  try {
    const response = await fetch('/images/logo-zaaz.jpeg');
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Error loading logo:', error);
    return '';
  }
}

export async function generatePDF(data: ReportData): Promise<void> {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  
  const margin = 10;
  const contentWidth = pageWidth - 2 * margin;

  // Definições de Estilo (inalterado)
  const accentColor = { r: 234, g: 179, b: 8 }; 
  const borderColor = { r: 0, g: 0, b: 0 }; 
  const darkTextColor = { r: 30, g: 41, b: 59 }; 

  const date = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const photosPerPage = 4;
  const totalPages = Math.ceil(data.photos.length / photosPerPage) || 1;
  
  const logoBase64 = await loadLogoBase64();

  // Helper function to draw a page
  const drawPage = (pageNum: number, photosOnPage: typeof data.photos) => {
    const pageAreaX = margin;
    const pageAreaY = margin;
    const pageAreaWidth = contentWidth;
    
    // --- VARIÁVEIS DE DIMENSÃO DO CABEÇALHO (AJUSTADAS) ---
    const titleRowY = pageAreaY + 4; 
    const infoBlockY = pageAreaY + 12; 
    
    // AJUSTE: Altura final reduzida para 34mm (Otimização Máxima)
    const infoBlockHeight = 34;             
    const innerPadding = 2;                 
    
    // Altura das linhas da grade: ~11.33mm por linha
    const rowHeight = infoBlockHeight / 3; 

    // AJUSTE: Offset para centralização vertical (7.0mm)
    const rowCenterOffset = 7.0; 
    
    // Larguras das colunas (inalteradas)
    const col1Width = 40; 
    const col3Width = 40; 
    const col2Width = contentWidth - col1Width - col3Width; 
    
    // --- 1. CAIXA LARANJA (CÓDIGO DE REFERÊNCIA) ---
    const refBoxWidth = 35;
    const refBoxHeight = 7;
    const refBoxX = pageWidth - margin - refBoxWidth;
    const refBoxY = pageAreaY;
    
    pdf.setFillColor(accentColor.r, accentColor.g, accentColor.b);
    pdf.rect(refBoxX, refBoxY, refBoxWidth, refBoxHeight, 'F');
    
    pdf.setDrawColor(borderColor.r, borderColor.g, borderColor.b);
    pdf.setLineWidth(0.3); 
    pdf.rect(refBoxX, refBoxY, refBoxWidth, refBoxHeight);
    
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(darkTextColor.r, darkTextColor.g, darkTextColor.b); 
    const refCode = data.config.codigoReferencia || 'NOT-XXXX';
    pdf.text(refCode, refBoxX + refBoxWidth / 2, refBoxY + 4.5, { align: 'center' });


    // 2. TÍTULO PRINCIPAL (Centralizado)
    pdf.setFontSize(14);
    pdf.setTextColor(darkTextColor.r, darkTextColor.g, darkTextColor.b);
    pdf.setFont('helvetica', 'bold');
    pdf.text('RELATÓRIO FOTOGRÁFICO', pageWidth / 2, titleRowY, { align: 'center' });

    // --- DESENHO DA GRADE DE INFORMAÇÕES (Borda Geral) ---
    
    // Borda Geral (engloba Logo e Dados)
    pdf.setDrawColor(borderColor.r, borderColor.g, borderColor.b);
    pdf.setLineWidth(0.3);
    pdf.rect(pageAreaX, infoBlockY, pageAreaWidth, infoBlockHeight, 'D');

    // Linhas verticais
    const col1Boundary = pageAreaX + col1Width;
    const col2Boundary = col1Boundary + col2Width;
    
    pdf.line(col1Boundary, infoBlockY, col1Boundary, infoBlockY + infoBlockHeight);
    pdf.line(col2Boundary, infoBlockY, col2Boundary, infoBlockY + infoBlockHeight);
    
    // Linhas Horizontais
    const row1Boundary = infoBlockY + rowHeight;
    const row2Boundary = infoBlockY + rowHeight * 2;
    
    pdf.line(col1Boundary, row1Boundary, pageAreaX + pageAreaWidth, row1Boundary);
    pdf.line(col1Boundary, row2Boundary, pageAreaX + pageAreaWidth, row2Boundary);

    // 3. LOGO (Ajustada para a nova altura)
    const logoAreaWidth = 30;
    const logoAreaHeight = 30; 
    const logoAreaTop = infoBlockY + (infoBlockHeight - logoAreaHeight) / 2;
    const logoAreaLeft = pageAreaX + (col1Width - logoAreaWidth) / 2; 
    
    if (logoBase64) {
      try {
        pdf.addImage(logoBase64, 'JPEG', logoAreaLeft, logoAreaTop, logoAreaWidth, logoAreaHeight);
      } catch (error) {
        console.error('Error adding logo:', error);
      }
    }

    // --- FUNÇÃO AUXILIAR PARA RENDERIZAR O CONTEÚDO (Inalterada na lógica) ---
    
    const renderCellContent = (colNum: number, yStart: number, label: string, value: string, maxCellWidth: number, maxLines: number = 1, alignRight: boolean = false, valueOffsetX: number = 2) => {
        
        const labelText = label.endsWith(':') ? label : `${label}:`;
        const valueText = value || 'NÃO INFORMADO';
        
        const y = yStart + rowCenterOffset; 

        let xStart = (colNum === 2) ? col1Boundary + innerPadding : col2Boundary + innerPadding;
        
        // --- 1. Renderizar Rótulo (Label) ---
        pdf.setFontSize(8); 
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(accentColor.r, accentColor.g, accentColor.b);
        pdf.text(labelText, xStart, y); 

        // --- 2. Renderizar Valor (Value) ---
        pdf.setFontSize(colNum === 3 ? 10 : 8); 
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(darkTextColor.r, darkTextColor.g, darkTextColor.b);
        
        if (colNum === 2) {
            const labelWidth = pdf.getTextWidth(labelText);
            const valueX = xStart + labelWidth + valueOffsetX; 
            const valueMaxWidth = maxCellWidth - labelWidth - innerPadding - valueOffsetX; 

            let splitValue = pdf.splitTextToSize(valueText, valueMaxWidth);
            
            pdf.text(splitValue.slice(0, maxLines), valueX, y); 
        
        } else if (colNum === 3) {
            
            const valueX_Right = pageWidth - margin - innerPadding;
            
            pdf.text(valueText, valueX_Right, y, { align: 'right' });
        }
    };
    
    // --- CONTEÚDO DE DADOS DA GRADE (Inalterado) ---
    
    // LINHA 1 
    const cellY1 = infoBlockY; 
    renderCellContent(2, cellY1, 'Razão Social', data.config.razaoSocial, col2Width, 1, false);
    renderCellContent(3, cellY1, 'Pág', `${pageNum} de ${totalPages}`, col3Width, 1, true);

    // LINHA 2 
    const cellY2 = row1Boundary; 
    renderCellContent(2, cellY2, 'Título do Relatório', data.config.tituloRelatorio, col2Width, 1, false, 4); 
    renderCellContent(3, cellY2, 'Data', date, col3Width, 1, true);

    // LINHA 3 
    const cellY3 = row2Boundary; 
    renderCellContent(2, cellY3, 'Objetivo', data.config.objetivo, col2Width, 2, false); 
    renderCellContent(3, cellY3, 'Local', data.config.local, col3Width, 1, true);


    // --- GRID DE FOTOS ---
    
    // AJUSTE: Margem entre cabeçalho e fotos reduzida para 8mm
    const photosStartY = infoBlockY + infoBlockHeight + 8; 
    
    const photoSpacing = 8;
    const photoWidth = (contentWidth - photoSpacing) / 2;
    const photoHeight = photoWidth + 5; 
    const descHeight = 12; 
    const totalBlockHeight = photoHeight + descHeight;

    const photosContainerWidth = (photoWidth * 2) + photoSpacing;
    const photosOffsetX = (pageAreaWidth - photosContainerWidth) / 2;

    photosOnPage.forEach((photo, index) => {
      const row = Math.floor(index / 2);
      const col = index % 2;
      
      const photoX = pageAreaX + photosOffsetX + col * (photoWidth + photoSpacing);
      const photoY = photosStartY + row * (totalBlockHeight + photoSpacing);

      // Photo border
      pdf.setDrawColor(borderColor.r, borderColor.g, borderColor.b);
      pdf.setLineWidth(1); 
      pdf.rect(photoX, photoY, photoWidth, photoHeight);

      // Add image
      try {
        pdf.addImage(photo.src, 'JPEG', photoX + 0.5, photoY + 0.5, photoWidth - 1, photoHeight - 1, undefined, 'MEDIUM');
      } catch (error) {
        console.error('Error adding image:', error);
        pdf.setFillColor(200, 200, 200);
        pdf.rect(photoX + 1, photoY + 1, photoWidth - 2, photoHeight - 2, 'F');
        pdf.setFontSize(8);
        pdf.setTextColor(100);
        pdf.text('[Imagem não disponível]', photoX + photoWidth / 2, photoY + photoHeight / 2, { align: 'center' });
      }

      // Photo label and description (below image)
      const globalIndex = (pageNum - 1) * photosPerPage + index + 1;
      const labelY = photoY + photoHeight + 5; // Y inicial para o texto
      
      pdf.setFontSize(8);
      pdf.setTextColor(darkTextColor.r, darkTextColor.g, darkTextColor.b);
      pdf.setFont('helvetica', 'bold');
      const labelText = `Foto ${globalIndex} - `;
      pdf.text(labelText, photoX, labelY);
      
      pdf.setFont('helvetica', 'normal');
        
      // TRATAMENTO PARA CHECKLIST (Inalterado na lógica)
        const rawDescription = photo.description || '';

        const lines = rawDescription.split('||').filter(line => line.trim() !== '');

        const formattedDescription = (lines.length > 0 
            ? lines.map(line => `- ${line.trim()}`).join('\n') 
            : 'Sem descrição'
        );

        const labelWidth = pdf.getTextWidth(labelText);
        const descriptionStartX = photoX + labelWidth; 
        const descriptionMaxWidth = photoWidth - labelWidth - 2; 

        const splitDesc = pdf.splitTextToSize(formattedDescription, descriptionMaxWidth);
        
        pdf.text(splitDesc, descriptionStartX, labelY);
    });
    
  };

  // Generate pages
  for (let page = 1; page <= totalPages; page++) {
    if (page > 1) {
      pdf.addPage();
    }
    
    const startIndex = (page - 1) * photosPerPage;
    const endIndex = startIndex + photosPerPage;
    const photosOnPage = data.photos.slice(startIndex, endIndex);
    
    drawPage(page, photosOnPage);
  }

  // Trigger download
  const fileName = `${data.config.codigoReferencia || 'relatorio'}_${date.replace(/\//g, '-')}.pdf`;
  pdf.save(fileName);
}