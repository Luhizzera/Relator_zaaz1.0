import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Loader2, CheckCircle2, Circle, MinusCircle, Camera, Video, MapPinned,
  Upload, Trash2, Download, X, Play, ExternalLink, ThumbsUp, RotateCcw,
  Ban, MessageSquareWarning,
} from 'lucide-react';
import {
  getManutencaoOrder,
  updateChecklistItem,
  addFotoManutencao,
  removeFotoManutencao,
  addVideoManutencao,
  removeVideoManutencao,
  aprovarOrdem,
  solicitarCorrecao,
  reabrirOrdem,
  cancelarOrdem,
} from '@/lib/manutencaoService';
import { getSignedFotoManutencaoUrl, getSignedVideoManutencaoUrl } from '@/lib/supabaseClient';
import {
  ManutencaoOrdem, STATUS_LABEL, PRIORIDADE_LABEL, EstadoChecklistItem,
  CategoriaFotoOS, FotoOS, VideoOS,
} from '@/types/manutencao';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh';
import { BackButton } from '@/components/BackButton';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type Aba = 'resumo' | 'execucao' | 'ocorrencias' | 'materiais' | 'checklist' | 'fotos' | 'videos' | 'localizacao' | 'aprovacao' | 'historico';

const ABAS: { key: Aba; label: string; icon?: any }[] = [
  { key: 'resumo', label: 'Resumo' },
  { key: 'execucao', label: 'Execução' },
  { key: 'ocorrencias', label: 'Ocorrências' },
  { key: 'materiais', label: 'Materiais' },
  { key: 'checklist', label: 'Checklist' },
  { key: 'fotos', label: 'Fotos', icon: Camera },
  { key: 'videos', label: 'Vídeos', icon: Video },
  { key: 'localizacao', label: 'Localização', icon: MapPinned },
  { key: 'aprovacao', label: 'Aprovação' },
  { key: 'historico', label: 'Histórico' },
];

function ChecklistIcon({ estado }: { estado: EstadoChecklistItem }) {
  if (estado === 'concluido') return <CheckCircle2 size={18} className="text-green-600" />;
  if (estado === 'nao_aplica') return <MinusCircle size={18} className="text-slate-400" />;
  return <Circle size={18} className="text-slate-300" />;
}

// ── Aba Fotos ────────────────────────────────────────────────────────────

const CATEGORIAS_FOTO: { key: CategoriaFotoOS | 'todas'; label: string }[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'antes', label: 'Antes' },
  { key: 'durante', label: 'Durante' },
  { key: 'depois', label: 'Depois' },
];

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

