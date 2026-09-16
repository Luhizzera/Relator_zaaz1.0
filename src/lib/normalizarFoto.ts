// src/lib/normalizarFoto.ts

/**
 * Redimensiona e comprime uma foto antes do upload: maior lado em 1200 px,
 * JPEG com qualidade 0,7.
 *
 * Havia cinco cópias desta função, uma por tela, todas com o mesmo defeito:
 * só esperavam `img.onload`. Quando o navegador não consegue abrir a imagem,
 * o que dispara é `onerror` — e, sem ninguém ouvindo, a promessa nunca
 * termina. A tela fica em "carregando" para sempre. Foi o relato de campo:
 * foto da galeria selecionada, spinner eterno, nada enviado.
 *
 * Por que a galeria e não a câmera: a câmera do navegador entrega JPEG; a
 * galeria entrega o arquivo como ele está gravado, e ele pode ser HEIC
 * (Samsung com imagens de alta eficiência, arquivos vindos de iPhone), que o
 * Chrome no Android não decodifica — ou um arquivo que ainda só existe na
 * nuvem e falha ao ser lido.
 *
 * Agora a função sempre termina: resolve com a foto ou rejeita com
 * `FotoIlegivelError`, que carrega formato e tamanho. A mensagem que chega ao
 * técnico já diz o que aconteceu — e é ela que confirma a causa no próximo
 * relato, em vez de mais um "fica carregando".
 */

const MAIOR_LADO = 1200;
const QUALIDADE_JPEG = 0.7;
/**
 * Teto para decodificar. Foto de 50 MP em aparelho de entrada leva alguns
 * segundos; 30 s só estoura quando algo travou de verdade.
 */
const TEMPO_LIMITE_MS = 30_000;

export type MotivoFotoIlegivel = 'formato' | 'tempo' | 'memoria';

const ehHeic = (arquivo: File) => /hei[cf]/i.test(arquivo.type) || /\.(heic|heif)$/i.test(arquivo.name);

function descreverFormato(arquivo: File): string {
  if (ehHeic(arquivo)) return 'HEIC';
  if (arquivo.type) return arquivo.type.replace(/^image\//, '').toUpperCase();
  const partes = arquivo.name.split('.');
  return partes.length > 1 ? partes[partes.length - 1].toUpperCase() : 'formato desconhecido';
}

function descreverTamanho(bytes: number): string {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1).replace('.', ',')} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export class FotoIlegivelError extends Error {
  readonly motivo: MotivoFotoIlegivel;
  readonly formato: string;
  readonly tamanhoBytes: number;
  readonly heic: boolean;

  constructor(motivo: MotivoFotoIlegivel, arquivo: File) {
    super(`Foto ilegível (${motivo}): ${arquivo.name}`);
    this.name = 'FotoIlegivelError';
    this.motivo = motivo;
    this.formato = descreverFormato(arquivo);
    this.tamanhoBytes = arquivo.size;
    this.heic = ehHeic(arquivo);
  }
}

/**
 * Aceita como imagem também o arquivo sem MIME. O Android costuma entregar
 * HEIC com `type` vazio; filtrar só por `image/*` descartava a foto em
 * silêncio, sem nem chegar a dizer por quê.
 */
export function pareceImagem(arquivo: File): boolean {
  return arquivo.type.startsWith('image/')
    || /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/i.test(arquivo.name);
}

function abrirImagem(url: string, arquivo: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => {
      img.onload = null;
      img.onerror = null;
      img.src = '';
      reject(new FotoIlegivelError('tempo', arquivo));
    }, TEMPO_LIMITE_MS);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new FotoIlegivelError('formato', arquivo));
    };
    img.src = url;
  });
}

export async function normalizarFoto(arquivo: File): Promise<string> {
  // Object URL em vez de FileReader: não copia a foto inteira para base64 só
  // para decodificar. Num aparelho de entrada, essa cópia de 10+ MB é
  // justamente o tipo de coisa que derruba a aba.
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await abrirImagem(url, arquivo);
    const escala = Math.min(1, MAIOR_LADO / Math.max(img.naturalWidth, img.naturalHeight));
    const largura = Math.round(img.naturalWidth * escala);
    const altura = Math.round(img.naturalHeight * escala);

    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext('2d');
    if (!ctx || !largura || !altura) throw new FotoIlegivelError('memoria', arquivo);
    ctx.drawImage(img, 0, 0, largura, altura);

    const dataUrl = canvas.toDataURL('image/jpeg', QUALIDADE_JPEG);
    // Sem memória, o canvas não lança: devolve "data:," — uma foto em branco
    // que seguiria viagem como se estivesse tudo certo.
    if (dataUrl.length < 32) throw new FotoIlegivelError('memoria', arquivo);
    return dataUrl;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Texto para o toast: o que aconteceu e o que o técnico pode fazer agora. */
export function mensagemErroFoto(erro: unknown): string {
  if (!(erro instanceof FotoIlegivelError)) {
    return erro instanceof Error ? erro.message : 'Erro desconhecido ao processar a foto.';
  }
  // Arquivo vazio vem antes de tudo: seja qual for a extensão, o que falta é
  // o conteúdo. A galeria mostrou a miniatura de uma foto que só está na nuvem.
  if (erro.tamanhoBytes === 0) {
    return 'A foto ainda não foi baixada da nuvem para o celular. Abra-a na galeria, espere carregar e tente de novo.';
  }
  const tamanho = descreverTamanho(erro.tamanhoBytes);
  if (erro.heic) {
    return `A foto está em formato HEIC (${tamanho}), que este navegador não abre. `
      + 'Use o botão da câmera, ou desative o formato de alta eficiência (HEIF/HEIC) nas configurações da câmera do celular.';
  }
  const qual = `${erro.formato}, ${tamanho}`;
  if (erro.motivo === 'tempo') {
    return `A foto demorou demais para abrir (${qual}). Use o botão da câmera ou escolha uma foto menor.`;
  }
  if (erro.motivo === 'memoria') {
    return `O celular ficou sem memória para processar a foto (${qual}). Feche outros apps e tente de novo.`;
  }
  return `Não foi possível abrir esta foto (${qual}). Tente outra foto ou use o botão da câmera.`;
}
