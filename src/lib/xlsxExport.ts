// src/lib/xlsxExport.ts
import { saveAs } from 'file-saver';

export interface XlsxColumn {
  header: string;
  key: string;
  width?: number;
  /** 'date' formata como data real do Excel (não texto); 'number' alinha à direita. */
  type?: 'string' | 'number' | 'date';
}

/**
 * Gera e baixa um .xlsx de verdade — cabeçalho em negrito, colunas com
 * largura e tipo corretos (data/número viram célula de data/número reais no
 * Excel, não texto) e primeira linha congelada. `exceljs` só é carregado
 * quando essa função roda (import dinâmico), pra não pesar o carregamento
 * inicial do app com uma lib que só serve pra exportação.
 */
export async function exportToXlsx(
  filename: string,
  sheetName: string,
  columns: XlsxColumn[],
  rows: Record<string, unknown>[],
): Promise<void> {
  const { default: ExcelJS } = await import('exceljs');

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ZAAZ System';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width ?? 18,
    style: c.type === 'date' ? { numFmt: 'dd/mm/yyyy' } : undefined,
  }));

  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F6F68' } };
  sheet.getRow(1).alignment = { vertical: 'middle' };

  rows.forEach((row) => sheet.addRow(row));

  columns.forEach((c, i) => {
    if (c.type === 'number') sheet.getColumn(i + 1).alignment = { horizontal: 'right' };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  saveAs(blob, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}
