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

function ClickToPlace({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

interface LocationMapPickerProps {
  initialLat?: number;
  initialLng?: number;
  onConfirm: (lat: number, lng: number) => void;
  onCancel: () => void;
}

export function LocationMapPicker({ initialLat, initialLng, onConfirm, onCancel }: LocationMapPickerProps) {
  // Sem coords nenhuma, centraliza na região de operação da ZAAZ.
  const [pos, setPos] = useState<[number, number]>([
    initialLat ?? -23.3868,
    initialLng ?? -47.9528,
  ]);

  return (
    <div className="space-y-3 text-left">
      <p className="text-xs font-bold text-slate-500 dark:text-slate-400 text-center">
        Toque no mapa ou arraste o marcador até o local correto
      </p>
      <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 h-64">
        <MapContainer center={pos} zoom={initialLat ? 16 : 12} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; OpenStreetMap contributors'
          />
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
          <ClickToPlace onPick={(lat, lng) => setPos([lat, lng])} />
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
          onClick={() => onConfirm(pos[0], pos[1])}
          className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold transition-colors"
        >
          Confirmar ponto
        </button>
      </div>
    </div>
  );
}