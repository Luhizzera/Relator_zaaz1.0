// @ts-nocheck
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  ImageRun,
  AlignmentType,
  WidthType,
  VerticalAlign,
  BorderStyle,
  HeightRule,
} from 'docx';
import { saveAs } from 'file-saver';

// ===== HELPERS =====

const BORDER = { style: BorderStyle.SINGLE, size: 3, color: '000000' };
const ALL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
const NO_BORDERS = {
  top:    { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right:  { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
};

const YELLOW = 'EAB308';
const YELLOW_SHADE = { fill: YELLOW };

/**
 * Busca uma imagem via URL e retorna Uint8Array.
 * Retorna null se falhar (evita crash no Document).
 */
async function fetchImageBuffer(url: string): Promise<Uint8Array | null> {
  if (!url) return null;
  try {
    // Base64 data URL — converte direto sem fetch
    if (url.startsWith('data:')) {
      const base64 = url.split(',')[1];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    }
    const res = await fetch(url);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** Cria um parágrafo vazio com espaçamento opcional. */
function spacer(before = 0, after = 0): Paragraph {
  return new Paragraph({ spacing: { before, after }, children: [] });
}

/** Célula simples de tabela com texto e bordas padrão. */
function infoCell(
  labelText: string,
  valueText: string,
  widthPct: number,
  align: typeof AlignmentType[keyof typeof AlignmentType] = AlignmentType.LEFT,
): TableCell {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    borders: ALL_BORDERS,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
    children: [
      new Paragraph({
        alignment: align,
        children: [
          new TextRun({ text: `${labelText}: `, color: YELLOW, bold: true, size: 16 }),
          new TextRun({ text: valueText || 'N/A', size: 16 }),
        ],
      }),
    ],
  });
}

// ===== GERADOR PRINCIPAL =====

export const generateZAAZReport = async (data: any): Promise<Blob | void> => {
  const { config, photos } = data;

  const cleanRef = (config?.codigoReferencia || 'SEM_REF').replace(/[/\\?%*:|"<>]/g, '-');
  const fileName = `RESP.NOT-${cleanRef}.docx`;
  const dateStr = new Date().toLocaleDateString('pt-BR');

  const logoBuf = await fetchImageBuffer('/images/logo-zaaz.jpeg');

  const photosPerPage = 4;
  const totalPages = Math.ceil(photos.length / photosPerPage) || 1;
  const docSections = [];

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const pagePhotos = photos.slice(pageIdx * photosPerPage, (pageIdx + 1) * photosPerPage);
    const pageNum = pageIdx + 1;

    // ------------------------------------------------------------------
    // 1. TÍTULO
    // ------------------------------------------------------------------
    const titlePara = new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({ text: 'RELATÓRIO FOTOGRÁFICO', bold: true, size: 28 }),
      ],
    });

    // ------------------------------------------------------------------
    // 2. BADGE DE REFERÊNCIA (alinhado à direita, sem tabela invisível)
    // ------------------------------------------------------------------
    const refBadgePara = new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 100 },
      children: [
        new TextRun({
          text: ` ${config?.codigoReferencia || 'NOT-XXXX'} `,
          bold: true,
          size: 18,
          highlight: 'yellow',   // destaque amarelo nativo — sem shading de célula
        }),
      ],
    });

    // ------------------------------------------------------------------
    // 3. TABELA DE INFORMAÇÕES (logo | dados | pág/data/local)
    // ------------------------------------------------------------------

    // Célula do logo (rowSpan=3)
    const logoCell = new TableCell({
      rowSpan: 3,
      width: { size: 20, type: WidthType.PERCENTAGE },
      borders: ALL_BORDERS,
      verticalAlign: VerticalAlign.CENTER,
      children: logoBuf
        ? [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new ImageRun({ type: 'jpg', data: logoBuf, transformation: { width: 80, height: 80 } })],
          })]
        : [new Paragraph({ children: [] })],
    });

    const infoTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          height: { value: 500, rule: HeightRule.AT_LEAST },
          children: [
            logoCell,
            infoCell('Razão Social', config?.razaoSocial, 55),
            infoCell('Pág', `${pageNum} de ${totalPages}`, 25, AlignmentType.RIGHT),
          ],
        }),
        new TableRow({
          height: { value: 500, rule: HeightRule.AT_LEAST },
          children: [
            infoCell('Título', config?.tituloRelatorio, 55),
            infoCell('Data', dateStr, 25, AlignmentType.RIGHT),
          ],
        }),
        new TableRow({
          height: { value: 500, rule: HeightRule.AT_LEAST },
          children: [
            infoCell('Objetivo', config?.objetivo, 55),
            infoCell('Local', config?.local, 25, AlignmentType.RIGHT),
          ],
        }),
      ],
    });

    // ------------------------------------------------------------------
    // 4. GRID 2×2 DE FOTOS
    // ------------------------------------------------------------------
    const photoRows: TableRow[] = [];

    for (let rowIdx = 0; rowIdx < Math.ceil(pagePhotos.length / 2); rowIdx++) {
      const pair = pagePhotos.slice(rowIdx * 2, rowIdx * 2 + 2);

      const cells = await Promise.all(
        pair.map(async (photo, colIdx) => {
          const globalPhotoNum = pageIdx * photosPerPage + rowIdx * 2 + colIdx + 1;
          const imgBuf = await fetchImageBuffer(photo.src);
          const cellChildren: Paragraph[] = [];

          // Imagem
          if (imgBuf) {
            cellChildren.push(
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 60 },
                children: [
                  new ImageRun({ type: 'jpg', data: imgBuf, transformation: { width: 330, height: 240 } }),
                ],
              }),
            );
          }

          // UTM
          if (photo.location) {
            cellChildren.push(
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 40, after: 40 },
                children: [
                  new TextRun({ text: `UTM: ${photo.location}`, bold: true, size: 14, font: 'Courier New' }),
                ],
              }),
            );
          }

          // Número da foto
          cellChildren.push(
            new Paragraph({
              spacing: { before: 80, after: 40 },
              children: [new TextRun({ text: `Foto ${globalPhotoNum}:`, bold: true, size: 18 })],
            }),
          );

          // Checklist (itens separados por ||)
          if (photo.description) {
            photo.description.split('||').filter(Boolean).forEach((line: string) => {
              cellChildren.push(
                new Paragraph({
                  spacing: { before: 0, after: 30 },
                  children: [new TextRun({ text: `• ${line.trim()}`, size: 16 })],
                }),
              );
            });
          }

          // Observações
          if (photo.observacoes) {
            cellChildren.push(
              new Paragraph({
                spacing: { before: 60 },
                children: [
                  new TextRun({ text: 'Obs: ', size: 14, bold: true, color: '555555' }),
                  new TextRun({ text: photo.observacoes, size: 14, italic: true, color: '555555' }),
                ],
              }),
            );
          }

          return new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            borders: ALL_BORDERS,
            margins: { top: 80, bottom: 100, left: 150, right: 150 },
            verticalAlign: VerticalAlign.TOP,
            children: cellChildren,
          });
        }),
      );

      // Célula vazia para completar par ímpar
      if (cells.length === 1) {
        cells.push(
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            borders: ALL_BORDERS,
            children: [new Paragraph({ children: [] })],
          }),
        );
      }

      photoRows.push(
        new TableRow({
          height: { value: 5500, rule: HeightRule.AT_LEAST },
          children: cells,
        }),
      );
    }

    const photoGrid = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: photoRows,
    });

    docSections.push({
      properties: {
        page: { margin: { top: 400, right: 400, bottom: 400, left: 400 } },
      },
      children: [
        titlePara,
        refBadgePara,
        infoTable,
        spacer(200, 0),
        photoGrid,
      ],
    });
  }

  // ------------------------------------------------------------------
  // 5. GERAR E BAIXAR
  // ------------------------------------------------------------------
  const doc = new Document({ sections: docSections });
  const blob = await Packer.toBlob(doc);

  if (data.returnBlob) {
    return blob;
  }
  saveAs(blob, fileName);
};