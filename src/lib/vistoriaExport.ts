// src/lib/vistoriaExport.ts
import { saveAs } from 'file-saver';
import { exportToXlsx } from '@/lib/xlsxExport';
import { deserializeProblemas } from '@/types/manutencao';
import type { PendenciaBacklog, CorPendencia } from '@/types/vistoria';

/**
 * Exportação dos pontos de vistoria em dois formatos:
 *
 *  - .xlsx  — tabela, pra análise e repasse administrativo. Reaproveita
 *             `exportToXlsx` (mesmo cabeçalho/estilo do resto do sistema).
 *  - .kml / .kmz — geográfico, pra abrir no Google Earth e em ferramentas de
 *             projeto de rede. KMZ é só o KML zipado com o nome `doc.kml`,
 *             que é o que o Google Earth procura dentro do pacote.
 *
 * Os dois consomem `PendenciaBacklog`, que já vem com o número da rota e o
 * status da corretiva resolvidos (ver listPendenciasBacklog) — a exportação
 * não faz consulta própria, só formata o que a tela já carregou.
 */

const COR_DESCRICAO: Record<CorPendencia, string> = {
  vermelho: 'Sem OS corretiva',
  laranja: 'OS corretiva em andamento',
  verde: 'OS corretiva concluída',
};

/** Cor ABGR do pino no Google Earth — o KML inverte a ordem em relação ao RGB do CSS. */
const COR_KML: Record<CorPendencia, string> = {
  vermelho: 'ff2626dc',
  laranja: 'ff0b9ef5',
  verde: 'ff22a316',
};

function formatarData(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR');
}

function problemasLegiveis(pendencia: PendenciaBacklog): string {
  return deserializeProblemas(pendencia.problemas).join('; ');
}

export async function exportarPendenciasXlsx(
  pendencias: PendenciaBacklog[],
  nomeArquivo: string,
): Promise<void> {
  await exportToXlsx(
    nomeArquivo,
    'Pontos de Vistoria',
    [
      { header: 'Rota', key: 'rota', width: 16 },
      { header: 'Atividade', key: 'atividade', width: 26 },
      { header: 'Latitude', key: 'latitude', width: 14, type: 'number' },
      { header: 'Longitude', key: 'longitude', width: 14, type: 'number' },
      { header: 'Problemas', key: 'problemas', width: 34 },
      { header: 'Observação', key: 'observacao', width: 40 },
      { header: 'Situação', key: 'situacao', width: 26 },
      { header: 'OS corretiva', key: 'corretiva', width: 16 },
      { header: 'Registrado em', key: 'registradoEm', width: 20 },
    ],
    pendencias.map((p) => ({
      rota: p.ordemVistoriaNumero,
      atividade: p.ordemVistoriaTitulo ?? '',
      // Number puro (não string formatada) — assim a planilha permite
      // ordenar/filtrar por coordenada e recolar em outra ferramenta.
      latitude: p.latitude,
      longitude: p.longitude,
      problemas: problemasLegiveis(p),
      observacao: p.observacao ?? '',
      situacao: COR_DESCRICAO[p.cor],
      corretiva: p.ordemCorretivaNumero ?? '',
      registradoEm: formatarData(p.createdAt),
    })),
  );
}

/** Escapa texto livre (observação do técnico) pra não quebrar o XML do KML. */
function escaparXml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Exportada pra ser verificável isoladamente — o XML gerado é a parte com mais armadilha (ordem das coordenadas, escape). */
export function montarKml(pendencias: PendenciaBacklog[], titulo: string): string {
  const estilos = (Object.keys(COR_KML) as CorPendencia[])
    .map((cor) => `    <Style id="pino-${cor}">
      <IconStyle>
        <color>${COR_KML[cor]}</color>
        <scale>1.1</scale>
        <Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon>
      </IconStyle>
    </Style>`)
    .join('\n');

  const placemarks = pendencias.map((p) => {
    const problemas = problemasLegiveis(p);
    // CDATA porque a descrição vira HTML no balão do Google Earth.
    const descricao = [
      problemas && `<b>Problemas:</b> ${escaparXml(problemas)}`,
      p.observacao && `<b>Observação:</b> ${escaparXml(p.observacao)}`,
      `<b>Situação:</b> ${COR_DESCRICAO[p.cor]}`,
      p.ordemCorretivaNumero && `<b>OS corretiva:</b> ${escaparXml(p.ordemCorretivaNumero)}`,
      `<b>Rota:</b> ${escaparXml(p.ordemVistoriaNumero)}`,
      `<b>Registrado em:</b> ${formatarData(p.createdAt)}`,
    ].filter(Boolean).join('<br/>');

    const nome = problemas || p.observacao || p.ordemVistoriaNumero;

    return `    <Placemark>
      <name>${escaparXml(nome)}</name>
      <styleUrl>#pino-${p.cor}</styleUrl>
      <description><![CDATA[${descricao}]]></description>
      <Point><coordinates>${p.longitude},${p.latitude},0</coordinates></Point>
    </Placemark>`;
  }).join('\n');

  // Ordem das coordenadas no KML é longitude,latitude — invertida em relação
  // ao resto do sistema (que usa lat,lng como o Leaflet). Trocar isso joga os
  // pontos no oceano perto da África, então é o erro clássico aqui.
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escaparXml(titulo)}</name>
${estilos}
${placemarks}
  </Document>
</kml>`;
}

export async function exportarPendenciasKml(
  pendencias: PendenciaBacklog[],
  nomeArquivo: string,
  opts: { comprimir?: boolean } = {},
): Promise<void> {
  const kml = montarKml(pendencias, nomeArquivo);

  if (!opts.comprimir) {
    saveAs(new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' }), `${nomeArquivo}.kml`);
    return;
  }

  // KMZ = zip contendo `doc.kml` na raiz. `fflate` é carregado sob demanda,
  // mesmo princípio do exceljs em xlsxExport.ts — não pesa o boot do app.
  const { zipSync, strToU8 } = await import('fflate');
  const zip = zipSync({ 'doc.kml': strToU8(kml) }, { level: 9 });
  saveAs(
    new Blob([zip], { type: 'application/vnd.google-earth.kmz' }),
    `${nomeArquivo}.kmz`,
  );
}

export type FormatoExportacao = 'xlsx' | 'kml' | 'kmz';

/** Ponto único de saída — a UI só escolhe o formato e o recorte, sem saber como cada um é gerado. */
export async function exportarPendencias(
  pendencias: PendenciaBacklog[],
  formato: FormatoExportacao,
  nomeArquivo: string,
): Promise<void> {
  if (formato === 'xlsx') return exportarPendenciasXlsx(pendencias, nomeArquivo);
  return exportarPendenciasKml(pendencias, nomeArquivo, { comprimir: formato === 'kmz' });
}
