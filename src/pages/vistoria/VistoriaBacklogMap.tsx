import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Polygon, CircleMarker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Loader2, Download, XCircle, ArrowLeft } from 'lucide-react';
import { PoligonoSelecaoIcon } from '@/components/icons/PoligonoSelecaoIcon';
import { PageHeader } from '@/components/PageHeader';
import { GerarCorretivaModal } from '@/components/GerarCorretivaModal';
import { ExportarPendenciasModal, type EscopoExportacao } from '@/components/ExportarPendenciasModal';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh';
import { listPendenciasBacklog } from '@/lib/vistoriaService';
import { listEquipes, listEquipesDoSupervisor } from '@/lib/manutencaoService';
import { EquipeRow } from '@/lib/supabaseClient';
import { PendenciaBacklog, CorPendencia } from '@/types/vistoria';
import { pontoDentroDoPoligono, type Vertice } from '@/lib/geoSelecao';
import { cn } from '@/lib/utils';

// Mesmo motivo do LocationMapPicker.tsx — Vite não resolve o ícone padrão do
// Leaflet via CSS relativo. Aqui nem chega a ser usado (ícones são sempre
// os círculos coloridos abaixo), mas o Leaflet ainda tenta carregar o
// ícone-padrão internamente se algo não tiver `icon` explícito.
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow });

const COR_HEX: Record<CorPendencia, string> = {
  vermelho: '#dc2626',
  laranja: '#f59e0b',
  verde: '#16a34a',
};

const COR_LABEL: Record<CorPendencia, string> = {
  vermelho: 'Sem OS',
  laranja: 'OS em andamento',
  verde: 'OS concluída',
};

function pinIcon(cor: CorPendencia, selecionado: boolean) {
  // O ponto selecionado cresce e ganha anel — precisa ser distinguível de
  // relance mesmo num aglomerado denso, que é o caso de uso do polígono.
  const tamanho = selecionado ? 30 : 22;
  const anel = selecionado
    ? 'box-shadow:0 0 0 4px rgba(14,165,233,0.85), 0 1px 6px rgba(0,0,0,0.45);'
    : 'box-shadow:0 1px 4px rgba(0,0,0,0.4);';
  return L.divIcon({
    className: '',
    html: `<div style="width:${tamanho}px;height:${tamanho}px;border-radius:9999px;background:${COR_HEX[cor]};border:3px solid white;${anel}"></div>`,
    iconSize: [tamanho, tamanho],
    iconAnchor: [tamanho / 2, tamanho / 2],
  });
}

/**
 * Captura os cliques do mapa enquanto a ferramenta está desenhando e desliga
 * os gestos do Leaflet que competem com ela: `boxZoom` é Shift+arrastar
 * (exatamente o atalho da ferramenta) e `doubleClickZoom` roubaria o duplo
 * clique que finaliza o polígono.
 */
function CapturaDesenho({
  desenhando, onVertice, onFinalizar,
}: {
  desenhando: boolean;
  onVertice: (v: Vertice) => void;
  onFinalizar: () => void;
}) {
  const map = useMapEvents({
    click: (e) => { if (desenhando) onVertice([e.latlng.lat, e.latlng.lng]); },
    dblclick: () => { if (desenhando) onFinalizar(); },
  });

  useEffect(() => {
    if (desenhando) {
      map.boxZoom.disable();
      map.doubleClickZoom.disable();
    } else {
      map.boxZoom.enable();
      map.doubleClickZoom.enable();
    }
    return () => {
      map.boxZoom.enable();
      map.doubleClickZoom.enable();
    };
  }, [desenhando, map]);

  return null;
}

