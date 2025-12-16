import {
    Document,
    Packer,
    Paragraph,
    TextRun,
    ImageRun,
    Table,
    TableCell,
    TableRow,
    WidthType,
    AlignmentType,
    BorderStyle,
    VerticalAlign,
    ShadingType,
} from 'docx';
import { saveAs } from 'file-saver';
import { ReportData } from '@/types/report';

// ===================== 1. Conversor de Imagem (Assíncrono) =====================
async function imageUrlToBase64(url: string): Promise<Uint8Array> {
    // ... (função inalterada) ...
    if (url.startsWith('data:')) {
        const base64 = url.split(',')[1];
        if (typeof atob === 'undefined') {
             throw new Error("atob não está disponível para decodificação base64.");
        }
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.warn(`Falha ao buscar imagem: ${url}. Status: ${response.status}`);
            return new Uint8Array(0);
        }
        const blob = await response.blob();
        return new Uint8Array(await blob.arrayBuffer());
    } catch (e) {
        console.error(`Erro ao processar imagem ${url}:`, e);
        return new Uint8Array(0);
    }
}

// ===================== 2. Gerador DOCX (Principal) =====================
export async function generateDOCX(data: ReportData): Promise<void> {
    const date = new Date().toLocaleDateString('pt-BR');

    const accentColor = 'E6BE32';
    const darkTextColor = '3C3C3C';
    const paddingDxA = 100;

    const children: (Paragraph | Table)[] = [];

    // Conversão correta para Word (EMU)
    const CM_TO_EMU = 360000; 
    const imgWidth = 8 * CM_TO_EMU;
    const imgHeight = 8 * CM_TO_EMU;

    // Helper de texto
    const createInfoRun = (label: string, value?: string): TextRun[] => [
        new TextRun({ text: `${label}: `, bold: true, size: 18, color: accentColor }),
        new TextRun({ text: value || 'NÃO INFORMADO', size: 18, color: darkTextColor }),
    ];

    // =====================================================
    // 5. TÍTULO (Renderizado Apenas na Primeira Página)
    // =====================================================
    children.push(
        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 150 },
            children: [
                new TextRun({
                    text: 'RELATÓRIO FOTOGRÁFICO',
                    bold: true,
                    size: 28,
                    color: darkTextColor,
                }),
            ],
        })
    );

    // =====================================================
    // 6. CABEÇALHO DE DADOS (Grade - Definido para Repetição)
    // =====================================================
    const headerTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        // Propriedade CRÍTICA: Faz a primeira linha da tabela repetir em novas páginas
        // Nota: O docx repete a tabela inteira, então definimos a tabela completa aqui.
        rows: [
            new TableRow({
                children: [
                    new TableCell({
                        verticalAlign: VerticalAlign.CENTER,
                        margins: { top: paddingDxA, bottom: paddingDxA },
                        children: [
                            new Paragraph({
                                alignment: AlignmentType.CENTER,
                                children: [new TextRun({ text: 'LOGO', size: 18 })],
                            }),
                        ],
                    }),
                    new TableCell({
                        margins: { left: paddingDxA, right: paddingDxA },
                        children: [
                            new Paragraph({
                                children: createInfoRun('Razão Social', data.config.razaoSocial),
                            }),
                            new Paragraph({
                                children: createInfoRun('Título', data.config.tituloRelatorio),
                            }),
                            new Paragraph({
                                children: createInfoRun('Local', data.config.local),
                            }),
                        ],
                    }),
                    new TableCell({
                        margins: { left: paddingDxA, right: paddingDxA },
                        children: [
                            new Paragraph({
                                alignment: AlignmentType.RIGHT,
                                children: createInfoRun('Data', date),
                            }),
                        ],
                    }),
                ],
            }),
        ],
        borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
            left: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
            right: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
        },
    });

    children.push(headerTable);
    children.push(new Paragraph({ spacing: { after: 200 } }));

    // =====================================================
    // 7. PRÉ-PROCESSAMENTO (Assíncrono) - Inalterado
    // =====================================================
    const processedPhotos = await Promise.all(
        data.photos.map(async (photo, index) => ({
            ...photo,
            imageData: photo.src ? await imageUrlToBase64(photo.src) : null,
            index: index + 1,
        }))
    );

    // =====================================================
    // 8. GRID DE FOTOS (Suporte ao Checklist e Quebra de Linha)
    // =====================================================
    for (let i = 0; i < processedPhotos.length; i += 2) {
        const cells: TableCell[] = [];
        
        const createPhotoCell = (photoData: (typeof processedPhotos)[number] | undefined) => {
            if (!photoData || !photoData.imageData || photoData.imageData.length === 0) {
                cells.push(new TableCell({ children: [new Paragraph({})] }));
                return;
            }

            // Lógica de adaptação do checklist (Desserialização e Quebra de Linha)
            const descriptionString = photoData.description || 'Sem status selecionado';
            
            // Quebra a string de checklist (separada por '||') em linhas
            const descriptionLines = descriptionString.split('||').filter(item => item.trim() !== '');
            
            const finalLines = descriptionLines.length > 0 
                ? descriptionLines 
                : ['Nenhuma opção de status selecionada.'];

            // Mapeia as linhas para TextRuns, adicionando quebra de linha
            const descriptionRuns: TextRun[] = finalLines.flatMap((line, idx) => {
                const runs: TextRun[] = [];
                
                // Adiciona o texto principal (item do checklist com marcador)
                runs.push(
                    new TextRun({ 
                        text: `- ${line.trim()}`, 
                        size: 18 
                    })
                ); 
                
                // Adiciona uma quebra de linha (break: 1) se não for o ÚLTIMO item
                if (idx < finalLines.length - 1) {
                    runs.push(new TextRun({ break: 1 }));
                }
                
                return runs;
            });

            cells.push(
                new TableCell({
                    verticalAlign: VerticalAlign.TOP,
                    children: [
                        new Paragraph({
                            alignment: AlignmentType.CENTER,
                            children: [
                                new ImageRun({
                                    data: photoData.imageData, 
                                    transformation: {
                                        width: imgWidth,
                                        height: imgHeight 
                                    } 
                                }),
                            ],
                        }), 
                        new Paragraph({
                            spacing: { before: 100 },
                            children: [
                                // TÍTULO DA FOTO: Foto X - (Negrito)
                                new TextRun({ text: `Foto ${photoData.index} - `, bold: true, size: 18 }), 
                                // CORPO DA DESCRIÇÃO (Checklist formatado)
                                ...descriptionRuns,
                            ],
                        }),
                    ],
                })
            );
        };

        createPhotoCell(processedPhotos[i]);
        createPhotoCell(processedPhotos[i + 1]);

        children.push(
            new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: [new TableRow({ children: cells })],
            })
        );

        children.push(new Paragraph({ spacing: { after: 150 } }));
    }

    // =====================================================
    // 9. DOCUMENTO FINAL (Configuração de Margens e Repetição)
    // =====================================================
    const doc = new Document({
        sections: [
            {
                properties: {
                    page: {
                        margin: {
                            // Margens reduzidas para maximizar espaço, alinhadas ao PDF
                            top: 500,
                            right: 500,
                            bottom: 500,
                            left: 500,
                        },
                    },
                },
                children,
            },
        ],
    });

    const blob = await Packer.toBlob(doc); 
    saveAs(blob, `relatorio_${date.replace(/\//g, '-')}.docx`);
}