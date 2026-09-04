// src/lib/vistoriaExport.ts
import { saveAs } from 'file-saver';
import { exportToXlsx } from '@/lib/xlsxExport';
import { deserializeProblemas } from '@/types/manutencao';
import type { PendenciaBacklog, OrdemBacklog, CorPendencia, OrigemPonto } from '@/types/vistoria';

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

/**
 * Forma comum dos dois tipos de ponto do mapa. A exportação não deveria
 * conhecer a diferença entre uma pendência de vistoria e uma OS de manutenção
 * — só precisa de onde está, o que é e em que pé está. Cada lado é convertido
 * pra cá antes de virar linha de planilha ou marcador de KML.
 */
export interface PontoExportavel {
  id: string;
  origemPonto: OrigemPonto;
  latitude: number;
  longitude: number;
  cor: CorPendencia;
  /** Número da rota (VST-…) ou da OS (OS-…) — a âncora pra achar o registro no sistema. */
  referencia: string;
  atividade: string;
  problemas: string;
  observacao: string;
  situacao: string;
  vinculo: string;
  createdAt: string;
}

const ORIGEM_LABEL: Record<OrigemPonto, string> = {
  vistoria: 'Vistoria',
  manutencao: 'Manutenção',
};

export function pendenciaParaPonto(p: PendenciaBacklog): PontoExportavel {
  return {
    id: p.id,
    origemPonto: 'vistoria',
    latitude: p.latitude,
    longitude: p.longitude,
    cor: p.cor,
    referencia: p.ordemVistoriaNumero,
    atividade: p.ordemVistoriaTitulo ?? '',
    problemas: problemasLegiveis(p),
    observacao: p.observacao ?? '',
    situacao: COR_DESCRICAO[p.cor],
    vinculo: p.ordemCorretivaNumero ?? '',
    createdAt: p.createdAt,
  };
}

export function ordemParaPonto(o: OrdemBacklog): PontoExportavel {
  return {
    id: o.id,
    origemPonto: 'manutencao',
    latitude: o.latitude,
    longitude: o.longitude,
    cor: o.cor,
    referencia: o.numero,
    atividade: o.tipo,
    problemas: '',
    // O endereço ocupa o campo de observação porque, numa OS aberta direto, é
    // ele que diz "o que tem aqui" — o equivalente da observação do técnico.
    observacao: [o.endereco, o.bairro, o.municipio].filter(Boolean).join(' · '),
    situacao: STATUS_OS_DESCRICAO[o.status] ?? o.status,
    vinculo: [o.equipe, o.tecnico].filter(Boolean).join(' · '),
    createdAt: o.createdAt,
  };
}

const STATUS_OS_DESCRICAO: Record<string, string> = {
  aberta: 'Aberta — aguardando atribuição',
  atribuida: 'Atribuída ao técnico',
  reaberta: 'Retrabalho',
  recebida: 'Recebida pelo técnico',
  deslocamento: 'Em deslocamento',
  no_local: 'No local',
  em_execucao: 'Em execução',
  pausada: 'Pausada',
  finalizada: 'Finalizada pelo técnico',
  aprovada: 'Encerrada',
  concluida: 'Concluída',
};

