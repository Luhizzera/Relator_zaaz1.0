import { useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Vite não resolve o ícone padrão do Leaflet via CSS relativo — sem isso
// o marcador aparece quebrado (ícone ausente).
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow });

/*
 * Sem coordenada inicial, o mapa abre na região de operação — mas de longe, e
 * SEM marcador.
 *
 * Antes ele abria com um marcador já posto num ponto fixo de Tatuí/SP (zoom
 * 12), e "Confirmar ponto" funcionava de imediato. Medido em 16/09: quatro OS
 * gravadas exatamente nesse ponto, a 0 m, de três técnicos diferentes — uma de
 * Rolândia/PR e uma de Cotia/SP que no mapa de backlog apareciam em Tatuí, e
 * uma de equipe do PR que ficou com coordenada de SP. Quem abria o mapa longe
 * de Tatuí via um mapa qualquer, já com um pino, e confirmava.
 *
 * Agora não existe ponto para confirmar por engano: sem marcador o botão fica
 * desabilitado, e um toque com o mapa afastado só aproxima, não marca — o
 * ponto só é aceito com zoom de rua, onde um toque erra por metros e não por
 * quilômetros.
 */
const CENTRO_REGIAO: [number, number] = [-23.3, -49.5]; // PR, SP e sul de MG no mesmo enquadramento
const ZOOM_REGIAO = 6;
const ZOOM_MINIMO_PARA_MARCAR = 14;
const ZOOM_AO_APROXIMAR = 16;
const ZOOM_COM_COORDENADA = 16;

function ControleDoMapa({ onPick, onZoom }: {
  onPick: (lat: number, lng: number) => void;
  onZoom: (zoom: number) => void;
}) {
  const map = useMapEvents({
    click: (e) => {
      if (map.getZoom() < ZOOM_MINIMO_PARA_MARCAR) {
        // setView, e não flyTo: o voo de zoom 6 para 16 leva vários segundos,
        // e durante ele getZoom() ainda devolve o zoom de partida — o segundo
        // toque, dado no meio do voo, virava outro "aproximar" em vez de
        // marcar. Com essa diferença de zoom, o setView troca de uma vez.
        map.setView(e.latlng, ZOOM_AO_APROXIMAR);
        return;
      }
      onPick(e.latlng.lat, e.latlng.lng);
    },
    zoomend: () => onZoom(map.getZoom()),
  });
  return null;
}

interface LocationMapPickerProps {
  initialLat?: number;
  initialLng?: number;
  onConfirm: (lat: number, lng: number) => void;
  onCancel: () => void;
}

export function LocationMapPicker({ initialLat, initialLng, onConfirm, onCancel }: LocationMapPickerProps) {
  // Com coordenada inicial (GPS capturado, ponto anterior da rota), o marcador
  // nasce nela: ali ajustar é o caso comum, e confirmar sem mexer é legítimo.
  const [pos, setPos] = useState<[number, number] | null>(() =>
    initialLat != null && initialLng != null ? [initialLat, initialLng] : null);
  // O MapContainer só lê centro e zoom na montagem — guardados à parte para
  // não parecer que mudar `pos` recentraliza o mapa.
  const [centroInicial] = useState<[number, number]>(() => pos ?? CENTRO_REGIAO);
  const [zoom, setZoom] = useState(() => (pos ? ZOOM_COM_COORDENADA : ZOOM_REGIAO));
  const [zoomInicial] = useState(zoom);

  const instrucao = pos
    ? 'Arraste o marcador ou toque no mapa para ajustar'
    : zoom < ZOOM_MINIMO_PARA_MARCAR
      ? 'Toque na sua região para aproximar o mapa'
      : 'Toque no local exato do serviço';

  return (
    <div className="space-y-3 text-left">
      <p className="text-xs font-bold text-slate-500 dark:text-slate-400 text-center">
        {instrucao}
      </p>
      <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 h-64">
        <MapContainer center={centroInicial} zoom={zoomInicial} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; OpenStreetMap contributors'
          />
          {pos && (
            <Marker
              position={pos}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const { lat, lng } = e.target.getLatLng();
                  setPos([lat, lng]);
                },
              }}
            />
          )}
          <ControleDoMapa onPick={(lat, lng) => setPos([lat, lng])} onZoom={setZoom} />
        </MapContainer>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-600 dark:text-slate-300"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => pos && onConfirm(pos[0], pos[1])}
          disabled={!pos}
          className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Confirmar ponto
        </button>
      </div>
    </div>
  );
}
