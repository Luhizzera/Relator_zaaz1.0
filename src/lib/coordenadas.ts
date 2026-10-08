// src/lib/coordenadas.ts

export interface Coordenadas {
  lat: number;
  lng: number;
}

/**
 * Leitura de um par de coordenadas digitado ou colado num campo.
 *
 * Chega aqui o que o Google Maps copia ("-23.862100, -49.141330"), o que o
 * próprio app mostra na tela da CTO, o link inteiro do mapa quando a pessoa
 * cola o endereço em vez das coordenadas, e número com vírgula decimal, que é
 * como o teclado brasileiro escreve.
 *
 * O caso chato é a vírgula servir para as duas coisas — decimal e separador.
 * "-23,86" sozinho tanto pode ser um número quanto um par de inteiros, e
 * adivinhar manda o técnico para o lugar errado. Então cada formato aceito é
 * um que não tem outra leitura possível; o resto volta null, e o campo fica
 * vermelho em vez de guardar um ponto duvidoso.
 */

interface Formato {
  regex: RegExp;
  virgulaEhDecimal: boolean;
}

const FORMATOS: Formato[] = [
  // Vírgula decimal nos dois números: "-23,86210, -49,14133" ou separados por
  // espaço. Como os dois lados têm vírgula seguida de dígitos, não há como ler
  // isso como um número só.
  { regex: /^(-?\d+,\d+)\s*[,;\s]\s*(-?\d+,\d+)$/, virgulaEhDecimal: true },

  // Ponto decimal em pelo menos um dos dois: aí a vírgula só pode ser separador.
  { regex: /^(-?\d+\.\d+)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/, virgulaEhDecimal: false },
  { regex: /^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+\.\d+)$/, virgulaEhDecimal: false },

  // Sem casa decimal nenhuma. Só dá para aceitar quando a vírgula está fora de
  // questão: separador que não é vírgula, ou segundo número com sinal (decimal
  // não leva sinal no meio).
  { regex: /^(-?\d+)[\s;]+(-?\d+)$/, virgulaEhDecimal: false },
  { regex: /^(-?\d+)\s*,\s*(-\d+)$/, virgulaEhDecimal: false },
];

/** Links de mapa que as pessoas colam no lugar das coordenadas. */
const LINKS = [
  /@(-?\d+\.\d+),(-?\d+\.\d+)/, // google.com/maps/@-23.86,-49.14,17z
  /[?&]q=(-?\d+\.\d+),\s*(-?\d+\.\d+)/, // google.com/maps?q=-23.86,-49.14
  /[?&]ll=(-?\d+\.\d+),\s*(-?\d+\.\d+)/,
];

const dentroDoMundo = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng)
  && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

export function parseCoordenadas(entrada: string): Coordenadas | null {
  const texto = (entrada ?? '').trim();
  if (!texto) return null;

  for (const link of LINKS) {
    const achou = texto.match(link);
    if (achou) {
      const lat = Number(achou[1]);
      const lng = Number(achou[2]);
      return dentroDoMundo(lat, lng) ? { lat, lng } : null;
    }
  }

  for (const formato of FORMATOS) {
    const achou = texto.match(formato.regex);
    if (!achou) continue;
    const converter = (parte: string) => Number(formato.virgulaEhDecimal ? parte.replace(',', '.') : parte);
    const lat = converter(achou[1]);
    const lng = converter(achou[2]);
    return dentroDoMundo(lat, lng) ? { lat, lng } : null;
  }

  return null;
}

/** Como o app escreve coordenada em todo lugar — e o formato que o Google aceita de volta. */
export const formatarCoordenadas = ({ lat, lng }: Coordenadas) =>
  `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

/**
 * Caixa larga em volta do Brasil, só para desconfiar de latitude e longitude
 * trocadas de lugar — o erro mais caro de um "copiar e colar", porque o par
 * invertido continua sendo um ponto válido do planeta e ninguém percebe até o
 * técnico chegar lá.
 */
const BRASIL = { latMin: -34.5, latMax: 6, lngMin: -74.5, lngMax: -33.5 };

export const pareceForaDoBrasil = ({ lat, lng }: Coordenadas) =>
  lat < BRASIL.latMin || lat > BRASIL.latMax || lng < BRASIL.lngMin || lng > BRASIL.lngMax;

/** O par invertido cairia dentro do Brasil? Então quase certamente é isso. */
export const pareceInvertido = (c: Coordenadas) =>
  pareceForaDoBrasil(c) && !pareceForaDoBrasil({ lat: c.lng, lng: c.lat });
