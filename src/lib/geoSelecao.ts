// src/lib/geoSelecao.ts

/** Vértice no mesmo formato do Leaflet: [latitude, longitude]. */
export type Vertice = [number, number];

/**
 * Ray casting — conta quantas vezes uma semirreta partindo do ponto cruza as
 * arestas do polígono; ímpar = dentro. Vive num módulo próprio (e não junto
 * do mapa) porque um erro aqui não aparece na tela: ele simplesmente exporta
 * o conjunto errado de pontos, em silêncio.
 *
 * Trata lat/lng como plano cartesiano. Isso é adequado para as áreas de uso
 * real — bairro, trecho de rodovia, alguns quilômetros — onde a curvatura não
 * muda o resultado. Não vale para polígonos continentais nem para áreas que
 * cruzam o antimeridiano, que não ocorrem na operação.
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
