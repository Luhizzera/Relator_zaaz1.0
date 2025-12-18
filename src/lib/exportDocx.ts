// ===== 1. Imports Estruturados =====
// @ts-nocheck
import {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableCell, TableRow,
  WidthType, AlignmentType, BorderStyle, VerticalAlign, Header, Footer, PageNumber
} from 'docx';
import { saveAs } from 'file-saver';

// Helper para converter imagem em Buffer compatível com docx v9
async function getImgBuffer(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url);
    const arr = await res.arrayBuffer();
    return new Uint8Array(arr);
  } catch { return null; }
}

export async function generateDOCX(data: any): Promise<void> {
  const logoBuf = await getImgBuffer('/images/logo-zaaz.jpeg');
  const blackBorder = { style: BorderStyle.SINGLE, size: 1, color: "000000" };

  // ===== 2. Cabeçalho: Tabela de Identificação (3 Linhas) =====
  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 20, type: WidthType.PERCENTAGE },
            rowSpan: 3,
            verticalAlign: VerticalAlign.CENTER,
            borders: { top: blackBorder, bottom: blackBorder, left: blackBorder, right: blackBorder },
            children: [logoBuf ? new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: logoBuf, transformation: { width: 80, height: 40 } })] }) : new Paragraph("")]
          }),
          new TableCell({
            width: { size: 55, type: WidthType.PERCENTAGE },
            borders: { top: blackBorder, bottom: blackBorder, left: blackBorder, right: blackBorder },
            children: [new Paragraph({ children: [new TextRun({ text: "Razão Social: ", bold: true, size: 18 }), new TextRun({ text: data.config.razaoSocial || "ZAAZ TELECOM", size: 18 })] })]
          }),
          new TableCell({
            width: { size: 25, type: WidthType.PERCENTAGE },
            borders: { top: blackBorder, bottom: blackBorder, left: blackBorder, right: blackBorder },
            children: [new Paragraph({ children: [new TextRun({ text: "Página: ", bold: true, size: 18 }), new TextRun({ children: [PageNumber.CURRENT, " de ", PageNumber.TOTAL_PAGES], size: 18 })] })]
          }),
        ]
      }),
      new TableRow({
        children: [
          new TableCell({
            borders: { top: blackBorder, bottom: blackBorder, left: blackBorder, right: blackBorder },
            children: [new Paragraph({ children: [new TextRun({ text: "Título do Relatório: ", bold: true, size: 18 }), new TextRun({ text: data.config.tituloRelatorio || "VISTORIA", size: 18 })] })]
          }),
          new TableCell({
            borders: { top: blackBorder, bottom: blackBorder, left: blackBorder, right: blackBorder },
            children: [new Paragraph({ children: [new TextRun({ text: "Data: ", bold: true, size: 18 }), new TextRun({ text: new Date().toLocaleDateString('pt-BR'), size: 18 })] })]
          }),
        ]
      }),
      new TableRow({
        children: [
          new TableCell({
            borders: { top: blackBorder, bottom: blackBorder, left: blackBorder, right: blackBorder },
            children: [new Paragraph({ children: [new TextRun({ text: "Objetivo: ", bold: true, size: 18 }), new TextRun({ text: data.config.objetivo || "REGULARIZAÇÃO", size: 18 })] })]
          }),
          new TableCell({
            borders: { top: blackBorder, bottom: blackBorder, left: blackBorder, right: blackBorder },
            children: [new Paragraph({ children: [new TextRun({ text: "Local: ", bold: true, size: 18 }), new TextRun({ text: data.config.local || "N/A", size: 18 })] })]
          }),
        ]
      })
    ]
  });

  // ===== 3. Corpo: Grade de Fotos (2 Colunas) =====
  const photoRows: TableRow[] = [];
  for (let i = 0; i < data.photos.length; i += 2) {
    const pair = data.photos.slice(i, i + 2);
    const cells = await Promise.all(pair.map(async (photo: any, index: number) => {
      const buf = await getImgBuffer(photo.src);
      return new TableCell({
        width: { size: 50, type: WidthType.PERCENTAGE },
        borders: { top: blackBorder, bottom: blackBorder, left: blackBorder, right: blackBorder },
        children: [
          new Paragraph({ spacing: { before: 100 } }),
          ...(buf ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: buf, transformation: { width: 280, height: 210 } })] })] : []),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 100, after: 100 },
            children: [new TextRun({ text: `Foto ${i + index + 1}`, bold: true, size: 18 })]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
            children: [new TextRun({ text: photo.description || "", size: 16 })]
          })
        ]
      });
    }));
    if (cells.length === 1) cells.push(new TableCell({ borders: { top: blackBorder, bottom: blackBorder, left: blackBorder, right: blackBorder }, children: [] }));
    photoRows.push(new TableRow({ children: cells }));
  }

  // ===== 4. Finalização =====
  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 500, right: 500, bottom: 500, left: 500 } } },
      headers: { default: new Header({ children: [headerTable] }) },
      footers: {
        default: new Footer({
          children: [
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Autor: ", bold: true }), new TextRun({ text: data.config.autor || "" })] })] }),
                  new TableCell({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "ZAAZ Engenharia", italic: true })] })] })
                ]
              })]
            })
          ]
        })
      },
      children: [
        new Paragraph({ spacing: { before: 200 } }),
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: photoRows })
      ]
    }]
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `Relatorio_Vistoria_${data.config.codigoReferencia}.docx`);
}