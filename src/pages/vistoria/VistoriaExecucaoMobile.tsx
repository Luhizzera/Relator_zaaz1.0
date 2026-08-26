import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Loader2, Camera, MapPin, PlayCircle, Flag, X, CheckCircle2, Navigation, Image as ImageIcon,
  CalendarDays, FileText, MapPinned, CloudOff, RefreshCw,
} from 'lucide-react';
import { LocationMapPicker } from '@/components/LocationMapPicker';
import { getOrdemVistoria, addPendencia, iniciarVistoria, concluirVistoria } from '@/lib/vistoriaService';
import {
  enqueuePendencia, listPendentes, flushPendentes, type PendenciaPendente,
} from '@/lib/vistoriaOfflineQueue';
import { getSignedFotoVistoriaUrl } from '@/lib/supabaseClient';
import { OrdemVistoria, PendenciaVistoria, STATUS_VISTORIA_LABEL } from '@/types/vistoria';
import { PROBLEMAS_CTO_GRUPOS, serializeProblemas, deserializeProblemas } from '@/types/manutencao';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh';
import { BackButton } from '@/components/BackButton';
import { ThemeToggle } from '@/components/ThemeToggle';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

/** Mesmo princípio de ManutencaoExecucaoMobile.tsx (max 1200px, jpeg 0.7) — comprime antes do upload. */
function normalizeImage(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 1200;
        let { width, height } = img;
        if (width > height && width > maxDim) { height *= maxDim / width; width = maxDim; }
        else if (height > maxDim) { width *= maxDim / height; height = maxDim; }
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d')?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
    };
  });
}

type GeoStatus = 'idle' | 'locating' | 'success' | 'error';

/**
 * Onde o mapa abre quando o GPS falha e ainda não há ponto marcado. Sempre a
 * referência mais próxima do técnico: a pendência anterior da rota, ou — se
 * for a primeira — o UTM Início definido na abertura. Sem nenhuma das duas,
 * o LocationMapPicker cai no fallback fixo dele.
 */
type ReferenciaMapa = { lat: number; lng: number; origem: 'pendencia_anterior' | 'utm_inicio' };

