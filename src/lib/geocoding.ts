// src/lib/geocoding.ts

// Nominatim (OpenStreetMap) devolve o nome completo do estado — convertemos pra sigla.
const UF_POR_ESTADO: Record<string, string> = {
  'Acre': 'AC', 'Alagoas': 'AL', 'Amapá': 'AP', 'Amazonas': 'AM', 'Bahia': 'BA',
  'Ceará': 'CE', 'Distrito Federal': 'DF', 'Espírito Santo': 'ES', 'Goiás': 'GO',
  'Maranhão': 'MA', 'Mato Grosso': 'MT', 'Mato Grosso do Sul': 'MS', 'Minas Gerais': 'MG',
  'Pará': 'PA', 'Paraíba': 'PB', 'Paraná': 'PR', 'Pernambuco': 'PE', 'Piauí': 'PI',
  'Rio de Janeiro': 'RJ', 'Rio Grande do Norte': 'RN', 'Rio Grande do Sul': 'RS',
  'Rondônia': 'RO', 'Roraima': 'RR', 'Santa Catarina': 'SC', 'São Paulo': 'SP',
  'Sergipe': 'SE', 'Tocantins': 'TO',
};

export const ufFromStateName = (name?: string) => (name ? (UF_POR_ESTADO[name] ?? name) : '');

export interface ReverseGeocodeResult {
  bairro: string;
  municipio: string;
  uf: string;
  endereco: string;
  numeroEndereco: string;
  referencia: string;
  /** true quando `numeroEndereco` veio do fallback do Overpass (imóvel mais
   * próximo com número mapeado), não do ponto exato — a UI deve deixar claro
   * que é uma aproximação a confirmar em campo. */
  numeroAproximado?: boolean;
}

function distanciaMetros(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

interface OverpassElement {
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

// O servidor público overpass-api.de sozinho falha com frequência ("server
// too busy") sob uso real — confirmado em teste manual. Tenta alguns
// espelhos públicos em sequência, cada um com timeout curto, em vez de
// depender de um único servidor.
const OVERPASS_MIRRORS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];

async function fetchComTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fallback quando o Nominatim não devolve `house_number` no ponto exato —
 * muito comum em infraestrutura de rede (postes/CTOs não têm número
 * próprio). Busca no Overpass o imóvel MAIS PRÓXIMO que tenha
 * `addr:housenumber` mapeado, num raio pequeno (60m). Não é o endereço
 * exato do ponto clicado — é uma aproximação, por isso o chamador deve
 * sinalizar isso ao usuário (ver `numeroAproximado`).
 */
async function buscarNumeroMaisProximo(lat: number, lng: number): Promise<{ numero: string; rua?: string } | null> {
  const query = `[out:json][timeout:8];(node(around:60,${lat},${lng})["addr:housenumber"];way(around:60,${lat},${lng})["addr:housenumber"];);out center 20;`;

  for (const mirror of OVERPASS_MIRRORS) {
    try {
      const res = await fetchComTimeout(mirror, { method: 'POST', body: query }, 7000);
      if (!res.ok) continue;
      const data = await res.json();
      const elementos: OverpassElement[] = data?.elements ?? [];

      let maisProximo: { numero: string; rua?: string; distancia: number } | null = null;
      for (const el of elementos) {
        const numero = el.tags?.['addr:housenumber'];
        const elLat = el.lat ?? el.center?.lat;
        const elLon = el.lon ?? el.center?.lon;
        if (!numero || elLat == null || elLon == null) continue;
        const distancia = distanciaMetros(lat, lng, elLat, elLon);
        if (!maisProximo || distancia < maisProximo.distancia) {
          maisProximo = { numero, rua: el.tags?.['addr:street'], distancia };
        }
      }
      if (maisProximo) return { numero: maisProximo.numero, rua: maisProximo.rua };
      // Servidor respondeu certinho mas não achou nada perto — não adianta
      // tentar outro espelho, todos leem a mesma base de dados.
      return null;
    } catch (err) {
      console.warn(`[Geocoding] Espelho Overpass indisponível (${mirror}):`, err);
      // tenta o próximo espelho
    }
  }
  return null;
}

/**
 * Geocodificação reversa via Nominatim (OpenStreetMap).
 * Retorna null em caso de falha de rede/CORS/rate-limit — quem chama decide
 * o que fazer (manter coords sem endereço, pedir pro usuário digitar, etc).
 *
 * `numeroEndereco` frequentemente vem vazio do Nominatim — o OpenStreetMap
 * só tem `addr:housenumber` mapeado quando alguém cadastrou aquele ponto
 * específico, o que é raro em áreas rurais/infraestrutura de rede. Nesse
 * caso, tentamos um fallback via Overpass (imóvel numerado mais próximo,
 * até 60m) antes de desistir e deixar o campo em branco pro usuário digitar.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult | null> {
  try {
    const res = await fetchComTimeout(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1&zoom=18&accept-language=pt-BR`,
      {},
      8000,
    );
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data?.address ?? {};

    const resultado: ReverseGeocodeResult = {
      bairro: addr.suburb || addr.neighbourhood || addr.city_district || '',
      municipio: addr.city || addr.town || addr.village || addr.municipality || '',
      uf: ufFromStateName(addr.state),
      endereco: addr.road || addr.pedestrian || '',
      numeroEndereco: addr.house_number || '',
      referencia: addr.amenity || addr.shop || addr.tourism || '',
    };

    if (!resultado.numeroEndereco) {
      const proximo = await buscarNumeroMaisProximo(lat, lng);
      if (proximo) {
        resultado.numeroEndereco = proximo.numero;
        resultado.numeroAproximado = true;
        // Se o Nominatim também não achou o nome da rua, aproveita o da
        // mesma busca (evita deixar endereço em branco com número preenchido).
        if (!resultado.endereco && proximo.rua) resultado.endereco = proximo.rua;
      }
    }

    return resultado;
  } catch {
    return null;
  }
}
