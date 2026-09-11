// src/lib/geoSelecao.ts

/** Vértice no mesmo formato do Leaflet: [latitude, longitude]. */
export type Vertice = [number, number];

/**
 * Ray casting — conta quantas vezes uma semirreta partindo do ponto cruza as
 * arestas do polígono; ímpar = dentro. Vive num módulo próprio (e não junto
 * do mapa) porque um erro aqui não aparece na tela: ele simplesmente exporta
 * o conjunto errado de pontos, em silêncio.
 *
 * Trata lat/lng como plano cartesiano. Para o polígono desenhado no mapa
 * (bairro, trecho de rodovia) a curvatura não muda o resultado. Para a malha
 * de UFs do IBGE (ver ufPorCoordenada.ts) o tratamento plano é o próprio
 * modelo do dado: em GIS, cada aresta de um polígono em coordenadas
 * geográficas É a reta em lat/lng entre dois vértices. O que limita a
 * precisão ali é a simplificação da malha, não esta conta. Não vale para
 * áreas que cruzam o antimeridiano, que não ocorrem na operação.
 */
export function pontoDentroDoPoligono(lat: number, lng: number, vertices: Vertice[]): boolean {
  if (vertices.length < 3) return false;
  let dentro = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const [latI, lngI] = vertices[i];
    const [latJ, lngJ] = vertices[j];
    const cruza = (lngI > lng) !== (lngJ > lng)
      && lat < ((latJ - latI) * (lng - lngI)) / (lngJ - lngI) + latI;
    if (cruza) dentro = !dentro;
  }
  return dentro;
}
