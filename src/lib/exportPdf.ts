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
        
        // --- 1. CABEÇALHO (MANTIDO) ---
        const titleRowY = pageAreaY + 4; 
        const infoBlockY = pageAreaY + 12; 
        const infoBlockHeight = 34; 
        const innerPadding = 2; 
        const rowHeight = infoBlockHeight / 3; 
        const rowCenterOffset = 7.0; 
        const col1Width = 40; 
        const col3Width = 40; 
        const col2Width = contentWidth - col1Width - col3Width; 
        const col1Boundary = pageAreaX + col1Width;
        const col2Boundary = col1Boundary + col2Width;

        // Caixa Laranja Ref
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

        // Título
        pdf.setFontSize(14);
        pdf.text('RELATÓRIO FOTOGRÁFICO', pageWidth / 2, titleRowY, { align: 'center' });

        // Grade Info
        pdf.rect(pageAreaX, infoBlockY, pageAreaWidth, infoBlockHeight, 'D');
        pdf.line(col1Boundary, infoBlockY, col1Boundary, infoBlockY + infoBlockHeight);
        pdf.line(col2Boundary, infoBlockY, col2Boundary, infoBlockY + infoBlockHeight);
        pdf.line(col1Boundary, infoBlockY + rowHeight, pageAreaX + pageAreaWidth, infoBlockY + rowHeight);
        pdf.line(col1Boundary, infoBlockY + rowHeight * 2, pageAreaX + pageAreaWidth, infoBlockY + rowHeight * 2);

        if (logoBase64) {
            try { pdf.addImage(logoBase64, 'JPEG', pageAreaX + 5, infoBlockY + 2, 30, 30); } catch (e) {}
        }

        const renderCellContent = (colNum: number, yStart: number, label: string, value: string, maxLines: number = 1) => {
            const y = yStart + rowCenterOffset; 
            let xStart = (colNum === 2) ? col1Boundary + innerPadding : col2Boundary + innerPadding;
            pdf.setFontSize(8); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(accentColor.r, accentColor.g, accentColor.b);
            pdf.text(`${label}:`, xStart, y); 
            pdf.setFontSize(colNum === 3 ? 10 : 8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(darkTextColor.r, darkTextColor.g, darkTextColor.b);
            if (colNum === 2) {
                const labelWidth = pdf.getTextWidth(`${label}:`);
                pdf.text(pdf.splitTextToSize(value || 'NÃO INFORMADO', col2Width - labelWidth - 5).slice(0, maxLines), xStart + labelWidth + 2, y);
            } else {
                pdf.text(value || 'NÃO INFORMADO', pageWidth - margin - innerPadding, y, { align: 'right' });
            }
        };

        renderCellContent(2, infoBlockY, 'Razão Social', data.config.razaoSocial);
        renderCellContent(3, infoBlockY, 'Pág', `${pageNum} de ${totalPages}`);
        renderCellContent(2, infoBlockY + rowHeight, 'Título do Relatório', data.config.tituloRelatorio);
        renderCellContent(3, infoBlockY + rowHeight, 'Data', date);
        renderCellContent(2, infoBlockY + rowHeight * 2, 'Objetivo', data.config.objetivo, 2);
        renderCellContent(3, infoBlockY + rowHeight * 2, 'Local', data.config.local);

        // --- 2. GRID DE FOTOS (IMAGENS MAIORES) ---
        const photosStartY = infoBlockY + infoBlockHeight + 6; 
        const photoSpacingX = 8; // Reduzido de 8 para 6 para alargar a imagem
        const photoSpacingY = 6; // Reduzido de 5 para 4 para aproximar as linhas
        const photoWidth = (contentWidth - photoSpacingX) / 2;
        
        // Aumentado de 0.75 para 0.82 para a imagem ficar mais alta e imponente
        const photoHeight = photoWidth * 0.95; 
        
        const descAreaHeight = 25; 
        const totalBlockHeight = photoHeight + descAreaHeight; 

        photosOnPage.forEach((photo, index) => {
            const row = Math.floor(index / 2);
            const col = index % 2;
            
            const photoX = pageAreaX + col * (photoWidth + photoSpacingX);
            const photoY = photosStartY + row * (totalBlockHeight + photoSpacingY);

            // Borda da Foto
            pdf.setDrawColor(0); pdf.setLineWidth(0.2);
            pdf.rect(photoX, photoY, photoWidth, photoHeight);

            // Imagem
            try {
                pdf.addImage(photo.src, 'JPEG', photoX + 0.3, photoY + 0.3, photoWidth - 0.6, photoHeight - 0.6, undefined, 'MEDIUM');
            } catch (e) {
                pdf.rect(photoX + 1, photoY + 1, photoWidth - 2, photoHeight - 2);
                pdf.setFontSize(7); pdf.text('Erro Imagem', photoX + photoWidth/2, photoY + photoHeight/2, {align:'center'});
            }

            // Descrições
            const globalIndex = (pageNum - 1) * photosPerPage + index + 1;
            let currentY = photoY + photoHeight + 4;
            
            pdf.setFontSize(8);
            pdf.setTextColor(darkTextColor.r, darkTextColor.g, darkTextColor.b);

            pdf.setFont('helvetica', 'bold');
            const labelText = `Foto ${globalIndex} - `;
            pdf.text(labelText, photoX, currentY);
            
            pdf.setFont('helvetica', 'normal');
            const rawDescription = photo.description || '';
            const lines = rawDescription.split('||').filter(l => l.trim() !== '');
            const formattedDesc = lines.length > 0 ? lines.map(l => `- ${l.trim()}`).join('\n') : 'Sem descrição';

            const labelWidth = pdf.getTextWidth(labelText);
            const splitDesc = pdf.splitTextToSize(formattedDesc, photoWidth - labelWidth - 2);
            pdf.text(splitDesc, photoX + labelWidth, currentY);
            
            currentY += (splitDesc.length * 3.5) + 1; 

            if (photo.observacoes && photo.observacoes.trim() !== '') {
                pdf.setFont('helvetica', 'bold');
                pdf.text('Obs:', photoX, currentY);
                pdf.setFont('helvetica', 'normal');
                const splitObs = pdf.splitTextToSize(photo.observacoes, photoWidth - 10);
                pdf.text(splitObs, photoX + 8, currentY);
            }
        });
    };
    
    for (let page = 1; page <= totalPages; page++) {
        if (page > 1) pdf.addPage();
        const startIndex = (page - 1) * photosPerPage;
        drawPage(page, data.photos.slice(startIndex, startIndex + photosPerPage));
    }

    const fileName = `${data.config.codigoReferencia || 'relatorio'}_${date.replace(/\//g, '-')}.pdf`;
    pdf.save(fileName);
}