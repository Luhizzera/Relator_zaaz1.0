// @ts-nocheck
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera, Plus, MapPin, Loader2, WifiOff,
  RefreshCw, CloudOff, CheckCircle2, XCircle, GripVertical,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useReport } from '@/contexts/OrdersContext';
import { PhotoCard } from '@/components/PhotoCard';
import { ExportModal } from '@/components/ExportModal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ThemeToggle } from '@/components/ThemeToggle';
import { BackButton } from '@/components/BackButton';
import { StorageService, createDebounced } from '@/lib/cacheService';
import { toast } from '@/hooks/use-toast';

// ─────────────────────────────────────────────
// Persist debounced
// ─────────────────────────────────────────────
const debouncedPersist = createDebounced(
  (photos: any[]) => StorageService.persist(photos),
  1500,
);

// ─────────────────────────────────────────────
// GPS
// ─────────────────────────────────────────────
const getPreciseLocation = (): Promise<string | null> =>
  new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(`${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 5000 },
    );
  });

// ─────────────────────────────────────────────
// Compressor de imagem
// ─────────────────────────────────────────────
const normalizeImage = (file: File): Promise<string> =>
  new Promise((resolve) => {
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

// ─────────────────────────────────────────────
// Skeleton
// ─────────────────────────────────────────────
function PhotoCardSkeleton() {
  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden shadow-sm animate-pulse">
      <div className="aspect-video bg-muted/60" />
      <div className="p-3 space-y-3">
        <div className="h-3 bg-muted rounded w-2/3" />
        <div className="space-y-2">
          <div className="h-3 bg-muted rounded w-full" />
          <div className="h-3 bg-muted rounded w-5/6" />
          <div className="h-3 bg-muted rounded w-4/6" />
        </div>
        <div className="h-14 bg-muted rounded" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Banner sync offline
// ─────────────────────────────────────────────
function SyncConfirmBanner({ onConfirm, onDiscard }) {
  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-xl p-4 space-y-3 shadow-sm">
      <div className="flex items-start gap-2.5">
        <CloudOff size={16} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-amber-800 dark:text-amber-300">Dados gravados offline encontrados</p>
          <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5 leading-relaxed">Devo sincronizar o que foi gravado offline?</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onConfirm} className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-black uppercase tracking-wider rounded-lg transition-colors active:scale-95">
          <CheckCircle2 size={13} /> Sim, sincronizar
        </button>
        <button onClick={onDiscard} className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-white dark:bg-slate-800 hover:bg-red-50 border border-amber-200 dark:border-amber-800 text-red-500 dark:text-red-400 text-[11px] font-black uppercase tracking-wider rounded-lg transition-colors active:scale-95">
          <XCircle size={13} /> Não, descartar
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Sensores DnD — só ativam pelo handle
// ─────────────────────────────────────────────
const INTERACTIVE_TAGS = ['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT', 'LABEL', 'A'];

function isFromHandle(event: Event): boolean {
  let el = event.target as HTMLElement | null;
  while (el) {
    if (el.dataset?.dragHandle) return true;
    if (INTERACTIVE_TAGS.includes(el.tagName)) return false;
    el = el.parentElement;
  }
  return false;
}

class SmartMouseSensor extends MouseSensor {
  static activators = [{
    eventName: 'onMouseDown' as const,
    handler: ({ nativeEvent }: { nativeEvent: MouseEvent }) => isFromHandle(nativeEvent),
  }];
}

class SmartTouchSensor extends TouchSensor {
  static activators = [{
    eventName: 'onTouchStart' as const,
    handler: ({ nativeEvent }: { nativeEvent: TouchEvent }) => isFromHandle(nativeEvent),
  }];
}

// ─────────────────────────────────────────────
// Card sortável
// ─────────────────────────────────────────────
function SortablePhotoCard({ photo, index, onRemove, onUpdateDescription }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: photo.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 10 : 'auto',
      }}
      className="relative"
    >
      <div className="absolute top-3 left-3 z-10 px-2 py-1 bg-black/50 backdrop-blur-md rounded text-[10px] font-mono font-bold text-white shadow-sm border border-white/10">
        #{String(index + 1).padStart(2, '0')}
      </div>
      <div
        {...attributes}
        {...listeners}
        data-drag-handle="true"
        className="absolute top-3 right-10 z-10 p-1.5 bg-black/40 backdrop-blur-md rounded cursor-grab active:cursor-grabbing text-white/70 hover:text-white transition-colors touch-none select-none"
        title="Arrastar para reordenar"
      >
        <GripVertical size={14} />
      </div>
      <PhotoCard
        photo={photo}
        index={index}
        onRemove={onRemove}
        onUpdateDescription={onUpdateDescription}
      />
    </div>
  );
}

// ─────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────
export default function Photos() {
  const { id } = useParams();
  const { photos, addPhoto, updatePhotoDescription, removePhoto, config, clearAllPhotos, reorderPhotos } = useReport();

  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [useGeo, setUseGeo]                       = useState(false);
  const [uploadingCount, setUploadingCount]       = useState(0);
  const [isOnline, setIsOnline]                   = useState(navigator.onLine);
  const [hasPending, setHasPending]               = useState(false);
  const [isSyncing, setIsSyncing]                 = useState(false);
  const [showSyncBanner, setShowSyncBanner]       = useState(false);
  const [confirmClear, setConfirmClear]           = useState(false);
  const [activeId, setActiveId]                   = useState<string | null>(null);
  const [isDragOver, setIsDragOver]               = useState(false);

  const fileInputRef   = useRef(null);
  const cameraInputRef = useRef(null);
  const dropZoneRef    = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(SmartMouseSensor),
    useSensor(SmartTouchSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // ── Título dinâmico ───────────────────────
  useEffect(() => {
    const ref = config?.codigoReferencia;
    document.title = photos.length > 0
      ? `SurveyOS · ${photos.length} foto${photos.length > 1 ? 's' : ''}${ref ? ` · ${ref}` : ''}`
      : 'SurveyOS · Relatório Fotográfico';
    return () => { document.title = 'SurveyOS · Relatório Fotográfico'; };
  }, [photos.length, config?.codigoReferencia]);

  // ── Recovery ─────────────────────────────
  useEffect(() => {
    (async () => {
      if (photos.length === 0) {
        const saved = await StorageService.recover();
        if (saved?.length) {
          saved.forEach((p) => addPhoto(p));
          toast({ title: 'Sessão restaurada', description: `${saved.length} foto(s) recuperadas.` });
        }
      }
      const pending = await StorageService.hasPendingOfflineData();
      setHasPending(pending);
      if (pending) setShowSyncBanner(true);
    })();
  }, []);

  // ── Persist ───────────────────────────────
  useEffect(() => { debouncedPersist(photos); }, [photos]);

  // ── Rede ─────────────────────────────────
  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      const pending = await StorageService.hasPendingOfflineData();
      if (pending) { setHasPending(true); setShowSyncBanner(true); }
    };
    const handleOffline = () => {
      setIsOnline(false);
      setShowSyncBanner(false);
      toast({ title: 'Sem conexão', description: 'Fotos serão salvas localmente.', variant: 'destructive' });
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  }, []);

  // handleFiles em ref — permite o useEffect do drop usar sempre a versão mais recente
  // sem precisar de deps (que causariam re-registro dos listeners).
  const handleFilesRef = useRef<(files: FileList | File[]) => void>(null!);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (!fileArray.length) return;
    setUploadingCount(fileArray.length);
    for (const file of fileArray) {
      let utmLocation: string | null = null;
      let geoAttempted = false;
      if (useGeo) { geoAttempted = true; utmLocation = await getPreciseLocation(); }
      const optimizedSrc = await normalizeImage(file);
      addPhoto({
        id:          `p-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        src:         optimizedSrc,
        description: '',
        observacoes: '',
        location:    utmLocation,
        geoAttempted,
      });
    }
    setUploadingCount(0);
    if (!navigator.onLine) setHasPending(true);
  }, [useGeo, addPhoto]);

  // Mantém a ref sempre atualizada para o listener DOM poder chamar a versão mais recente
  useEffect(() => { handleFilesRef.current = handleFiles; }, [handleFiles]);

  // Registra todos os listeners de drag de arquivo na drop zone.
  // Usa handleFilesRef para sempre chamar a versão mais recente de handleFiles
  // sem precisar re-registrar os listeners a cada render.
  useEffect(() => {
    const zone = dropZoneRef.current;
    if (!zone) return;

    let dragCounter = 0;

    const onDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounter++;
      if (e.dataTransfer?.types.includes('Files')) setIsDragOver(true);
    };
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) { dragCounter = 0; setIsDragOver(false); }
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounter = 0;
      setIsDragOver(false);
      const files = e.dataTransfer?.files;
      if (files?.length) handleFilesRef.current(files);
    };

    zone.addEventListener('dragenter', onDragEnter);
    zone.addEventListener('dragover',  onDragOver);
    zone.addEventListener('dragleave', onDragLeave);
    zone.addEventListener('drop',      onDrop);

    return () => {
      zone.removeEventListener('dragenter', onDragEnter);
      zone.removeEventListener('dragover',  onDragOver);
      zone.removeEventListener('dragleave', onDragLeave);
      zone.removeEventListener('drop',      onDrop);
    };
  }, []);

  // ── Sync handlers ────────────────────────
  const handleSyncConfirm = useCallback(async () => {
    setShowSyncBanner(false); setIsSyncing(true);
    const synced = await StorageService.syncOfflineQueue();
    setIsSyncing(false); setHasPending(false);
    if (synced) toast({ title: 'Sincronização concluída', description: 'Fotos offline salvas.' });
  }, []);

  const handleSyncDiscard = useCallback(async () => {
    setShowSyncBanner(false);
    await StorageService.discardOfflineQueue();
    setHasPending(false);
    toast({ title: 'Dados descartados', description: 'Dados offline removidos.' });
  }, []);

  // ── Clear ─────────────────────────────────
  const handleClearAll = useCallback(async () => {
    await StorageService.clearAll();
    clearAllPhotos();
    setHasPending(false); setShowSyncBanner(false); setConfirmClear(false);
    toast({ title: 'Galeria limpa', description: 'Todas as fotos foram removidas.' });
  }, [clearAllPhotos]);

  // ── Callbacks memoizados ──────────────────
  const makeRemoveHandler = useCallback((id: string) => () => removePhoto(id), [removePhoto]);
  const makeDescHandler   = useCallback((id: string) => (d: string) => updatePhotoDescription(id, d), [updatePhotoDescription]);

  // ── DnD handlers ──────────────────────────
  const handleDragStart = useCallback(({ active }) => setActiveId(active.id), []);
  const handleDragEnd   = useCallback(({ active, over }) => {
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const oldIndex = photos.findIndex((p) => p.id === active.id);
    const newIndex = photos.findIndex((p) => p.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) reorderPhotos(arrayMove(photos, oldIndex, newIndex));
  }, [photos, reorderPhotos]);

  const activePhoto       = activeId ? photos.find((p) => p.id === activeId) : null;
  const photosWithoutDesc = photos.filter((p) => !p.description || p.description.trim() === '').length;
  const estimatedPages    = Math.ceil(photos.length / 4) || 0;
  const hasContent        = photos.length > 0 || uploadingCount > 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col transition-colors duration-300">

      {/* HEADER */}
      <header className="bg-slate-900 text-white py-2 px-4 shadow-xl sticky top-0 z-50 border-b border-white/10">
        <div className="flex items-center justify-between gap-2 max-w-screen-xl mx-auto">
          <BackButton to={id ? `/ordens/${id}` : '/ordens'} variant="ghost-dark" />
          <div className="flex justify-center flex-1 min-w-0">
            <img src="/images/dep-eng.png" alt="DEP-ENG"
              className="h-8 sm:h-10 w-auto max-w-[140px] sm:max-w-none rounded brightness-110 object-contain"
              onError={(e) => { e.target.src = '/images/logo-dep-eng.jpg'; }} />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className={cn('flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full',
              isOnline ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400')}>
              {isOnline
                ? isSyncing
                  ? <><RefreshCw size={10} className="animate-spin shrink-0" /><span className="hidden sm:inline">Sincronizando</span></>
                  : hasPending
                    ? <><RefreshCw size={10} className="shrink-0" /><span className="hidden sm:inline">Pendente</span></>
                    : <><span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" /><span className="hidden sm:inline">Online</span></>
                : <><WifiOff size={10} className="shrink-0" /><span className="hidden sm:inline">Offline</span></>}
            </div>
            <ThemeToggle variant="ghost-dark" />
          </div>
        </div>
      </header>

      <main className="container mx-auto p-4 flex flex-col lg:flex-row gap-8">

        {/* SIDEBAR */}
        <aside className="lg:w-80 space-y-4">
          {showSyncBanner && isOnline && <SyncConfirmBanner onConfirm={handleSyncConfirm} onDiscard={handleSyncDiscard} />}
          {!isOnline && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 text-red-800 dark:text-red-300 text-xs font-bold flex items-center gap-2">
              <WifiOff size={14} /> Offline — fotos salvas localmente
            </div>
          )}

          {/* Toggle de geolocalização — rótulo padronizado como "GPS" em todo
              o app (a captura é lat/long puro do navegador, nunca foi UTM de
              verdade, então dois termos pro mesmo dado só confundiam). */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin size={18} className={cn(useGeo ? 'text-blue-500 animate-pulse' : 'text-slate-300')} />
                <span className="text-[11px] font-black uppercase tracking-widest dark:text-slate-200">Geotag (GPS)</span>
              </div>
              <button onClick={() => setUseGeo(!useGeo)}
                className={cn('relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300',
                  useGeo ? 'bg-blue-600 shadow-[0_0_15px_rgba(37,99,235,0.4)]' : 'bg-slate-200 dark:bg-slate-700')}>
                <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white transition-all duration-300',
                  useGeo ? 'translate-x-6 shadow-lg' : 'translate-x-1 shadow-sm')} />
              </button>
            </div>
            {useGeo && <p className="text-[9px] mt-2 font-bold text-blue-500 dark:text-blue-400 text-center animate-in fade-in">COORDENADAS ATIVAS</p>}
          </div>

          {/* Estatísticas */}
          {photos.length > 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Sessão atual</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-center">
                  <p className="text-2xl font-black text-slate-800 dark:text-slate-100">{photos.length}</p>
                  <p className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Fotos</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-center">
                  <p className="text-2xl font-black text-slate-800 dark:text-slate-100">{estimatedPages}</p>
                  <p className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Páginas</p>
                </div>
              </div>
              {photosWithoutDesc > 0 && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold text-center">
                  ⚠ {photosWithoutDesc} foto{photosWithoutDesc > 1 ? 's' : ''} sem descrição
                </p>
              )}
              <p className="text-[9px] text-slate-400 text-center">
                {photos.length} foto{photos.length !== 1 ? 's' : ''} · {estimatedPages} página{estimatedPages !== 1 ? 's' : ''} · sem limite
              </p>
            </div>
          )}

          {/* Ações */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 space-y-3">
            <button onClick={() => fileInputRef.current?.click()} disabled={uploadingCount > 0}
              className="w-full flex items-center justify-center gap-3 p-4 bg-[#1A1AFF] text-white rounded-xl font-bold shadow-lg active:scale-95 transition-all disabled:opacity-50">
              {uploadingCount > 0 ? <Loader2 className="animate-spin" size={20} /> : <Plus size={20} />}
              {uploadingCount > 0 ? `Processando ${uploadingCount}...` : 'Galeria / Arquivo'}
            </button>
            <button onClick={() => cameraInputRef.current?.click()} disabled={uploadingCount > 0}
              className="w-full flex items-center justify-center gap-3 p-3 border-2 border-[#1A1AFF] text-[#1A1AFF] dark:text-blue-400 rounded-xl font-bold active:scale-95 transition-all disabled:opacity-50 hover:bg-blue-50 dark:hover:bg-blue-950/30">
              <Camera size={18} /> Tirar Foto
            </button>
            <button onClick={() => setIsExportModalOpen(true)}
              className="w-full py-3 text-[#1A1AFF] border border-slate-200 dark:border-slate-800 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              Gerar Relatório
            </button>
            {photos.length > 0 && (
              <button onClick={() => setConfirmClear(true)}
                className="w-full py-2 text-red-400 hover:text-red-600 text-[10px] font-black uppercase transition-colors">
                Limpar Galeria
              </button>
            )}
          </div>
        </aside>

        {/* GALERIA */}
        <section className="flex-1">
          {/* Drop zone — ref DOM direta, sem conflito com dnd-kit */}
          <div
            ref={dropZoneRef}
            className={cn(
              'bg-white dark:bg-slate-900 rounded-3xl border-2 border-dashed min-h-[500px] transition-all duration-150',
              hasContent ? 'p-6' : 'flex items-center justify-center',
              isDragOver
                ? 'border-[#1A1AFF] bg-blue-50 dark:bg-blue-950/20 scale-[1.01]'
                : 'border-slate-200 dark:border-slate-700',
            )}
          >
            {!hasContent ? (
              /* Estado vazio */
              <div
                className="text-center cursor-pointer select-none py-16 px-8"
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera
                  size={60}
                  className={cn('mx-auto mb-3 transition-all duration-200',
                    isDragOver ? 'text-[#1A1AFF] scale-110' : 'text-slate-300 dark:text-slate-600')}
                />
                <p className={cn('font-bold uppercase text-[11px] tracking-widest',
                  isDragOver ? 'text-[#1A1AFF]' : 'text-slate-400 dark:text-slate-500')}>
                  {isDragOver ? '📂 Solte para adicionar!' : 'Arraste arquivos ou clique aqui'}
                </p>
              </div>
            ) : (
              /* Galeria com cards */
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={photos.map((p) => p.id)} strategy={rectSortingStrategy}>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {photos.map((p, i) => (
                      <SortablePhotoCard
                        key={p.id}
                        photo={p}
                        index={i}
                        onRemove={makeRemoveHandler(p.id)}
                        onUpdateDescription={makeDescHandler(p.id)}
                      />
                    ))}
                    {uploadingCount > 0 && Array.from({ length: uploadingCount }).map((_, i) => (
                      <PhotoCardSkeleton key={`skel-${i}`} />
                    ))}
                  </div>
                </SortableContext>

                <DragOverlay>
                  {activePhoto ? (
                    <div className="opacity-90 rotate-1 scale-105 shadow-2xl rounded-lg overflow-hidden">
                      <img src={activePhoto.src} alt="" className="w-full aspect-video object-cover" loading="lazy" />
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            )}
          </div>
        </section>
      </main>

      <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={(e) => handleFiles(e.target.files!)} className="hidden" />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={(e) => handleFiles(e.target.files!)} className="hidden" />

      <ExportModal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} />

      <ConfirmDialog
        isOpen={confirmClear}
        title="Apagar todas as fotos?"
        description="Esta ação remove todas as fotos e dados de sessão. Não pode ser desfeita."
        confirmLabel="Apagar tudo"
        cancelLabel="Cancelar"
        variant="danger"
        onConfirm={handleClearAll}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}
