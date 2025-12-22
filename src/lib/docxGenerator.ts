// @ts-nocheck
import * as docx from 'docx';
import { saveAs } from 'file-saver';

async function getImgBuffer(url: string) {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch (e) { return null; }
}

export const generateZAAZReport = async (data: any) => {
  try {
    const { config, photos } = data;
    const YELLOW = "EAB308";
    const BORDER = { style: docx.BorderStyle.SINGLE, size: 3, color: "000000" };

    const cleanRef = (config?.codigoReferencia || 'SEM_REF').replace(/[/\\?%*:|"<>]/g, '-');
    const fileName = `RESP.NOT-${cleanRef}.docx`;
    const logoBuf = await getImgBuffer('/images/logo-zaaz.jpeg');

    const sections = [];
    const photosPerPage = 4;

    for (let i = 0; i < photos.length; i += photosPerPage) {
      const pagePhotos = photos.slice(i, i + photosPerPage);
      const pageNum = Math.floor(i / photosPerPage) + 1;
      const totalPages = Math.ceil(photos.length / photosPerPage);

      // --- CABEÇALHO (MANTIDO V12 STYLE CENTRALIZADO) ---
      const titlePara = new docx.Paragraph({
        alignment: docx.AlignmentType.CENTER,
        children: [new docx.TextRun({ text: "RELATÓRIO FOTOGRÁFICO", bold: true, size: 28 })],
        spacing: { after: 100 }
      });

      const refTable = new docx.Table({
        width: { size: 100, type: docx.WidthType.PERCENTAGE },
        borders: docx.TableBorders.NONE,
        rows: [new docx.TableRow({
          children: [
            new docx.TableCell({ children: [], width: { size: 75, type: docx.WidthType.PERCENTAGE } }),
            new docx.TableCell({
              width: { size: 25, type: docx.WidthType.PERCENTAGE },
              shading: { fill: YELLOW },
              borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER },
              verticalAlign: docx.VerticalAlign.CENTER,
              children: [new docx.Paragraph({
                alignment: docx.AlignmentType.CENTER,
                children: [new docx.TextRun({ text: config?.codigoReferencia || "NOT-XXXX", bold: true, size: 18 })]
              })]
            })
          ]
        })]
      });

      const infoTable = new docx.Table({
        width: { size: 100, type: docx.WidthType.PERCENTAGE },
        rows: [
          new docx.TableRow({
            height: { value: 450, rule: docx.HeightRule.EXACT },
            children: [
              new docx.TableCell({
                rowSpan: 3, width: { size: 22, type: docx.WidthType.PERCENTAGE },
                borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER },
                verticalAlign: docx.VerticalAlign.CENTER,
                children: logoBuf ? [new docx.Paragraph({
                  alignment: docx.AlignmentType.CENTER,
                  children: [new docx.ImageRun({ data: logoBuf, transformation: { width: 75, height: 75 } })]
                })] : []
              }),
              new docx.TableCell({
                width: { size: 53, type: docx.WidthType.PERCENTAGE },
                borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER },
                verticalAlign: docx.VerticalAlign.CENTER,
                children: [new docx.Paragraph({ children: [
                  new docx.TextRun({ text: "Razão Social: ", color: YELLOW, bold: true, size: 16 }),
                  new docx.TextRun({ text: config?.razaoSocial || "N/A", size: 16 })
                ]})]
              }),
              new docx.TableCell({
                width: { size: 25, type: docx.WidthType.PERCENTAGE },
                borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER },
                verticalAlign: docx.VerticalAlign.CENTER,
                children: [new docx.Paragraph({ alignment: docx.AlignmentType.RIGHT, children: [
                  new docx.TextRun({ text: "Pág: ", color: YELLOW, bold: true, size: 16 }),
                  new docx.TextRun({ text: `${pageNum} de ${totalPages}`, size: 16 })
                ]})]
              })
            ]
          }),
          new docx.TableRow({
            height: { value: 450, rule: docx.HeightRule.EXACT },
            children: [
              new docx.TableCell({ verticalAlign: docx.VerticalAlign.CENTER, borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }, children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Título: ", color: YELLOW, bold: true, size: 16 }), new docx.TextRun({ text: config?.tituloRelatorio || "N/A", size: 16 })]})] }),
              new docx.TableCell({ verticalAlign: docx.VerticalAlign.CENTER, borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }, children: [new docx.Paragraph({ alignment: docx.AlignmentType.RIGHT, children: [new docx.TextRun({ text: "Data: ", color: YELLOW, bold: true, size: 16 }), new docx.TextRun({ text: new Date().toLocaleDateString('pt-BR'), size: 16 })]})] })
            ]
          }),
          new docx.TableRow({
            height: { value: 450, rule: docx.HeightRule.EXACT },
            children: [
              new docx.TableCell({ verticalAlign: docx.VerticalAlign.CENTER, borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }, children: [new docx.Paragraph({ children: [new docx.TextRun({ text: "Objetivo: ", color: YELLOW, bold: true, size: 16 }), new docx.TextRun({ text: config?.objetivo || "N/A", size: 16 })]})] }),
              new docx.TableCell({ verticalAlign: docx.VerticalAlign.CENTER, borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }, children: [new docx.Paragraph({ alignment: docx.AlignmentType.RIGHT, children: [new docx.TextRun({ text: "Local: ", color: YELLOW, bold: true, size: 16 }), new docx.TextRun({ text: config?.local || "N/A", size: 14 })]})] })
            ]
          })
        ]
      });

      // --- 4. GRID 2x2 (11,5 CM COM FOTO LEVEMENTE MAIOR) ---
      const photoRows = [];
      for (let j = 0; j < pagePhotos.length; j += 2) {
        const pair = pagePhotos.slice(j, j + 2);
        const cells = await Promise.all(pair.map(async (p, idx) => {
          const pBuf = await getImgBuffer(p.src);
          const cellChildren = [];

          if (pBuf) {
            cellChildren.push(new docx.Paragraph({
              alignment: docx.AlignmentType.CENTER,
              children: [new docx.ImageRun({ 
                data: pBuf, 
                // 💡 Aumentado de 280 para 315 para ocupar o "espaço laranja"
                transformation: { width: 340, height: 315 } 
              })]
            }));
          }

          cellChildren.push(new docx.Paragraph({
            spacing: { before: 180, after: 50 },
            children: [new docx.TextRun({ text: `Foto ${i + j + idx + 1}:`, bold: true, size: 18 })]
          }));

          if (p.description) {
            p.description.split('||').forEach(line => {
              cellChildren.push(new docx.Paragraph({
                spacing: { before: 0, after: 0 },
                children: [new docx.TextRun({ text: `• ${line.trim()}`, size: 16 })]
              }));
            });
          }

          return new docx.TableCell({
            width: { size: 50, type: docx.WidthType.PERCENTAGE },
            borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER },
            margins: { top: 80, bottom: 100, left: 150, right: 150 },
            verticalAlign: docx.VerticalAlign.TOP,
            children: cellChildren
          });
        }));

        if (cells.length === 1) cells.push(new docx.TableCell({ children: [], borders: BORDER }));

        photoRows.push(new docx.TableRow({ 
          height: { value: 6520, rule: docx.HeightRule.EXACT }, 
          children: cells 
        }));
      }

      sections.push({
        properties: { page: { margin: { top: 300, right: 300, bottom: 300, left: 300 } } },
        children: [titlePara, refTable, new docx.Paragraph({ spacing: { before: 50 } }), infoTable, new docx.Paragraph({ spacing: { before: 200 } }), new docx.Table({ width: { size: 100, type: docx.WidthType.PERCENTAGE }, rows: photoRows })]
      });
    }

    const doc = new docx.Document({ sections });
    const blob = await docx.Packer.toBlob(doc);
    saveAs(blob, fileName);

  } catch (err) {
    console.error("ERRO:", err);
    alert("Erro ao gerar. Verifique os dados.");
  }
};