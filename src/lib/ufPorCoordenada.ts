// src/lib/ufPorCoordenada.ts

import { pontoDentroDoPoligono, type Vertice } from '@/lib/geoSelecao';

/**
 * UF a partir da coordenada, sem depender de rede.
 *
 * Existe porque a UF vinha exclusivamente da geocodificação reversa do
 * Nominatim — e quando essa chamada falha (sinal fraco em rodovia, timeout de
 * 8s, limite de uso do serviço) ela volta vazia. Foi assim que a OS-2026-0159
 * nasceu com UTM e sem estado, e apareceu no resumo diário como uma região
 * "—", mesmo o Nominatim conhecendo o ponto perfeitamente.
 *
 * Divisa entre estados não muda. Então, de todos os campos de endereço, a UF
 * é o único que dá para calcular localmente, só com o contorno oficial dos
 * estados (malha do IBGE, em src/data/ufs-ibge.json).
 *
 * É FALLBACK, não substituto. Quem chama deve preferir a UF do Nominatim
 * quando ela vier: a malha é simplificada e erra a menos de ~1 km de uma
 * divisa, enquanto o Nominatim usa os limites detalhados do OpenStreetMap.
 * Medido nas 120 OS reais com UTM e UF: a qualidade intermediária acertou as
 * 120 — incluindo um ponto a 700 m da divisa SP/MG, em Águas de Lindóia, onde
 * a qualidade mínima errava. Como a operação roda justamente no Circuito das
 * Águas, em cima dessa divisa, a qualidade mais fina compensa o tamanho.
 */

/** Um polígono do GeoJSON: o primeiro anel é o contorno, os demais são buracos. */
type Poligono = Vertice[][];

interface MalhaUf {
  fonte: string;
  obtidoEm: string;
  ufs: Record<string, Poligono[]>;
}

interface EntradaIndice {
  sigla: string;
  poligonos: Poligono[];
  /** [latMin, lngMin, latMax, lngMax] — descarta a maioria dos estados sem rodar o ray casting. */
  caixa: [number, number, number, number];
}

/**
 * Até onde aceitar o estado mais próximo quando o ponto não cai dentro de
 * nenhum. A simplificação da malha corta pedaços de orla e ilhas pequenas —
 * Ilhabela fica a 0,2 km do contorno da qualidade intermediária. 5 km cobre
 * esses casos sem arriscar atribuir estado a um ponto de fato perdido no mar.
 */
const TOLERANCIA_KM = 5;
/** Margem em graus para o pré-filtro da tolerância: 5 km ≈ 0,045°; folga pra latitudes altas. */
const MARGEM_GRAUS = 0.06;

let carregamento: Promise<EntradaIndice[]> | null = null;

function montarIndice(malha: MalhaUf): EntradaIndice[] {
  return Object.entries(malha.ufs).map(([sigla, poligonos]) => {
    let latMin = Infinity, lngMin = Infinity, latMax = -Infinity, lngMax = -Infinity;
    for (const poligono of poligonos) {
      for (const [lat, lng] of poligono[0]) {
        if (lat < latMin) latMin = lat;
        if (lat > latMax) latMax = lat;
        if (lng < lngMin) lngMin = lng;
        if (lng > lngMax) lngMax = lng;
      }
    }
    return { sigla, poligonos, caixa: [latMin, lngMin, latMax, lngMax] };
  });
}

function carregar(): Promise<EntradaIndice[]> {
  // Import dinâmico: vira um chunk separado (~240 KB, ~70 KB comprimido) que
  // só desce quando alguém de fato vai precisar de UF — não pesa no carregamento
  // inicial do app pra quem nunca abre uma OS.
  carregamento ??= import('@/data/ufs-ibge.json')
    // `unknown` no meio porque JSON não expressa tupla: o TypeScript infere
    // cada vértice como number[], e não como [lat, lng].
    .then((modulo) => montarIndice((modulo.default ?? modulo) as unknown as MalhaUf))
    .catch((erro) => {
      // Não memoriza a falha: sem isso, uma queda de rede no primeiro acesso
      // deixaria o fallback morto até recarregar a página.
      carregamento = null;
      throw erro;
    });
  return carregamento;
}

/**
 * Começa a baixar a malha sem esperar por ela. O app não tem service worker,
 * então o arquivo só fica disponível sem rede se já tiver descido antes —
 * chamar isto quando o formulário abre (ainda com sinal, em geral) é o que faz
 * o fallback funcionar justamente no caso para o qual ele existe: a busca de
 * endereço falhando por falta de rede, minutos depois.
 */
export function precarregarMalhaUf(): void {
  carregar().catch(() => { /* tenta de novo na próxima chamada */ });
}

const dentroDoPoligono = (lat: number, lng: number, poligono: Poligono) =>
  pontoDentroDoPoligono(lat, lng, poligono[0])
  && !poligono.slice(1).some((buraco) => pontoDentroDoPoligono(lat, lng, buraco));

/** Distância aproximada (km) do ponto ao contorno mais próximo — projeção equirretangular, suficiente na escala de poucos km. */
function distanciaKmAoContorno(lat: number, lng: number, poligonos: Poligono[]): number {
  const k = Math.cos((lat * Math.PI) / 180);
  let menor = Infinity;
  for (const poligono of poligonos) {
    for (const anel of poligono) {
      for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
        const ax = anel[j][1] * k, ay = anel[j][0];
        const bx = anel[i][1] * k, by = anel[i][0];
        const px = lng * k, py = lat;
        const dx = bx - ax, dy = by - ay;
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
        const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) * 111.32;
        if (d < menor) menor = d;
      }
    }
  }
  return menor;
}

/** Núcleo puro, separado do carregamento pra poder ser testado com a malha em memória. */
export function ufNoIndice(lat: number, lng: number, indice: EntradaIndice[]): string | null {
  for (const uf of indice) {
    const [latMin, lngMin, latMax, lngMax] = uf.caixa;
    if (lat < latMin || lat > latMax || lng < lngMin || lng > lngMax) continue;
    if (uf.poligonos.some((p) => dentroDoPoligono(lat, lng, p))) return uf.sigla;
  }

  let maisProxima: { sigla: string; km: number } | null = null;
  for (const uf of indice) {
    const [latMin, lngMin, latMax, lngMax] = uf.caixa;
    if (lat < latMin - MARGEM_GRAUS || lat > latMax + MARGEM_GRAUS
      || lng < lngMin - MARGEM_GRAUS || lng > lngMax + MARGEM_GRAUS) continue;
    const km = distanciaKmAoContorno(lat, lng, uf.poligonos);
    if (km <= TOLERANCIA_KM && (!maisProxima || km < maisProxima.km)) maisProxima = { sigla: uf.sigla, km };
  }
  return maisProxima?.sigla ?? null;
}

export { montarIndice };
export type { MalhaUf, EntradaIndice };

/**
 * Sigla da UF para a coordenada, ou null quando ela está longe de qualquer
 * estado (alto-mar) ou a malha não pôde ser carregada. Nunca lança.
 */
export async function ufPorCoordenada(lat: number, lng: number): Promise<string | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  try {
    return ufNoIndice(lat, lng, await carregar());
  } catch {
    return null;
  }
}