export async function exportarPendenciasXlsx(
  pontos: PontoExportavel[],
  nomeArquivo: string,
): Promise<void> {
  await exportToXlsx(
    nomeArquivo,
    'Pontos do backlog',
    [
      // "Origem" na primeira coluna porque, com as duas fontes no mesmo
      // arquivo, é o primeiro recorte que alguém faz ao abrir a planilha.
      { header: 'Origem', key: 'origem', width: 12 },
      { header: 'Referência', key: 'referencia', width: 16 },
      { header: 'Atividade / Tipo', key: 'atividade', width: 26 },
      { header: 'Latitude', key: 'latitude', width: 14, type: 'number' },
      { header: 'Longitude', key: 'longitude', width: 14, type: 'number' },
      { header: 'Problemas', key: 'problemas', width: 34 },
      { header: 'Observação / Endereço', key: 'observacao', width: 40 },
      { header: 'Situação', key: 'situacao', width: 30 },
      { header: 'Vínculo', key: 'vinculo', width: 24 },
      { header: 'Registrado em', key: 'registradoEm', width: 20 },
    ],
    pontos.map((p) => ({
      origem: ORIGEM_LABEL[p.origemPonto],
      referencia: p.referencia,
      atividade: p.atividade,
      // Number puro (não string formatada) — assim a planilha permite
      // ordenar/filtrar por coordenada e recolar em outra ferramenta.
      latitude: p.latitude,
      longitude: p.longitude,
      problemas: p.problemas,
      observacao: p.observacao,
      situacao: p.situacao,
      vinculo: p.vinculo,
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
export function montarKml(pontos: PontoExportavel[], titulo: string): string {
  // Ícone diferente por origem, espelhando o mapa da tela: círculo pra
  // vistoria, quadrado pra manutenção. Quem abrir no Google Earth reconhece o
  // mesmo vocabulário visual que viu no sistema.
  const FORMA: Record<OrigemPonto, string> = {
    vistoria: 'placemark_circle',
    manutencao: 'placemark_square',
  };

  const estilos = (['vistoria', 'manutencao'] as OrigemPonto[])
    .flatMap((origem) => (Object.keys(COR_KML) as CorPendencia[]).map((cor) => `    <Style id="pino-${origem}-${cor}">
      <IconStyle>
        <color>${COR_KML[cor]}</color>
        <scale>1.1</scale>
        <Icon><href>http://maps.google.com/mapfiles/kml/shapes/${FORMA[origem]}.png</href></Icon>
      </IconStyle>
    </Style>`))
    .join('\n');

  // Uma pasta por origem: no Google Earth isso vira caixa de seleção, então
  // dá pra desligar uma das camadas sem reexportar.
  const pastas = (['vistoria', 'manutencao'] as OrigemPonto[]).map((origem) => {
    const doGrupo = pontos.filter((p) => p.origemPonto === origem);
    if (doGrupo.length === 0) return '';

    const placemarks = doGrupo.map((p) => {
      // CDATA porque a descrição vira HTML no balão do Google Earth.
      const descricao = [
        `<b>Origem:</b> ${ORIGEM_LABEL[p.origemPonto]}`,
        `<b>Referência:</b> ${escaparXml(p.referencia)}`,
        p.atividade && `<b>Atividade:</b> ${escaparXml(p.atividade)}`,
        p.problemas && `<b>Problemas:</b> ${escaparXml(p.problemas)}`,
        p.observacao && `<b>Observação:</b> ${escaparXml(p.observacao)}`,
        `<b>Situação:</b> ${escaparXml(p.situacao)}`,
        p.vinculo && `<b>Vínculo:</b> ${escaparXml(p.vinculo)}`,
        `<b>Registrado em:</b> ${formatarData(p.createdAt)}`,
      ].filter(Boolean).join('<br/>');

      const nome = p.problemas || p.observacao || p.referencia;

      return `      <Placemark>
        <name>${escaparXml(nome)}</name>
        <styleUrl>#pino-${p.origemPonto}-${p.cor}</styleUrl>
        <description><![CDATA[${descricao}]]></description>
        <Point><coordinates>${p.longitude},${p.latitude},0</coordinates></Point>
      </Placemark>`;
    }).join('\n');

    return `    <Folder>
      <name>${ORIGEM_LABEL[origem]}</name>
${placemarks}
    </Folder>`;
  }).filter(Boolean).join('\n');

  const placemarks = pastas;

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
  pontos: PontoExportavel[],
  nomeArquivo: string,
  opts: { comprimir?: boolean } = {},
): Promise<void> {
  const kml = montarKml(pontos, nomeArquivo);

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
  pontos: PontoExportavel[],
  formato: FormatoExportacao,
  nomeArquivo: string,
): Promise<void> {
  if (formato === 'xlsx') return exportarPendenciasXlsx(pontos, nomeArquivo);
  return exportarPendenciasKml(pontos, nomeArquivo, { comprimir: formato === 'kmz' });
}