function AbaFotos({ ordem, onChanged }: { ordem: ManutencaoOrdem; onChanged: () => void }) {
  const [categoria, setCategoria] = useState<CategoriaFotoOS>('durante');
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [ampliada, setAmpliada] = useState<FotoOS | null>(null);
  const [paraExcluir, setParaExcluir] = useState<FotoOS | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let ativo = true;
    Promise.all(ordem.fotos.map(async (f) => [f.id, await getSignedFotoManutencaoUrl(f.storagePath)] as const))
      .then((pairs) => { if (ativo) setUrls(Object.fromEntries(pairs.filter(([, u]) => u) as [string, string][])); });
    return () => { ativo = false; };
  }, [ordem.fotos]);

  const filtradas = ordem.fotos.filter((f) => f.categoria === categoria);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setEnviando(true);
    try {
      for (const file of Array.from(files)) {
        const dataUrl = await normalizeImage(file);
        await addFotoManutencao(ordem.id, dataUrl, categoria);
      }
      toast({ title: 'Foto(s) enviada(s)' });
      onChanged();
    } catch (err) {
      console.error('[Manutencao] Erro ao enviar foto:', err);
      toast({ title: 'Não foi possível enviar', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setEnviando(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExcluir = async () => {
    if (!paraExcluir) return;
    try {
      await removeFotoManutencao(paraExcluir.id, paraExcluir.storagePath, ordem.id);
      toast({ title: 'Foto removida' });
      onChanged();
    } catch (err) {
      console.error('[Manutencao] Erro ao remover foto:', err);
      toast({ title: 'Não foi possível remover', variant: 'destructive' });
    } finally {
      setParaExcluir(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {CATEGORIAS_FOTO.filter((c) => c.key !== 'todas').map((c) => (
            <button
              key={c.key}
              onClick={() => setCategoria(c.key as CategoriaFotoOS)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors',
                categoria === c.key
                  ? 'bg-amber-500 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700',
              )}
            >
              {c.label} ({ordem.fotos.filter((f) => f.categoria === c.key).length})
            </button>
          ))}
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={enviando}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors"
        >
          {enviando ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          Enviar foto{categoria ? ` (${categoria})` : ''}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleUpload(e.target.files)}
        />
      </div>

      {filtradas.length === 0 ? (
        <p className="text-xs text-slate-400 py-8 text-center">Nenhuma foto na categoria "{categoria}".</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {filtradas.map((f) => (
            <div key={f.id} className="relative group rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 aspect-square bg-slate-100 dark:bg-slate-800">
              {urls[f.id] ? (
                <img
                  src={urls[f.id]}
                  alt={f.categoria}
                  className="w-full h-full object-cover cursor-pointer"
                  onClick={() => setAmpliada(f)}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center"><Loader2 size={18} className="animate-spin text-slate-400" /></div>
              )}
              <button
                onClick={() => setParaExcluir(f)}
                className="absolute top-1.5 right-1.5 w-7 h-7 rounded-lg bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Excluir foto"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {ampliada && urls[ampliada.id] && (
        <div className="fixed inset-0 z-[1000] bg-black/80 flex items-center justify-center p-4" onClick={() => setAmpliada(null)}>
          <button onClick={() => setAmpliada(null)} className="absolute top-4 right-4 text-white/80 hover:text-white" aria-label="Fechar">
            <X size={28} />
          </button>
          <img src={urls[ampliada.id]} alt="" className="max-w-full max-h-[85vh] rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
          <a
            href={urls[ampliada.id]}
            download
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-4 flex items-center gap-2 bg-white/90 text-slate-800 text-sm font-bold px-4 py-2 rounded-xl"
          >
            <Download size={14} /> Baixar
          </a>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!paraExcluir}
        title="Excluir foto?"
        description="Essa ação não pode ser desfeita."
        confirmLabel="Excluir"
        onConfirm={handleExcluir}
        onCancel={() => setParaExcluir(null)}
      />
    </div>
  );
}

// ── Aba Vídeos ───────────────────────────────────────────────────────────

function AbaVideos({ ordem, onChanged }: { ordem: ManutencaoOrdem; onChanged: () => void }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [tocando, setTocando] = useState<VideoOS | null>(null);
  const [paraExcluir, setParaExcluir] = useState<VideoOS | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let ativo = true;
    Promise.all(ordem.videos.map(async (v) => [v.id, await getSignedVideoManutencaoUrl(v.storagePath)] as const))
      .then((pairs) => { if (ativo) setUrls(Object.fromEntries(pairs.filter(([, u]) => u) as [string, string][])); });
    return () => { ativo = false; };
  }, [ordem.videos]);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setEnviando(true);
    try {
      for (const file of Array.from(files)) {
        await addVideoManutencao(ordem.id, file, file.type || 'video/mp4');
      }
      toast({ title: 'Vídeo(s) enviado(s)' });
      onChanged();
    } catch (err) {
      console.error('[Manutencao] Erro ao enviar vídeo:', err);
      toast({ title: 'Não foi possível enviar', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setEnviando(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExcluir = async () => {
    if (!paraExcluir) return;
    try {
      await removeVideoManutencao(paraExcluir.id, paraExcluir.storagePath, ordem.id);
      toast({ title: 'Vídeo removido' });
      onChanged();
    } catch (err) {
      console.error('[Manutencao] Erro ao remover vídeo:', err);
      toast({ title: 'Não foi possível remover', variant: 'destructive' });
    } finally {
      setParaExcluir(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={enviando}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors"
        >
          {enviando ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          Enviar vídeo
        </button>
        <input ref={fileInputRef} type="file" accept="video/*" multiple className="hidden" onChange={(e) => handleUpload(e.target.files)} />
      </div>

      {ordem.videos.length === 0 ? (
        <p className="text-xs text-slate-400 py-8 text-center">Nenhum vídeo anexado.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {ordem.videos.map((v) => (
            <div key={v.id} className="relative group rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 aspect-video bg-slate-900 flex items-center justify-center">
              <button onClick={() => setTocando(v)} className="text-white/90 hover:text-white flex flex-col items-center gap-1">
                <Play size={28} />
                <span className="text-[10px] font-bold">Reproduzir</span>
              </button>
              <button
                onClick={() => setParaExcluir(v)}
                className="absolute top-1.5 right-1.5 w-7 h-7 rounded-lg bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Excluir vídeo"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {tocando && urls[tocando.id] && (
        <div className="fixed inset-0 z-[1000] bg-black/80 flex items-center justify-center p-4" onClick={() => setTocando(null)}>
          <button onClick={() => setTocando(null)} className="absolute top-4 right-4 text-white/80 hover:text-white" aria-label="Fechar">
            <X size={28} />
          </button>
          <video src={urls[tocando.id]} controls autoPlay className="max-w-full max-h-[85vh] rounded-lg" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      <ConfirmDialog
        isOpen={!!paraExcluir}
        title="Excluir vídeo?"
        description="Essa ação não pode ser desfeita."
        confirmLabel="Excluir"
        onConfirm={handleExcluir}
        onCancel={() => setParaExcluir(null)}
      />
    </div>
  );
}

// ── Aba Localização ──────────────────────────────────────────────────────

function AbaLocalizacao({ ordem }: { ordem: ManutencaoOrdem }) {
  const hasCoords = ordem.latitude != null && ordem.longitude != null;
  return (
    <div className="space-y-4">
      {hasCoords ? (
        <>
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 h-64">
            <iframe
              title="Localização"
              className="w-full h-full border-0"
              src={`https://www.openstreetmap.org/export/embed.html?bbox=${ordem.longitude! - 0.005}%2C${ordem.latitude! - 0.005}%2C${ordem.longitude! + 0.005}%2C${ordem.latitude! + 0.005}&marker=${ordem.latitude}%2C${ordem.longitude}`}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div><p className="text-slate-400 font-bold uppercase text-[10px]">Endereço</p><p className="font-semibold text-slate-700 dark:text-slate-200">{ordem.endereco || '—'}{ordem.numeroEndereco ? `, ${ordem.numeroEndereco}` : ''}</p></div>
            <div><p className="text-slate-400 font-bold uppercase text-[10px]">Coordenadas</p><p className="font-mono font-semibold text-slate-700 dark:text-slate-200">{ordem.latitude?.toFixed(6)}, {ordem.longitude?.toFixed(6)}</p></div>
          </div>
          <a
            href={`https://www.google.com/maps?q=${ordem.latitude},${ordem.longitude}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline"
          >
            <ExternalLink size={14} /> Abrir no Google Maps
          </a>
        </>
      ) : (
        <p className="text-sm text-slate-400 py-8 text-center">Nenhuma coordenada registrada para esta OS.</p>
      )}
    </div>
  );
}

// ── Aba Aprovação ────────────────────────────────────────────────────────

function tempoExecucao(ordem: ManutencaoOrdem): string {
  if (!ordem.execucaoInicioEm) return '—';
  const fim = ordem.execucaoFimEm ? new Date(ordem.execucaoFimEm) : new Date();
  const inicio = new Date(ordem.execucaoInicioEm);
  const min = Math.round((fim.getTime() - inicio.getTime()) / 60000);
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h${m.toString().padStart(2, '0')}min` : `${m}min`;
}

function AbaAprovacao({ ordem, onChanged }: { ordem: ManutencaoOrdem; onChanged: () => void }) {
  const { isGestor } = useAuth();
  const [acao, setAcao] = useState<'aprovar' | 'corrigir' | 'reabrir' | 'cancelar' | null>(null);
  const [motivo, setMotivo] = useState('');
  const [processando, setProcessando] = useState(false);

  // "Não se aplica" é uma resolução legítima do item (o técnico avaliou e
  // descartou), não uma pendência — contar só 'concluido' fazia o resumo
  // parecer incompleto mesmo com o checklist todo resolvido.
  const checklistResolvido = ordem.checklist.filter((c) => c.estado === 'concluido' || c.estado === 'nao_aplica').length;

  const resumoItens = [
    { label: 'Checklist', valor: `${checklistResolvido}/${ordem.checklist.length}` },
    { label: 'Fotos', valor: ordem.fotos.length },
    { label: 'Vídeos', valor: ordem.videos.length },
    { label: 'Materiais', valor: ordem.materiais.length },
    { label: 'Ocorrências', valor: ordem.ocorrencias.length },
    { label: 'Tempo de execução', valor: tempoExecucao(ordem) },
  ];

  const handleConfirmar = async () => {
    setProcessando(true);
    try {
      if (acao === 'aprovar') {
        await aprovarOrdem(ordem.id);
        toast({ title: 'OS aprovada' });
      } else if (acao === 'corrigir') {
        await solicitarCorrecao(ordem.id, motivo || undefined);
        toast({ title: 'Enviada para retrabalho' });
      } else if (acao === 'reabrir') {
        await reabrirOrdem(ordem.id, motivo || undefined);
        toast({ title: 'OS reaberta' });
      } else if (acao === 'cancelar') {
        await cancelarOrdem(ordem.id, motivo);
        toast({ title: 'OS cancelada' });
      }
      onChanged();
    } catch (err) {
      console.error('[Manutencao] Erro na ação de aprovação:', err);
      toast({ title: 'Não foi possível concluir', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setProcessando(false);
      setAcao(null);
      setMotivo('');
    }
  };

  if (!isGestor) {
    return <p className="text-sm text-slate-400 py-8 text-center">Somente o gestor pode aprovar, cancelar ou reabrir uma OS.</p>;
  }

  // Retrabalho e reabertura aceitam uma observação adicional, mas ela é
  // opcional — o conteúdo já registrado na OS (ocorrências, materiais,
  // checklist, fotos) se mantém do jeito que está. Só cancelamento exige
  // motivo, por auditoria.
  const mostraMotivo = acao === 'corrigir' || acao === 'reabrir' || acao === 'cancelar';
  const motivoObrigatorio = acao === 'cancelar';

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {resumoItens.map((item) => (
          <div key={item.label} className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 text-center">
            <p className="text-lg font-black text-slate-800 dark:text-slate-100">{item.valor}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mt-0.5">{item.label}</p>
          </div>
        ))}
      </div>

      {ordem.motivoRecusa && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/50 rounded-xl px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400">
          <span className="font-bold">Observação do retrabalho: </span>{ordem.motivoRecusa}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setAcao('aprovar')}
          disabled={ordem.status !== 'aguardando_aprovacao'}
          className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-sm font-bold py-3 rounded-xl transition-colors"
        >
          <ThumbsUp size={16} /> Aprovar
        </button>
        <button
          onClick={() => setAcao('corrigir')}
          disabled={ordem.status !== 'aguardando_aprovacao'}
          className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-bold py-3 rounded-xl transition-colors"
        >
          <MessageSquareWarning size={16} /> Retrabalho
        </button>
        <button
          onClick={() => setAcao('reabrir')}
          disabled={!['aprovada', 'concluida', 'cancelada'].includes(ordem.status)}
          className="flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 text-sm font-bold py-3 rounded-xl transition-colors"
        >
          <RotateCcw size={16} /> Reabrir Ordem
        </button>
        <button
          onClick={() => setAcao('cancelar')}
          disabled={['cancelada', 'aprovada', 'concluida'].includes(ordem.status)}
          className="flex items-center justify-center gap-2 border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40 text-sm font-bold py-3 rounded-xl transition-colors"
        >
          <Ban size={16} /> Cancelar
        </button>
      </div>

      {acao && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4" onClick={() => !processando && setAcao(null)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-black text-slate-800 dark:text-slate-100">
              {acao === 'aprovar' && 'Aprovar OS?'}
              {acao === 'corrigir' && 'Enviar para retrabalho'}
              {acao === 'reabrir' && 'Reabrir OS?'}
              {acao === 'cancelar' && 'Cancelar OS?'}
            </h3>
            {acao === 'corrigir' && (
              <p className="text-xs text-slate-500 -mt-2">
                O técnico recebe a OS de volta; nada do que já foi registrado é apagado.
              </p>
            )}
            {mostraMotivo && (
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
                placeholder={
                  acao === 'corrigir' ? 'Observação adicional (opcional)'
                  : acao === 'reabrir' ? 'Motivo da reabertura (opcional)'
                  : 'Motivo do cancelamento'
                }
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 resize-none"
              />
            )}
            <div className="flex gap-3">
              <button onClick={() => setAcao(null)} disabled={processando} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-600 dark:text-slate-300">
                Cancelar
              </button>
              <button
                onClick={handleConfirmar}
                disabled={processando || (motivoObrigatorio && !motivo.trim())}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-bold transition-colors"
              >
                {processando && <Loader2 size={14} className="animate-spin" />} Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Aba Histórico (timeline) ────────────────────────────────────────────

function AbaHistorico({ ordem }: { ordem: ManutencaoOrdem }) {
  return (
    <div className="relative pl-5">
      <div className="absolute left-[7px] top-1 bottom-1 w-px bg-slate-200 dark:bg-slate-800" />
      <div className="space-y-5">
        {ordem.historico.map((h) => (
          <div key={h.id} className="relative">
            <div className="absolute -left-5 top-1 w-3.5 h-3.5 rounded-full bg-amber-500 ring-4 ring-white dark:ring-slate-900" />
            <p className="font-bold text-sm text-slate-700 dark:text-slate-200">{h.acao}</p>
            {h.descricao && <p className="text-xs text-slate-500 mt-0.5">{h.descricao}</p>}
            <p className="text-[11px] text-slate-400 mt-0.5">{h.usuario} • {new Date(h.data).toLocaleString('pt-BR')}</p>
          </div>
        ))}
        {ordem.historico.length === 0 && <p className="text-xs text-slate-400">Nenhum evento registrado ainda.</p>}
      </div>
    </div>
  );
}

// ── Tela principal ───────────────────────────────────────────────────────

const ABA_KEYS = ABAS.map((a) => a.key);

export default function ManutencaoOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [ordem, setOrdem] = useState<ManutencaoOrdem | null>(null);
  const [loading, setLoading] = useState(true);
  // Suporta abrir numa aba específica via ?aba=fotos (usado pelo atalho
  // "Anexos" da lista de OS) — cai em 'resumo' se o valor for inválido.
  const abaInicial = searchParams.get('aba');
  const [aba, setAba] = useState<Aba>(
    (ABA_KEYS as string[]).includes(abaInicial ?? '') ? (abaInicial as Aba) : 'resumo',
  );

  const carregar = (silencioso = false) => {
    if (!id) return;
    if (!silencioso) setLoading(true);
    getManutencaoOrder(id)
      .then(setOrdem)
      .catch((err) => console.error('[Manutencao] Erro ao carregar OS:', err))
      .finally(() => { if (!silencioso) setLoading(false); });
  };

  useEffect(() => carregar(), [id]);

  // Realtime: qualquer mudança na OS aberta (status, ocorrência, material,
  // checklist, foto, vídeo, histórico) recarrega sem precisar de F5 — útil
  // pro gestor acompanhar a execução ao vivo enquanto o técnico trabalha.
  useRealtimeRefresh(
    id
      ? [
          { table: 'ordens_manutencao', filter: `id=eq.${id}` },
          { table: 'ocorrencias_manutencao', filter: `ordem_id=eq.${id}` },
          { table: 'materiais_manutencao', filter: `ordem_id=eq.${id}` },
          { table: 'checklist_itens_manutencao', filter: `ordem_id=eq.${id}` },
          { table: 'historico_manutencao', filter: `ordem_id=eq.${id}` },
          { table: 'fotos_manutencao', filter: `ordem_id=eq.${id}` },
          { table: 'videos_manutencao', filter: `ordem_id=eq.${id}` },
        ]
      : [],
    () => carregar(true),
  );

  const handleToggleChecklist = async (itemId: string, atual: EstadoChecklistItem) => {
    if (!ordem) return;
    // Ciclo: pendente -> concluído -> não se aplica -> pendente
    const proximo: EstadoChecklistItem =
      atual === 'pendente' ? 'concluido' : atual === 'concluido' ? 'nao_aplica' : 'pendente';

    // Atualização otimista — reflete na tela antes da confirmação do "banco",
    // igual ao padrão que você já usa em updatePhotoDescription no OrdersContext.
    setOrdem((prev) =>
      prev
        ? { ...prev, checklist: prev.checklist.map((c) => (c.id === itemId ? { ...c, estado: proximo } : c)) }
        : prev,
    );
    try {
      await updateChecklistItem(ordem.id, itemId, proximo);
    } catch (err) {
      console.error('[Manutencao] Erro ao atualizar checklist:', err);
      carregar(); // desfaz a atualização otimista em caso de falha
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">
        <Loader2 className="animate-spin mr-2" size={18} /> Carregando...
      </div>
    );
  }

  if (!ordem) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <p className="font-bold text-slate-700 dark:text-slate-200">OS não encontrada</p>
          <button onClick={() => navigate('/manutencao/ordens')} className="text-sm font-bold text-amber-600 hover:underline mt-2">
            Voltar para a lista
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <BackButton to="/manutencao/ordens" variant="ghost-light" label="Ordens de Manutenção" />
        <ThemeToggle />
      </div>

      {/* Cabeçalho */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-black text-slate-800 dark:text-slate-100">{ordem.numero}</h1>
            <p className="text-sm text-slate-500">{ordem.tipo} • {ordem.solicitante || 'Sem solicitante'}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              {STATUS_LABEL[ordem.status]}
            </span>
            <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
              {PRIORIDADE_LABEL[ordem.prioridade]}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-xs">
          <div><p className="text-slate-400 font-bold uppercase text-[10px]">Equipe</p><p className="font-semibold text-slate-700 dark:text-slate-200">{ordem.equipe || '—'}</p></div>
          <div><p className="text-slate-400 font-bold uppercase text-[10px]">Técnico</p><p className="font-semibold text-slate-700 dark:text-slate-200">{ordem.tecnico || '—'}</p></div>
          <div><p className="text-slate-400 font-bold uppercase text-[10px]">Cidade</p><p className="font-semibold text-slate-700 dark:text-slate-200">{ordem.municipio || '—'}</p></div>
          <div><p className="text-slate-400 font-bold uppercase text-[10px]">Abertura</p><p className="font-semibold text-slate-700 dark:text-slate-200">{new Date(ordem.createdAt).toLocaleDateString('pt-BR')}</p></div>
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {ABAS.map((a) => (
          <button
            key={a.key}
            onClick={() => setAba(a.key)}
            className={cn(
              'flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-colors',
              aba === a.key
                ? 'bg-amber-500 text-white'
                : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800',
            )}
          >
            {a.icon && <a.icon size={12} />} {a.label}
          </button>
        ))}
      </div>

      {/* Conteúdo da aba */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
        {aba === 'resumo' && (
          <div className="space-y-3 text-sm">
            <p><span className="font-bold text-slate-500">Problema informado: </span>{ordem.problemaInformado || '—'}</p>
            <p><span className="font-bold text-slate-500">Endereço: </span>{ordem.endereco || '—'}, {ordem.numeroEndereco || 's/n'} — {ordem.bairro || '—'}</p>
            <p><span className="font-bold text-slate-500">Data prevista: </span>{ordem.dataPrevista || '—'} às {ordem.horarioPrevisto || '—'}</p>
            <p><span className="font-bold text-slate-500">Observações: </span>{ordem.observacoes || '—'}</p>
          </div>
        )}

        {aba === 'execucao' && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><p className="text-slate-400 font-bold uppercase text-[10px]">Início</p><p className="font-semibold">{ordem.execucaoInicioEm ? new Date(ordem.execucaoInicioEm).toLocaleString('pt-BR') : '—'}</p></div>
              <div><p className="text-slate-400 font-bold uppercase text-[10px]">Fim</p><p className="font-semibold">{ordem.execucaoFimEm ? new Date(ordem.execucaoFimEm).toLocaleString('pt-BR') : 'Em andamento'}</p></div>
            </div>
            <p className="text-xs text-slate-400">
              As transições de status (Receber, Deslocamento, Execução, Finalizar) são feitas pelo técnico na execução mobile.
            </p>
          </div>
        )}

        {aba === 'ocorrencias' && (
          <div className="space-y-2">
            {ordem.ocorrencias.length === 0 && <p className="text-xs text-slate-400">Nenhuma ocorrência registrada.</p>}
            {ordem.ocorrencias.map((o) => (
              <div key={o.id} className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 text-sm">
                <p className="font-bold text-slate-700 dark:text-slate-200">{o.tipo} <span className="text-slate-400 font-normal">• {o.categoria}</span></p>
                <p className="text-slate-500 text-xs mt-1">{o.descricao}</p>
              </div>
            ))}
          </div>
        )}

        {aba === 'materiais' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase font-black text-slate-400">
                  <th className="pb-2">Material</th><th className="pb-2">Qtd</th><th className="pb-2">Unidade</th>
                </tr>
              </thead>
              <tbody>
                {ordem.materiais.length === 0 && (
                  <tr><td colSpan={3} className="text-xs text-slate-400 py-3">Nenhum material registrado.</td></tr>
                )}
                {ordem.materiais.map((m) => (
                  <tr key={m.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-2 font-semibold">{m.material}</td>
                    <td className="py-2">{m.quantidade}</td>
                    <td className="py-2">{m.unidade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {aba === 'checklist' && (
          <div className="space-y-1">
            {ordem.checklist.map((item) => (
              <button
                key={item.id}
                onClick={() => handleToggleChecklist(item.id, item.estado)}
                className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-left"
              >
                <ChecklistIcon estado={item.estado} />
                <span className={cn(
                  'text-sm font-semibold',
                  item.estado === 'concluido' && 'text-slate-400 line-through',
                  item.estado === 'nao_aplica' && 'text-slate-300 italic',
                )}>
                  {item.label}
                </span>
              </button>
            ))}
            <p className="text-[11px] text-slate-400 pt-2">Clique no item para alternar: pendente → concluído → não se aplica.</p>
          </div>
        )}

        {aba === 'fotos' && <AbaFotos ordem={ordem} onChanged={carregar} />}
        {aba === 'videos' && <AbaVideos ordem={ordem} onChanged={carregar} />}
        {aba === 'localizacao' && <AbaLocalizacao ordem={ordem} />}
        {aba === 'aprovacao' && <AbaAprovacao ordem={ordem} onChanged={carregar} />}
        {aba === 'historico' && <AbaHistorico ordem={ordem} />}
      </div>
    </div>
  );
}