export default function VistoriaBacklogMap() {
  const navigate = useNavigate();
  const { canManageOrders, isGestor, profile } = useAuth();
  const [pendencias, setPendencias] = useState<PendenciaBacklog[]>([]);
  const [equipes, setEquipes] = useState<EquipeRow[]>([]);
  const [equipeId, setEquipeId] = useState('');
  const [loading, setLoading] = useState(true);
  const [selecionada, setSelecionada] = useState<PendenciaBacklog | null>(null);

  const [vertices, setVertices] = useState<Vertice[]>([]);
  const [desenhando, setDesenhando] = useState(false);
  // Distingue quem iniciou o desenho: no modo Shift o polígono congela ao
  // soltar a tecla; no modo botão ele fica ativo até finalizar ou cancelar.
  const [modoShift, setModoShift] = useState(false);
  const [exportando, setExportando] = useState<EscopoExportacao | null>(null);

  useEffect(() => {
    if (!canManageOrders) navigate('/', { replace: true });
  }, [canManageOrders, navigate]);

  useEffect(() => {
    const promise = isGestor ? listEquipes('manutencao') : (profile ? listEquipesDoSupervisor(profile.id, 'manutencao') : Promise.resolve([]));
    promise.then(setEquipes).catch((err) => console.error('[Vistoria] Erro ao carregar equipes:', err));
  }, [isGestor, profile]);

  const carregar = () => {
    setLoading(true);
    listPendenciasBacklog(equipeId ? { equipeId } : undefined)
      .then(setPendencias)
      .catch((err) => console.error('[Vistoria] Erro ao carregar backlog:', err))
      .finally(() => setLoading(false));
  };

  useEffect(carregar, [equipeId]);
  useRealtimeRefresh([{ table: 'pendencias_vistoria' }], carregar);

  const limparPoligono = useCallback(() => {
    setVertices([]);
    setDesenhando(false);
    setModoShift(false);
  }, []);

  // Shift+clique é o gesto nativo do navegador pra ESTENDER seleção de texto:
  // sem isto, desenhar o polígono ia pintando de azul todo o texto da página
  // entre um clique e outro. `user-select: none` enquanto desenha mata o
  // comportamento na origem; o removeAllRanges limpa o que já estiver marcado.
  useEffect(() => {
    if (!desenhando) return;
    const anterior = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    window.getSelection()?.removeAllRanges();
    return () => { document.body.style.userSelect = anterior; };
  }, [desenhando]);

  // Atalho Shift: segurar começa um polígono novo, soltar congela o que foi
  // desenhado. `repeat` filtra o autorepeat do teclado, que senão reiniciaria
  // o desenho a cada tick enquanto a tecla estivesse pressionada.
  const desenhandoRef = useRef(false);
  desenhandoRef.current = desenhando;
  const modoShiftRef = useRef(false);
  modoShiftRef.current = modoShift;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { limparPoligono(); return; }
      if (e.key !== 'Shift' || e.repeat) return;
      if (desenhandoRef.current && !modoShiftRef.current) return; // modo botão em andamento — não interfere
      setVertices([]);
      setDesenhando(true);
      setModoShift(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== 'Shift' || !modoShiftRef.current) return;
      setDesenhando(false);
      setModoShift(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [limparPoligono]);

  const alternarFerramenta = () => {
    // Segundo clique = cancelar (some com polígono e seleção). Também serve
    // de saída quando o desenho está em andamento.
    if (desenhando || vertices.length > 0) { limparPoligono(); return; }
    setVertices([]);
    setModoShift(false);
    setDesenhando(true);
  };

  const contagem = useMemo(() => {
    const c: Record<CorPendencia, number> = { vermelho: 0, laranja: 0, verde: 0 };
    pendencias.forEach((p) => { c[p.cor] += 1; });
    return c;
  }, [pendencias]);

  const selecionadas = useMemo(
    () => (vertices.length < 3 ? [] : pendencias.filter((p) => pontoDentroDoPoligono(p.latitude, p.longitude, vertices))),
    [pendencias, vertices],
  );
  const idsSelecionados = useMemo(() => new Set(selecionadas.map((p) => p.id)), [selecionadas]);

  const center = useMemo<[number, number]>(() => {
    if (pendencias.length === 0) return [-23.3868, -47.9528];
    return [pendencias[0].latitude, pendencias[0].longitude];
  }, [pendencias]);

  const handlePinClick = (p: PendenciaBacklog) => {
    // Durante o desenho o clique pertence ao polígono, não ao pino — senão
    // marcar um vértice em cima de um ponto abriria o modal de corretiva.
    if (desenhando) return;
    if (p.cor === 'vermelho') {
      setSelecionada(p);
    } else if (p.ordemCorretivaId) {
      navigate(`/manutencao/ordens/${p.ordemCorretivaId}`);
    }
  };

  if (!canManageOrders) return null;

  const ferramentaLigada = desenhando || vertices.length > 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-6 space-y-4">
      <PageHeader
        title="Backlog de Vistoria"
        subtitle="Pendências registradas nas rotas, plotadas no mapa"
        backTo="/vistoria/ordens"
        rightContent={(
          // O PageHeader troca o "voltar" pelo ☰ da sidebar quando quem olha
          // gerencia OS — então, pra gestor/supervisor, o backTo nunca
          // aparecia e não havia saída daqui de volta pra Vistoria.
          <button
            onClick={() => navigate('/vistoria/ordens')}
            className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-bold px-4 py-2.5 rounded-xl transition-colors"
          >
            <ArrowLeft className="icon-md" /> Vistoria
          </button>
        )}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setExportando(selecionadas.length > 0 ? 'selecionados' : 'todos')}
          className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-bold px-3 py-2 rounded-xl transition-colors"
        >
          <Download className="icon-sm" /> Exportar
        </button>

        <select
          value={equipeId}
          onChange={(e) => setEquipeId(e.target.value)}
          className="px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
        >
          <option value="">Todas as equipes</option>
          {equipes.map((eq) => <option key={eq.id} value={eq.id}>{eq.nome}</option>)}
        </select>

        <button
          onClick={alternarFerramenta}
          aria-pressed={ferramentaLigada}
          title="Segure Shift e clique no mapa, ou use este botão. ESC cancela."
          className={cn(
            'flex items-center gap-2 px-3 py-2 text-sm font-bold rounded-xl border transition-colors',
            ferramentaLigada
              ? 'bg-sky-500 border-sky-500 text-white'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200',
          )}
        >
          {ferramentaLigada ? <XCircle className="icon-sm" /> : <PoligonoSelecaoIcon className="icon-sm" />}
          {ferramentaLigada ? 'Cancelar polígono' : 'Criar polígono'}
        </button>

        <div className="flex items-center gap-4 text-xs font-bold text-slate-500 dark:text-slate-400">
          {(['vermelho', 'laranja', 'verde'] as CorPendencia[]).map((cor) => (
            <span key={cor} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: COR_HEX[cor] }} />
              {COR_LABEL[cor]} ({contagem[cor]})
            </span>
          ))}
        </div>
      </div>

      {desenhando && (
        <div className="flex items-center gap-2 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800/50 rounded-xl px-3 py-2 text-xs font-bold text-sky-800 dark:text-sky-300">
          <PoligonoSelecaoIcon className="w-3.5 h-3.5 shrink-0" />
          {modoShift
            ? 'Clique no mapa para marcar vértices. Solte o Shift para congelar o polígono.'
            : 'Clique no mapa para marcar vértices. Duplo clique finaliza, ESC cancela.'}
          <span className="ml-auto shrink-0">{vertices.length} vértice(s)</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="icon-md animate-spin mr-2" /> Carregando...
        </div>
      ) : (
        <div className="relative">
          <div className={cn(
            'rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 h-[65vh]',
            desenhando && 'cursor-crosshair',
          )}
          >
            <MapContainer center={center} zoom={pendencias.length ? 13 : 11} style={{ height: '100%', width: '100%' }}>
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; OpenStreetMap contributors'
              />

              <CapturaDesenho
                desenhando={desenhando}
                onVertice={(v) => {
                  // Rede de segurança: se algum trecho escapou do user-select
                  // (ex: seleção iniciada antes do Shift), some com ela aqui.
                  window.getSelection()?.removeAllRanges();
                  setVertices((antes) => [...antes, v]);
                }}
                onFinalizar={() => { setDesenhando(false); setModoShift(false); }}
              />

              {vertices.length >= 2 && (
                <Polygon
                  positions={vertices}
                  pathOptions={{ color: '#0ea5e9', weight: 3, fillOpacity: 0.12, dashArray: desenhando ? '6 6' : undefined }}
                />
              )}
              {vertices.map((v, i) => (
                <CircleMarker
                  key={`${v[0]}-${v[1]}-${i}`}
                  center={v}
                  radius={4}
                  pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#0ea5e9', fillOpacity: 1 }}
                />
              ))}

              {pendencias.map((p) => (
                <Marker
                  key={p.id}
                  position={[p.latitude, p.longitude]}
                  icon={pinIcon(p.cor, idsSelecionados.has(p.id))}
                  eventHandlers={{ click: () => handlePinClick(p) }}
                />
              ))}
            </MapContainer>
          </div>

          {/* Barra de ação da seleção — aparece só quando há pontos dentro do
              polígono, que é o gatilho pra exportação do recorte. */}
          {selecionadas.length > 0 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[500] flex items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl px-4 py-2.5">
              <span className="text-sm font-black text-slate-800 dark:text-slate-100">
                {selecionadas.length} ponto(s) selecionado(s)
              </span>
              <button
                onClick={() => setExportando('selecionados')}
                className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
              >
                <Download size={13} /> Exportar
              </button>
              <button
                onClick={limparPoligono}
                className="text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                Limpar
              </button>
            </div>
          )}
        </div>
      )}

      {selecionada && (
        <GerarCorretivaModal
          pendencia={selecionada}
          onClose={() => setSelecionada(null)}
          onGerada={carregar}
          onAbrirOrdem={(ordemId) => navigate(`/manutencao/ordens/${ordemId}`)}
        />
      )}

      {exportando && (
        <ExportarPendenciasModal
          pendencias={pendencias}
          selecionadas={selecionadas}
          escopoInicial={exportando}
          onClose={() => setExportando(null)}
        />
      )}
    </div>
  );
}