function NovaPendenciaModal({
  busy,
  referencia,
  onClose,
  onConfirmar,
}: {
  busy: boolean;
  referencia: ReferenciaMapa | null;
  onClose: () => void;
  onConfirmar: (dataUrl: string, lat: number, lng: number, observacao: string, problemas: string) => void;
}) {
  const [foto, setFoto] = useState<string | null>(null);
  const [geo, setGeo] = useState<GeoStatus>('idle');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoErro, setGeoErro] = useState<string | null>(null);
  const [observacao, setObservacao] = useState('');
  const [problemas, setProblemas] = useState<string[]>([]);
  // Sem GPS (permissão negada ou sem sinal) o técnico ficava travado — só
  // restava "Tentar de novo". Agora o mapa abre sozinho como saída, e a
  // pendência aceita coordenada marcada à mão. `manual` fica registrado só
  // pra UI avisar que aquele ponto não veio do GPS.
  const [origemCoords, setOrigemCoords] = useState<'gps' | 'manual' | null>(null);
  const [mostrarMapa, setMostrarMapa] = useState(false);

  const capturarGeo = () => {
    const falhar = (msg: string) => {
      setGeo('error');
      setGeoErro(msg);
      // Só abre o mapa automaticamente se ainda não houver ponto — se o
      // técnico já marcou um e mandou tentar o GPS de novo, não some com ele.
      setMostrarMapa((antes) => antes || !coords);
    };

    if (!navigator.geolocation) {
      falhar('Este navegador não suporta geolocalização.');
      return;
    }
    setGeo('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setOrigemCoords('gps');
        setGeo('success');
        setMostrarMapa(false);
      },
      (err) => {
        falhar(err.code === err.PERMISSION_DENIED
          ? 'Permissão de localização negada.'
          : 'Não foi possível obter sua localização.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  const handleFotoSelected = async (file: File | undefined) => {
    if (!file) return;
    const dataUrl = await normalizeImage(file);
    setFoto(dataUrl);
    capturarGeo();
  };

  const toggleProblema = (item: string) =>
    setProblemas((antes) => (antes.includes(item) ? antes.filter((p) => p !== item) : [...antes, item]));

  // Basta ter foto e um ponto — não importa se veio do GPS ou do mapa. O
  // problema marcado fica opcional de propósito: nem toda pendência cabe na
  // taxonomia de CTO, e travar o registro em campo por causa disso seria pior
  // que receber a pendência só com a observação livre.
  const podeConfirmar = !!foto && !!coords && !busy;

  return (
    <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900">
          <h2 className="text-base font-black text-slate-800 dark:text-slate-100">Registrar pendência</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Fechar">
            <X className="icon-md" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {!foto ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col items-center justify-center gap-2 h-40 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 cursor-pointer hover:border-amber-400 transition-colors">
                <Camera className="icon-lg text-slate-400" />
                <span className="text-sm font-bold text-slate-500 text-center">Tirar foto</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => handleFotoSelected(e.target.files?.[0])}
                />
              </label>
              <label className="flex flex-col items-center justify-center gap-2 h-40 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 cursor-pointer hover:border-amber-400 transition-colors">
                <ImageIcon className="icon-lg text-slate-400" />
                <span className="text-sm font-bold text-slate-500 text-center">Escolher da galeria</span>
                {/* Sem `capture` — o navegador oferece a galeria em vez de forçar a câmera. */}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFotoSelected(e.target.files?.[0])}
                />
              </label>
            </div>
          ) : (
            <img src={foto} alt="Pendência" className="w-full h-40 object-cover rounded-xl" />
          )}

          {foto && (
            <div className="space-y-2">
              <div className={cn(
                'flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm',
                origemCoords === 'gps' && 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400',
                origemCoords === 'manual' && 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400',
                !coords && geo === 'locating' && 'bg-slate-50 dark:bg-slate-800 text-slate-500',
                !coords && geo === 'error' && 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
              )}
              >
                {geo === 'locating' && !coords
                  ? <Loader2 size={16} className="animate-spin shrink-0" />
                  : <MapPin size={16} className="shrink-0" />}
                <span className="flex-1 min-w-0">
                  {coords
                    ? `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`
                    : geo === 'locating' ? 'Obtendo localização...' : geoErro}
                  {origemCoords === 'manual' && (
                    <span className="block text-[11px] font-bold opacity-80">Marcado no mapa (sem GPS)</span>
                  )}
                </span>
                {geo !== 'locating' && (
                  <button onClick={capturarGeo} className="text-xs font-bold underline shrink-0">
                    {coords ? 'Usar GPS' : 'Tentar de novo'}
                  </button>
                )}
              </div>

              {/* Saída quando o GPS falha: marcar o ponto na mão. Abre sozinho
                  no erro (ver capturarGeo) e continua acessível pra corrigir. */}
              {mostrarMapa ? (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-2">
                  {/* O marcador nasce em cima da referência — sem esse aviso o
                      técnico pode confirmar sem mover e gravar a pendência no
                      mesmo ponto da anterior. */}
                  {!coords && referencia && (
                    <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400 text-center">
                      Mapa aberto {referencia.origem === 'pendencia_anterior' ? 'na pendência anterior' : 'no UTM Início da rota'} — arraste o marcador até o ponto atual.
                    </p>
                  )}
                  <LocationMapPicker
                    initialLat={coords?.lat ?? referencia?.lat}
                    initialLng={coords?.lng ?? referencia?.lng}
                    onCancel={() => setMostrarMapa(false)}
                    onConfirm={(lat, lng) => {
                      setCoords({ lat, lng });
                      setOrigemCoords('manual');
                      setMostrarMapa(false);
                    }}
                  />
                </div>
              ) : (
                geo === 'error' && (
                  <button
                    onClick={() => setMostrarMapa(true)}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300"
                  >
                    <MapPin size={13} /> {coords ? 'Ajustar ponto no mapa' : 'Marcar no mapa'}
                  </button>
                )
              )}
            </div>
          )}

          {/* Mesmo vocabulário do wizard de abertura de OS
              (PROBLEMAS_CTO_GRUPOS): o que for marcado aqui vira ocorrência e
              checklist de solução na corretiva, sem ninguém redigitar. Em
              chips e não em lista de checkbox porque isto é uma bottom sheet
              no celular, com foto e mapa acima — 14 linhas de checkbox
              empurrariam o botão de salvar pra fora da tela. */}
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1.5 block">
              Problema encontrado
              <span className="ml-1.5 font-normal normal-case text-slate-400">opcional</span>
            </label>
            <div className="space-y-2.5">
              {PROBLEMAS_CTO_GRUPOS.map((grupo) => (
                <div key={grupo.grupo}>
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400 mb-1">{grupo.grupo}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {grupo.itens.map((item) => {
                      const ativo = problemas.includes(item);
                      return (
                        <button
                          key={item}
                          type="button"
                          aria-pressed={ativo}
                          onClick={() => toggleProblema(item)}
                          className={cn(
                            'px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors text-left',
                            ativo
                              ? 'bg-amber-500 border-amber-500 text-white'
                              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300',
                          )}
                        >
                          {item}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1.5 block">
              Observação
            </label>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={3}
              placeholder="Descreva o que foi encontrado..."
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 resize-none"
            />
          </div>

          <button
            onClick={() => coords && foto && onConfirmar(foto, coords.lat, coords.lng, observacao.trim(), serializeProblemas(problemas))}
            disabled={!podeConfirmar}
            className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-bold py-2.5 rounded-xl transition-colors"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : 'Salvar pendência'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PendenciaCard({ pendencia }: { pendencia: PendenciaVistoria }) {
  const [url, setUrl] = useState<string | null>(null);
  const problemasMarcados = deserializeProblemas(pendencia.problemas);

  useEffect(() => {
    let ativo = true;
    getSignedFotoVistoriaUrl(pendencia.storagePath).then((u) => { if (ativo) setUrl(u); });
    return () => { ativo = false; };
  }, [pendencia.storagePath]);

  return (
    <div className="flex items-center gap-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3">
      {url ? (
        <img src={url} alt="Pendência" className="w-14 h-14 rounded-xl object-cover shrink-0" />
      ) : (
        <div className="w-14 h-14 rounded-xl bg-slate-100 dark:bg-slate-800 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-400 flex items-center gap-1">
          <MapPin size={10} /> {pendencia.latitude.toFixed(6)}, {pendencia.longitude.toFixed(6)}
        </p>
        {problemasMarcados.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {problemasMarcados.map((p) => (
              <span key={p} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                {p}
              </span>
            ))}
          </div>
        )}
        {pendencia.observacao && (
          <p className="text-sm text-slate-700 dark:text-slate-200 truncate mt-0.5">{pendencia.observacao}</p>
        )}
      </div>
      {pendencia.ordemCorretivaId && (
        <span className="text-[10px] font-black px-2 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 shrink-0">
          OS gerada
        </span>
      )}
    </div>
  );
}

/** Mesmo layout do PendenciaCard, mas lendo a foto do dataUrl guardado no aparelho — ainda não existe storagePath. */
function PendenciaPendenteCard({ pendencia }: { pendencia: PendenciaPendente }) {
  const problemasMarcados = deserializeProblemas(pendencia.problemas);

  return (
    <div className="flex items-center gap-3 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-amber-300 dark:border-amber-800 p-3">
      <img src={pendencia.dataUrl} alt="Pendência não enviada" className="w-14 h-14 rounded-xl object-cover shrink-0 opacity-70" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-400 flex items-center gap-1">
          <MapPin size={10} /> {pendencia.latitude.toFixed(6)}, {pendencia.longitude.toFixed(6)}
        </p>
        {problemasMarcados.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {problemasMarcados.map((p) => (
              <span key={p} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                {p}
              </span>
            ))}
          </div>
        )}
        {pendencia.observacao && (
          <p className="text-sm text-slate-700 dark:text-slate-200 truncate mt-0.5">{pendencia.observacao}</p>
        )}
      </div>
      <span className="flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 shrink-0">
        <CloudOff size={10} /> No aparelho
      </span>
    </div>
  );
}

export default function VistoriaExecucaoMobile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile, canManageOrders, isTecnicoManutencao } = useAuth();
  const [ordem, setOrdem] = useState<OrdemVistoria | null>(null);
  const [loading, setLoading] = useState(true);
  const [avancando, setAvancando] = useState(false);
  const [showPendencia, setShowPendencia] = useState(false);
  const [salvandoPendencia, setSalvandoPendencia] = useState(false);
  const [pendentes, setPendentes] = useState<PendenciaPendente[]>([]);
  const [sincronizando, setSincronizando] = useState(false);

  const carregar = () => {
    if (!id) return;
    setLoading(true);
    getOrdemVistoria(id)
      .then(setOrdem)
      .catch((err) => console.error('[Vistoria] Erro ao carregar rota:', err))
      .finally(() => setLoading(false));
  };

  const atualizarPendentes = () => {
    if (id) listPendentes(id).then(setPendentes);
  };

  // Também disparada pelo botão "Tentar agora" — o evento 'online' do
  // navegador não é confiável em conexão de campo instável (mesmo motivo
  // documentado em ManutencaoExecucaoMobile.tsx).
  const trySync = useCallback(async () => {
    if (!id) return;
    setSincronizando(true);
    try {
      const enviadas = await flushPendentes(id);
      if (enviadas > 0) {
        toast({ title: `${enviadas} pendência(s) sincronizada(s)` });
        carregar();
      }
      atualizarPendentes();
    } finally {
      setSincronizando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!id) return;
    atualizarPendentes();
    trySync();
    window.addEventListener('online', trySync);
    return () => window.removeEventListener('online', trySync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(carregar, [id]);
  useRealtimeRefresh(
    [{ table: 'ordens_vistoria', filter: `id=eq.${id}` }, { table: 'pendencias_vistoria', filter: `ordem_vistoria_id=eq.${id}` }],
    carregar,
  );

  const souDono = !!ordem && ordem.tecnicoId === profile?.id;
  const podeAgir = isTecnicoManutencao && souDono;

  // `pendencias` vem ordenada por created_at ascendente (getOrdemVistoria),
  // então a última do array é o ponto mais recente da rota.
  const referenciaMapa = useMemo<ReferenciaMapa | null>(() => {
    if (!ordem) return null;
    // A fila offline vem depois das já salvas: se o técnico registrou os
    // últimos pontos sem sinal, o mais recente está nela, não no servidor —
    // ignorá-la abriria o mapa num ponto vencido, vários quilômetros atrás.
    const ultimaFila = pendentes[pendentes.length - 1];
    if (ultimaFila) return { lat: ultimaFila.latitude, lng: ultimaFila.longitude, origem: 'pendencia_anterior' };
    const anterior = ordem.pendencias[ordem.pendencias.length - 1];
    if (anterior) return { lat: anterior.latitude, lng: anterior.longitude, origem: 'pendencia_anterior' };
    if (ordem.utmInicioLat != null && ordem.utmInicioLng != null) {
      return { lat: ordem.utmInicioLat, lng: ordem.utmInicioLng, origem: 'utm_inicio' };
    }
    return null;
  }, [ordem, pendentes]);

  const handleIniciar = async () => {
    if (!ordem) return;
    setAvancando(true);
    try {
      await iniciarVistoria(ordem.id);
      toast({ title: 'Rota iniciada' });
      carregar();
    } catch (err) {
      console.error('[Vistoria] Erro ao iniciar rota:', err);
      toast({ title: 'Não foi possível iniciar a rota', variant: 'destructive' });
    } finally {
      setAvancando(false);
    }
  };

  const handleConcluir = async () => {
    if (!ordem) return;
    // Concluir com a fila cheia é o caminho silencioso pra perder trabalho: o
    // técnico encerra, fecha o app e as pendências guardadas nunca sobem.
    // Tenta esvaziar antes; se não der, barra e explica.
    //
    // Consulta a fila DIRETO (listPendentes), não o estado React `pendentes`:
    // se os dois saírem de sincronia por qualquer motivo, o estado desatualizado
    // faria a trava ser pulada em silêncio — exatamente o caso que ela existe
    // pra impedir. IndexedDB é a fonte da verdade aqui.
    const naFila = await listPendentes(ordem.id);
    if (naFila.length > 0) {
      const enviadas = await flushPendentes(ordem.id);
      atualizarPendentes();
      if (enviadas > 0) carregar();
      const restantes = await listPendentes(ordem.id);
      if (restantes.length > 0) {
        toast({
          title: 'Ainda há pendências não enviadas',
          description: `${restantes.length} registro(s) só existem neste aparelho. Conclua a rota depois de sincronizar.`,
          variant: 'destructive',
        });
        return;
      }
    }
    setAvancando(true);
    try {
      await concluirVistoria(ordem.id);
      toast({ title: 'Rota concluída' });
      carregar();
    } catch (err) {
      console.error('[Vistoria] Erro ao concluir rota:', err);
      toast({ title: 'Não foi possível concluir a rota', variant: 'destructive' });
    } finally {
      setAvancando(false);
    }
  };

  const handleSalvarPendencia = async (dataUrl: string, lat: number, lng: number, observacao: string, problemas: string) => {
    if (!ordem) return;
    setSalvandoPendencia(true);
    // Guarda no aparelho ANTES de tentar a rede quando já se sabe que não há
    // conexão — o registro do técnico não pode depender do upload dar certo.
    const guardarLocalmente = async () => {
      await enqueuePendencia({
        ordemVistoriaId: ordem.id,
        dataUrl,
        latitude: lat,
        longitude: lng,
        observacao: observacao || undefined,
        problemas: problemas || undefined,
      });
      toast({
        title: 'Sem conexão',
        description: 'Pendência salva no aparelho — será enviada quando a conexão voltar.',
      });
      setShowPendencia(false);
      atualizarPendentes();
    };

    try {
      if (!navigator.onLine) throw new Error('offline');
      await addPendencia(ordem.id, dataUrl, lat, lng, observacao || undefined, problemas || undefined);
      toast({ title: 'Pendência registrada' });
      setShowPendencia(false);
      carregar();
    } catch (err) {
      // Falha de rede com o navegador ainda se dizendo online (timeout, DNS,
      // captive portal) cai aqui também — guardar é sempre melhor que perder.
      if (!navigator.onLine) {
        await guardarLocalmente();
      } else {
        console.error('[Vistoria] Erro ao registrar pendência:', err);
        toast({ title: 'Não foi possível registrar a pendência', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
      }
    } finally {
      setSalvandoPendencia(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">
        <Loader2 className="icon-md animate-spin mr-2" /> Carregando...
      </div>
    );
  }

  if (!ordem) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <p className="font-bold text-slate-700 dark:text-slate-200">Rota não encontrada</p>
          <button onClick={() => navigate('/vistoria/ordens')} className="text-sm font-bold text-amber-600 hover:underline mt-2">
            Voltar para a lista
          </button>
        </div>
      </div>
    );
  }

  if (!canManageOrders && ordem.tecnicoId && !souDono) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <p className="font-bold text-slate-700 dark:text-slate-200">Esta rota não é sua</p>
          <button onClick={() => navigate('/vistoria/ordens')} className="text-sm font-bold text-amber-600 hover:underline mt-3">
            Voltar para a lista
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 space-y-4 pb-24">
      <div className="flex items-center justify-between gap-3">
        <BackButton to="/vistoria/ordens" />
        <ThemeToggle />
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
        <div>
          <p className="text-lg font-black text-slate-800 dark:text-slate-100">{ordem.numero} — {ordem.titulo}</p>
          <p className="text-xs text-slate-400 mt-1">{ordem.equipe || 'Sem equipe'} • {ordem.tecnico || 'Sem técnico'}</p>
          <span className="inline-block mt-2 text-[10px] font-black px-2 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            {STATUS_VISTORIA_LABEL[ordem.status]}
          </span>
        </div>

        {ordem.dataPrevista && (
          <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
            <CalendarDays size={13} className="shrink-0 text-slate-400" />
            {new Date(`${ordem.dataPrevista}T00:00:00`).toLocaleDateString('pt-BR')}
          </div>
        )}

        {ordem.observacoes && (
          <div className="flex items-start gap-1.5 text-xs text-slate-600 dark:text-slate-300">
            <FileText size={13} className="shrink-0 text-slate-400 mt-0.5" />
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Descrição da atividade</p>
              <p>{ordem.observacoes}</p>
            </div>
          </div>
        )}

        {(ordem.utmInicioLat != null || ordem.utmFimLat != null) && (
          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
            {ordem.utmInicioLat != null && ordem.utmInicioLng != null && (
              <div className="flex items-start gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                <MapPinned size={13} className="shrink-0 text-green-500 mt-0.5" />
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">UTM Início</p>
                  <p>{ordem.utmInicioLat.toFixed(6)}, {ordem.utmInicioLng.toFixed(6)}</p>
                </div>
              </div>
            )}
            {ordem.utmFimLat != null && ordem.utmFimLng != null && (
              <div className="flex items-start gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                <MapPinned size={13} className="shrink-0 text-red-500 mt-0.5" />
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">UTM Fim</p>
                  <p>{ordem.utmFimLat.toFixed(6)}, {ordem.utmFimLng.toFixed(6)}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {ordem.status === 'aberta' && podeAgir && (
        <button
          onClick={handleIniciar}
          disabled={avancando}
          className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-bold py-3.5 rounded-2xl shadow-sm transition-colors"
        >
          {avancando ? <Loader2 size={16} className="animate-spin" /> : <PlayCircle className="icon-md" />} Iniciar Rota
        </button>
      )}

      {ordem.status === 'aberta' && !podeAgir && (
        <p className="text-sm text-slate-400 text-center py-8">Aguardando o técnico iniciar esta rota.</p>
      )}

      {ordem.status === 'em_andamento' && podeAgir && (
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setShowPendencia(true)}
            className="flex items-center justify-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-bold py-3 rounded-2xl transition-colors"
          >
            <Navigation className="icon-md" /> Pendência
          </button>
          <button
            onClick={handleConcluir}
            disabled={avancando}
            className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-sm font-bold py-3 rounded-2xl transition-colors"
          >
            {avancando ? <Loader2 size={16} className="animate-spin" /> : <Flag className="icon-md" />} Concluir
          </button>
        </div>
      )}

      {pendentes.length > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-2xl p-3 text-sm text-amber-800 dark:text-amber-400">
          <CloudOff size={16} className="shrink-0" />
          <span className="flex-1 font-bold">
            {pendentes.length} pendência(s) aguardando conexão para enviar
          </span>
          <button
            onClick={trySync}
            disabled={sincronizando}
            className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white shrink-0 transition-colors"
          >
            {sincronizando ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Tentar agora
          </button>
        </div>
      )}

      <div className="space-y-2">
        <h2 className="text-sm font-black text-slate-700 dark:text-slate-200">
          Pendências registradas ({ordem.pendencias.length + pendentes.length})
        </h2>
        {ordem.pendencias.length + pendentes.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">Nenhuma pendência registrada ainda.</p>
        ) : (
          <>
            {ordem.pendencias.map((p) => <PendenciaCard key={p.id} pendencia={p} />)}
            {/* As que ainda não subiram entram na mesma lista, de propósito: o
                técnico registrou, então elas existem do ponto de vista dele.
                Some daqui assim que o flush levar pro servidor. */}
            {pendentes.map((p) => <PendenciaPendenteCard key={p.id ?? p.createdAt} pendencia={p} />)}
          </>
        )}
      </div>

      {(ordem.status === 'concluida' || ordem.status === 'cancelada') && (
        <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-2xl p-4 text-sm font-bold">
          <CheckCircle2 className="icon-md shrink-0" />
          {ordem.status === 'concluida' ? 'Rota concluída.' : 'Rota cancelada.'}
        </div>
      )}

      {showPendencia && (
        <NovaPendenciaModal
          busy={salvandoPendencia}
          referencia={referenciaMapa}
          onClose={() => setShowPendencia(false)}
          onConfirmar={handleSalvarPendencia}
        />
      )}
    </div>
  );
}
