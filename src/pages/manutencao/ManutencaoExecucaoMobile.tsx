import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Loader2, MapPin, LogIn, Route as RouteIcon, Flag, PlayCircle,
  PauseCircle, CheckCircle2, Circle, MinusCircle, AlertTriangle, Package,
  Camera, Video, ListChecks, X, User, Users, CalendarClock, StickyNote,
  Navigation, ExternalLink, Trash2, Download, Images,
} from 'lucide-react';
import {
  getManutencaoOrder, updateOrderStatus, updateChecklistItem,
  addOcorrencias, addMateriais, addFotoManutencao, addVideoManutencao,
  removeFotoManutencao,
} from '@/lib/manutencaoService';
import {
  ManutencaoOrdem, StatusOS, PRIORIDADE_LABEL, EstadoChecklistItem, FotoOS, PROBLEMAS_CTO_GRUPOS,
} from '@/types/manutencao';
import { getSignedFotoManutencaoUrl } from '@/lib/supabaseClient';
import { enqueueFoto, enqueueVideo, countPendentes, flushPendentes } from '@/lib/manutencaoOfflineQueue';
import { BackButton } from '@/components/BackButton';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

/** Redimensiona/comprime uma foto de câmera antes do upload — mesmo princípio de Photos.tsx (max 1200px, jpeg 0.7). */
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

// Próxima ação recomendada por status — navegação linear (uma ação grande por vez).
const PROXIMA_ACAO: Partial<Record<StatusOS, { label: string; icon: any; proximo: StatusOS; acao: string }>> = {
  atribuida: { label: 'Receber Serviço', icon: LogIn, proximo: 'recebida', acao: 'Serviço recebido pelo técnico' },
  reaberta: { label: 'Receber Retrabalho', icon: LogIn, proximo: 'recebida', acao: 'Retrabalho recebido pelo técnico' },
  recebida: { label: 'Iniciar Deslocamento', icon: RouteIcon, proximo: 'deslocamento', acao: 'Deslocamento iniciado' },
  deslocamento: { label: 'Cheguei ao Local', icon: MapPin, proximo: 'no_local', acao: 'Chegada ao local confirmada' },
  no_local: { label: 'Iniciar Execução', icon: PlayCircle, proximo: 'em_execucao', acao: 'Execução iniciada' },
};

const MENSAGEM_SOMENTE_LEITURA: Partial<Record<StatusOS, string>> = {
  aberta: 'Aguardando um supervisor atribuir esta OS a uma equipe/técnico.',
  aguardando_aprovacao: 'Atividade finalizada — em análise do gestor.',
  aprovada: 'OS aprovada pelo gestor. Nada mais a fazer aqui.',
  cancelada: 'Esta OS foi cancelada.',
  concluida: 'Esta OS já foi concluída.',
};

function ChecklistIcon({ estado }: { estado: EstadoChecklistItem }) {
  if (estado === 'concluido') return <CheckCircle2 size={20} className="text-green-600" />;
  if (estado === 'nao_aplica') return <MinusCircle size={20} className="text-slate-400" />;
  return <Circle size={20} className="text-slate-300" />;
}

function BigActionButton({
  icon: Icon,
  label,
  onClick,
  busy,
}: {
  icon: any;
  label: string;
  onClick: () => void;
  busy?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="w-full flex items-center justify-center gap-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-base font-black py-5 rounded-2xl shadow-sm transition-colors"
    >
      {busy ? <Loader2 size={22} className="animate-spin" /> : <Icon size={22} />}
      {label}
    </button>
  );
}

function ToolButton({ icon: Icon, label, onClick }: { icon: any; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-4 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
    >
      <div className="w-11 h-11 rounded-xl bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center">
        <Icon size={20} />
      </div>
      <span className="text-xs font-bold text-slate-700 dark:text-slate-200 text-center leading-tight">{label}</span>
    </button>
  );
}

export default function ManutencaoExecucaoMobile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ordem, setOrdem] = useState<ManutencaoOrdem | null>(null);
  const [loading, setLoading] = useState(true);
  const [avancando, setAvancando] = useState(false);
  const [confirmFinalizar, setConfirmFinalizar] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);
  const [showOcorrencia, setShowOcorrencia] = useState(false);
  const [showMaterial, setShowMaterial] = useState(false);
  const [showPausar, setShowPausar] = useState(false);
  const [enviandoMidia, setEnviandoMidia] = useState<'foto' | 'video' | null>(null);
  const [pendentes, setPendentes] = useState(0);
  const [sincronizando, setSincronizando] = useState(false);
  const [fotoUrls, setFotoUrls] = useState<Record<string, string>>({});
  const [ampliada, setAmpliada] = useState<FotoOS | null>(null);
  const [paraExcluirFoto, setParaExcluirFoto] = useState<FotoOS | null>(null);
  const [excluindoFoto, setExcluindoFoto] = useState(false);

  const fotoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const carregar = () => {
    if (!id) return;
    setLoading(true);
    getManutencaoOrder(id)
      .then(setOrdem)
      .catch((err) => console.error('[Manutencao] Erro ao carregar OS:', err))
      .finally(() => setLoading(false));
  };

  useEffect(carregar, [id]);

  // Todas as fotos da OS (antes/durante) — o técnico de manutenção pode ver
  // qualquer uma a qualquer momento da tratativa, mesmo as que ele não tirou
  // (as "antes", tiradas pelo Técnico LA na abertura), só sem poder editá-las.
  useEffect(() => {
    if (!ordem || ordem.fotos.length === 0) { setFotoUrls({}); return; }
    let ativo = true;
    Promise.all(ordem.fotos.map(async (f) => [f.id, await getSignedFotoManutencaoUrl(f.storagePath)] as const))
      .then((pairs) => { if (ativo) setFotoUrls(Object.fromEntries(pairs.filter(([, u]) => u) as [string, string][])); });
    return () => { ativo = false; };
  }, [ordem?.fotos]);

  const atualizarPendentes = () => {
    if (id) countPendentes(id).then(setPendentes);
  };

  // Extraída do useEffect pra também poder ser disparada manualmente pelo
  // botão "Tentar agora" no banner — o evento 'online' do navegador nem
  // sempre dispara de forma confiável em conexão de campo instável.
  const trySync = useCallback(async () => {
    if (!id) return;
    setSincronizando(true);
    try {
      const enviados = await flushPendentes(id);
      if (enviados > 0) {
        toast({ title: `${enviados} arquivo(s) sincronizado(s)`, description: 'Fotos/vídeos pendentes foram enviados.' });
        carregar();
      }
      atualizarPendentes();
    } finally {
      setSincronizando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Ao abrir a tela e sempre que a conexão voltar, tenta esvaziar a fila de
  // fotos/vídeos que ficaram pendentes por falta de sinal.
  useEffect(() => {
    if (!id) return;
    atualizarPendentes();
    trySync();
    window.addEventListener('online', trySync);
    return () => window.removeEventListener('online', trySync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleAvancar = async () => {
    if (!ordem) return;
    const passo = PROXIMA_ACAO[ordem.status];
    if (!passo) return;
    setAvancando(true);
    try {
      const extra = passo.proximo === 'em_execucao' ? { execucaoInicioEm: new Date().toISOString() } : undefined;
      await updateOrderStatus(ordem.id, passo.proximo, passo.acao, extra);
      carregar();
    } catch (err) {
      console.error('[Manutencao] Erro ao avançar status:', err);
      toast({ title: 'Não foi possível avançar', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setAvancando(false);
    }
  };

  const handlePausar = async (motivo?: string) => {
    if (!ordem) return;
    setAvancando(true);
    try {
      await updateOrderStatus(ordem.id, 'pausada', 'Execução pausada', motivo ? { descricao: motivo } : undefined);
      carregar();
    } finally {
      setAvancando(false);
    }
  };

  const handleRetomar = async () => {
    if (!ordem) return;
    setAvancando(true);
    try {
      await updateOrderStatus(ordem.id, 'em_execucao', 'Execução retomada');
      carregar();
    } finally {
      setAvancando(false);
    }
  };

  const handleFinalizar = async () => {
    if (!ordem) return;
    setConfirmFinalizar(false);
    setAvancando(true);
    try {
      await updateOrderStatus(ordem.id, 'aguardando_aprovacao', 'Execução finalizada', {
        execucaoFimEm: new Date().toISOString(),
      });
      toast({ title: 'OS finalizada', description: 'Enviada para aprovação do gestor.' });
      navigate('/manutencao/ordens');
    } catch (err) {
      console.error('[Manutencao] Erro ao finalizar OS:', err);
      toast({ title: 'Não foi possível finalizar', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setAvancando(false);
    }
  };

  const handleToggleChecklist = async (itemId: string, atual: EstadoChecklistItem) => {
    if (!ordem) return;
    const proximo: EstadoChecklistItem =
      atual === 'pendente' ? 'concluido' : atual === 'concluido' ? 'nao_aplica' : 'pendente';
    setOrdem((prev) =>
      prev ? { ...prev, checklist: prev.checklist.map((c) => (c.id === itemId ? { ...c, estado: proximo } : c)) } : prev,
    );
    try {
      await updateChecklistItem(ordem.id, itemId, proximo);
    } catch (err) {
      console.error('[Manutencao] Erro ao atualizar checklist:', err);
      carregar();
    }
  };

  const handleFotoSelected = async (file: File | undefined) => {
    if (!file || !ordem) return;
    setEnviandoMidia('foto');
    const dataUrl = await normalizeImage(file);
    try {
      if (!navigator.onLine) throw new Error('offline');
      await addFotoManutencao(ordem.id, dataUrl, 'durante');
      toast({ title: 'Foto anexada' });
      carregar();
    } catch (err) {
      if (!navigator.onLine) {
        await enqueueFoto(ordem.id, dataUrl, 'durante');
        toast({ title: 'Sem conexão', description: 'Foto salva no aparelho — será enviada quando a conexão voltar.' });
        atualizarPendentes();
      } else {
        console.error('[Manutencao] Erro ao anexar foto:', err);
        toast({ title: 'Não foi possível enviar a foto', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
      }
    } finally {
      setEnviandoMidia(null);
      if (fotoInputRef.current) fotoInputRef.current.value = '';
    }
  };

  // Remoção só se aplica às fotos "durante" (as que o próprio técnico de
  // manutenção tirou em campo) — as "antes" ficam disponíveis só pra visualização.
  const handleExcluirFoto = async () => {
    if (!paraExcluirFoto || !ordem) return;
    setExcluindoFoto(true);
    try {
      await removeFotoManutencao(paraExcluirFoto.id, paraExcluirFoto.storagePath, ordem.id);
      toast({ title: 'Foto removida' });
      setParaExcluirFoto(null);
      carregar();
    } catch (err) {
      console.error('[Manutencao] Erro ao remover foto:', err);
      toast({ title: 'Não foi possível remover a foto', variant: 'destructive' });
    } finally {
      setExcluindoFoto(false);
    }
  };

  const handleVideoSelected = async (file: File | undefined) => {
    if (!file || !ordem) return;
    setEnviandoMidia('video');
    try {
      if (!navigator.onLine) throw new Error('offline');
      await addVideoManutencao(ordem.id, file, file.type || 'video/mp4');
      toast({ title: 'Vídeo anexado' });
      carregar();
    } catch (err) {
      if (!navigator.onLine) {
        await enqueueVideo(ordem.id, file, file.type || 'video/mp4');
        toast({ title: 'Sem conexão', description: 'Vídeo salvo no aparelho — será enviado quando a conexão voltar.' });
        atualizarPendentes();
      } else {
        console.error('[Manutencao] Erro ao anexar vídeo:', err);
        toast({ title: 'Não foi possível enviar o vídeo', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
      }
    } finally {
      setEnviandoMidia(null);
      if (videoInputRef.current) videoInputRef.current.value = '';
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

  const passo = PROXIMA_ACAO[ordem.status];
  const emExecucao = ordem.status === 'em_execucao';
  const pausada = ordem.status === 'pausada';
  const mensagemFinal = MENSAGEM_SOMENTE_LEITURA[ordem.status];
  const checklistPendente = ordem.checklist.filter((c) => c.estado === 'pendente');

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 space-y-5 max-w-lg mx-auto">
      <div className="flex items-center justify-between gap-3">
        <BackButton to="/manutencao/ordens" variant="ghost-light" label="Voltar" />
        <ThemeToggle />
      </div>

      {/* Cabeçalho — tudo que o técnico precisa ver antes de sair pra rua */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-black text-slate-800 dark:text-slate-100">{ordem.numero}</h1>
          <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 shrink-0">
            {PRIORIDADE_LABEL[ordem.prioridade]}
          </span>
        </div>

        <div className="text-sm text-slate-600 dark:text-slate-300 flex items-start gap-1.5">
          <MapPin size={14} className="mt-0.5 shrink-0 text-slate-400" />
          <span>
            {ordem.endereco ? `${ordem.endereco}${ordem.numeroEndereco ? `, ${ordem.numeroEndereco}` : ''} — ` : ''}
            {ordem.bairro ? `${ordem.bairro}, ` : ''}{ordem.municipio || 'Endereço não informado'}
            {ordem.referencia && (
              <span className="block text-xs text-slate-400 mt-0.5">Ponto de referência: {ordem.referencia}</span>
            )}
          </span>
        </div>

        <p className="text-sm text-slate-500">{ordem.problemaInformado || 'Sem descrição do problema.'}</p>

        {ordem.observacoes && (
          <p className="text-sm text-slate-500 flex items-start gap-1.5">
            <StickyNote size={14} className="mt-0.5 shrink-0 text-slate-400" />
            {ordem.observacoes}
          </p>
        )}

        <div className="grid grid-cols-2 gap-x-3 gap-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 col-span-2">
            <User size={13} className="shrink-0 text-slate-400" /> {ordem.solicitante || 'Sem solicitante'}
          </div>
          {ordem.equipe && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500 col-span-2">
              <Users size={13} className="shrink-0 text-slate-400" /> {ordem.equipe}
            </div>
          )}
          {(ordem.dataPrevista || ordem.horarioPrevisto) && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500 col-span-2">
              <CalendarClock size={13} className="shrink-0 text-slate-400" />
              {ordem.dataPrevista ? new Date(`${ordem.dataPrevista}T00:00:00`).toLocaleDateString('pt-BR') : ''}
              {ordem.horarioPrevisto ? ` às ${ordem.horarioPrevisto}` : ''}
            </div>
          )}
        </div>

        {ordem.fotos.some((f) => f.categoria === 'antes') && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <p className="text-[11px] font-black uppercase tracking-wide text-slate-400 mb-2">Fotos do problema (antes)</p>
            <div className="flex gap-2 overflow-x-auto">
              {ordem.fotos.filter((f) => f.categoria === 'antes').map((f) => (
                fotoUrls[f.id] ? (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setAmpliada(f)}
                    className="w-16 h-16 rounded-lg overflow-hidden shrink-0 border border-slate-200 dark:border-slate-800"
                  >
                    <img
                      src={fotoUrls[f.id]}
                      alt="Foto do problema antes da manutenção"
                      className="w-full h-full object-cover"
                    />
                  </button>
                ) : (
                  <div key={f.id} className="w-16 h-16 rounded-lg shrink-0 bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <Loader2 size={14} className="animate-spin text-slate-400" />
                  </div>
                )
              ))}
            </div>
          </div>
        )}
      </div>

      {ordem.status === 'reaberta' && ordem.motivoRecusa && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/50 rounded-2xl p-4">
          <p className="text-xs font-black uppercase tracking-wide text-amber-700 dark:text-amber-400 mb-1">Observação do retrabalho</p>
          <p className="text-sm text-amber-800 dark:text-amber-300">{ordem.motivoRecusa}</p>
        </div>
      )}

      {/* Recebida e ainda não em deslocamento — mostra o mapa pra chegar no local. */}
      {ordem.status === 'recebida' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
          <h2 className="text-xs font-black uppercase tracking-wide text-slate-400 flex items-center gap-1.5">
            <Navigation size={13} /> Como chegar
          </h2>
          {ordem.latitude != null && ordem.longitude != null ? (
            <>
              <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 h-48">
                <iframe
                  title="Localização da OS"
                  className="w-full h-full border-0"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${ordem.longitude - 0.005}%2C${ordem.latitude - 0.005}%2C${ordem.longitude + 0.005}%2C${ordem.latitude + 0.005}&marker=${ordem.latitude}%2C${ordem.longitude}`}
                />
              </div>
              <div className="text-xs">
                <p className="text-slate-400 font-bold uppercase text-[10px]">Coordenadas (UTM)</p>
                <p className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                  {ordem.latitude.toFixed(6)}, {ordem.longitude.toFixed(6)}
                </p>
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
            <p className="text-sm text-slate-400">Nenhuma coordenada registrada para esta OS.</p>
          )}
        </div>
      )}

      {/* Próxima ação linear */}
      {passo && (
        <BigActionButton icon={passo.icon} label={passo.label} onClick={handleAvancar} busy={avancando} />
      )}

      {pausada && (
        <BigActionButton icon={PlayCircle} label="Retomar Execução" onClick={handleRetomar} busy={avancando} />
      )}

      {mensagemFinal && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 rounded-2xl p-4 flex items-start gap-2.5">
          <AlertTriangle size={16} className="text-blue-500 shrink-0 mt-0.5" />
          <p className="text-sm text-blue-700 dark:text-blue-300">{mensagemFinal}</p>
        </div>
      )}

      {pendentes > 0 && (
        <div className="flex items-center gap-2 text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/50 rounded-xl px-3 py-2.5">
          {sincronizando ? <Loader2 size={14} className="animate-spin shrink-0" /> : <Loader2 size={14} className="shrink-0 opacity-40" />}
          <span className="flex-1">{pendentes} foto(s)/vídeo(s) aguardando conexão para enviar</span>
          <button
            onClick={trySync}
            disabled={sincronizando}
            className="shrink-0 text-amber-700 dark:text-amber-400 underline disabled:opacity-50"
          >
            Tentar agora
          </button>
        </div>
      )}

      {/* Ferramentas de execução — disponíveis durante em_execucao/pausada */}
      {(emExecucao || pausada) && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <ToolButton icon={AlertTriangle} label="Ocorrência" onClick={() => setShowOcorrencia(true)} />
            <ToolButton icon={Package} label="Material" onClick={() => setShowMaterial(true)} />
            <ToolButton icon={ListChecks} label="Checklist" onClick={() => setShowChecklist(true)} />
            <ToolButton
              icon={enviandoMidia === 'foto' ? Loader2 : Camera}
              label="Tirar Foto"
              onClick={() => fotoInputRef.current?.click()}
            />
            <ToolButton
              icon={enviandoMidia === 'video' ? Loader2 : Video}
              label="Gravar Vídeo"
              onClick={() => videoInputRef.current?.click()}
            />
            <ToolButton icon={PauseCircle} label="Pausar" onClick={() => setShowPausar(true)} />
          </div>

          {/* Fotos tiradas durante a execução — o técnico de manutenção pode ver e remover as que tirou aqui. */}
          {ordem.fotos.some((f) => f.categoria === 'durante') && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-2">
              <p className="text-[11px] font-black uppercase tracking-wide text-slate-400 flex items-center gap-1.5">
                <Images size={13} /> Fotos desta execução
              </p>
              <div className="grid grid-cols-4 gap-2">
                {ordem.fotos.filter((f) => f.categoria === 'durante').map((f) => (
                  <div key={f.id} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800">
                    {fotoUrls[f.id] ? (
                      <button type="button" onClick={() => setAmpliada(f)} className="w-full h-full">
                        <img src={fotoUrls[f.id]} alt="Foto da execução" className="w-full h-full object-cover" />
                      </button>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Loader2 size={14} className="animate-spin text-slate-400" />
                      </div>
                    )}
                    <button
                      onClick={() => setParaExcluirFoto(f)}
                      className="absolute top-1 right-1 w-6 h-6 rounded-md bg-black/60 text-white flex items-center justify-center"
                      aria-label="Remover foto"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <BigActionButton icon={Flag} label="Finalizar Ordem" onClick={() => setConfirmFinalizar(true)} busy={avancando} />
        </>
      )}

      {/* Inputs ocultos de câmera */}
      <input
        ref={fotoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFotoSelected(e.target.files?.[0])}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleVideoSelected(e.target.files?.[0])}
      />

      <ConfirmDialog
        isOpen={confirmFinalizar}
        title="Finalizar OS?"
        description={
          checklistPendente.length > 0
            ? `Atenção: ${checklistPendente.length} item(ns) do checklist ainda estão pendentes (${checklistPendente.map((c) => c.label).join(', ')}). A ordem vai para aprovação do gestor mesmo assim — deseja continuar?`
            : 'A ordem vai para aprovação do gestor. Confira se fotos e ocorrências já foram registrados.'
        }
        confirmLabel={checklistPendente.length > 0 ? 'Finalizar mesmo assim' : 'Finalizar'}
        variant={checklistPendente.length > 0 ? 'danger' : 'warning'}
        onConfirm={handleFinalizar}
        onCancel={() => setConfirmFinalizar(false)}
      />

      {showChecklist && (
        <ChecklistModal
          checklist={ordem.checklist}
          onToggle={handleToggleChecklist}
          onClose={() => setShowChecklist(false)}
        />
      )}

      {showOcorrencia && (
        <OcorrenciaModal
          ordemId={ordem.id}
          ocorrencias={ordem.ocorrencias}
          onClose={() => setShowOcorrencia(false)}
          onSaved={() => { setShowOcorrencia(false); carregar(); }}
        />
      )}

      {showMaterial && (
        <MaterialModal
          ordemId={ordem.id}
          onClose={() => setShowMaterial(false)}
          onSaved={() => { setShowMaterial(false); carregar(); }}
        />
      )}

      {showPausar && (
        <PausarModal
          busy={avancando}
          onClose={() => setShowPausar(false)}
          onConfirmar={async (motivo) => {
            await handlePausar(motivo);
            setShowPausar(false);
          }}
        />
      )}

      {/* Visualização ampliada — vale tanto pras fotos "antes" (só visualização)
          quanto pras "durante" (remoção fica no botão da miniatura, não aqui). */}
      {ampliada && fotoUrls[ampliada.id] && (
        <div className="fixed inset-0 z-[1000] bg-black/80 flex items-center justify-center p-4" onClick={() => setAmpliada(null)}>
          <button onClick={() => setAmpliada(null)} className="absolute top-4 right-4 text-white/80 hover:text-white" aria-label="Fechar">
            <X size={28} />
          </button>
          <img
            src={fotoUrls[ampliada.id]}
            alt=""
            className="max-w-full max-h-[85vh] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <a
            href={fotoUrls[ampliada.id]}
            download
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-4 flex items-center gap-2 bg-white/90 text-slate-800 text-sm font-bold px-4 py-2 rounded-xl"
          >
            <Download size={14} /> Baixar
          </a>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!paraExcluirFoto}
        title="Remover foto?"
        description="Essa ação não pode ser desfeita."
        confirmLabel={excluindoFoto ? 'Removendo...' : 'Remover'}
        onConfirm={handleExcluirFoto}
        onCancel={() => setParaExcluirFoto(null)}
      />
    </div>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900">
          <h2 className="text-base font-black text-slate-800 dark:text-slate-100">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>
        <div className="p-5 space-y-4">{children}</div>
      </div>
    </div>
  );
}

function ChecklistModal({
  checklist,
  onToggle,
  onClose,
}: {
  checklist: ManutencaoOrdem['checklist'];
  onToggle: (itemId: string, atual: EstadoChecklistItem) => void;
  onClose: () => void;
}) {
  return (
    <ModalShell title="Checklist" onClose={onClose}>
      <div className="space-y-1">
        {checklist.map((item) => (
          <button
            key={item.id}
            onClick={() => onToggle(item.id, item.estado)}
            className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-left"
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
        <p className="text-[11px] text-slate-400 pt-2">Toque no item para alternar: pendente → concluído → não se aplica.</p>
      </div>
    </ModalShell>
  );
}

function OcorrenciaModal({
  ordemId,
  ocorrencias,
  onClose,
  onSaved,
}: {
  ordemId: string;
  ocorrencias: ManutencaoOrdem['ocorrencias'];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);

  const toggleProblema = (item: string) => {
    setSelecionados((prev) => (prev.includes(item) ? prev.filter((p) => p !== item) : [...prev, item]));
  };

  const handleSalvar = async () => {
    if (selecionados.length === 0) return;
    setSalvando(true);
    try {
      const { novosItensChecklist } = await addOcorrencias(ordemId, selecionados, observacao || undefined);
      const titulo = selecionados.length === 1 ? 'Ocorrência registrada' : `${selecionados.length} ocorrências registradas`;
      toast({
        title: titulo,
        description: novosItensChecklist > 0
          ? `${novosItensChecklist} item(ns) adicionado(s) ao checklist.`
          : undefined,
      });
      onSaved();
    } catch (err) {
      console.error('[Manutencao] Erro ao registrar ocorrência:', err);
      toast({ title: 'Não foi possível registrar', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <ModalShell title="Ocorrências" onClose={onClose}>
      {/* Ocorrências já registradas — inclusive as marcadas na abertura da OS
          pelo Técnico LA, que continuam visíveis aqui pro técnico de
          manutenção, só não dá pra editar/remover (fica só como histórico). */}
      {ocorrencias.length > 0 && (
        <div>
          <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 block">
            Já registradas
          </label>
          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
            {ocorrencias.map((o) => (
              <div key={o.id} className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-500" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{o.tipo}</p>
                  {o.observacao && <p className="text-xs text-slate-400">{o.observacao}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mesma caixa de checklist da abertura da OS (PROBLEMAS_CTO) — cada
          problema marcado vira uma ocorrência E um item a resolver no
          checklist de atividades. */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            Nova ocorrência <span className="text-red-500">*</span>
          </label>
          <span className={cn(
            'text-[10px] font-black px-1.5 py-0.5 rounded-full',
            selecionados.length === 0
              ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
              : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
          )}>
            {selecionados.length > 0
              ? `${selecionados.length} marcado${selecionados.length > 1 ? 's' : ''}`
              : 'nenhum marcado'}
          </span>
        </div>
        <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
          {PROBLEMAS_CTO_GRUPOS.map((grupo) => (
            <div key={grupo.grupo}>
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1">
                {grupo.grupo}
              </p>
              <div className="space-y-2">
                {grupo.itens.map((item, i) => (
                  <label
                    key={i}
                    htmlFor={`ocorrencia-problema-${grupo.grupo}-${i}`}
                    className="flex items-start gap-2.5 cursor-pointer select-none"
                  >
                    <input
                      id={`ocorrencia-problema-${grupo.grupo}-${i}`}
                      type="checkbox"
                      checked={selecionados.includes(item)}
                      onChange={() => toggleProblema(item)}
                      className="mt-0.5 h-4 w-4 text-amber-500 border-slate-300 rounded focus:ring-amber-500"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-200 leading-tight">{item}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Observação (opcional)</label>
        <textarea
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          rows={2}
          className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 resize-none"
        />
      </div>

      <button
        onClick={handleSalvar}
        disabled={salvando || selecionados.length === 0}
        className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-bold py-2.5 rounded-xl transition-colors"
      >
        {salvando ? <Loader2 size={16} className="animate-spin" /> : 'Salvar Ocorrência'}
      </button>
    </ModalShell>
  );
}

const UNIDADES_MATERIAL = ['un', 'm', 'cx', 'kit'];

interface LinhaMaterial {
  material: string;
  quantidade: number;
  unidade: string;
  observacao: string;
}

const LINHA_VAZIA = (): LinhaMaterial => ({ material: '', quantidade: 1, unidade: UNIDADES_MATERIAL[0], observacao: '' });

function MaterialModal({ ordemId, onClose, onSaved }: { ordemId: string; onClose: () => void; onSaved: () => void }) {
  const [linhas, setLinhas] = useState<LinhaMaterial[]>([LINHA_VAZIA()]);
  const [salvando, setSalvando] = useState(false);

  const atualizarLinha = (index: number, patch: Partial<LinhaMaterial>) => {
    setLinhas((prev) => prev.map((linha, i) => (i === index ? { ...linha, ...patch } : linha)));
  };

  const removerLinha = (index: number) => {
    setLinhas((prev) => prev.filter((_, i) => i !== index));
  };

  const linhasValidas = linhas.filter((l) => l.material.trim());

  const handleSalvar = async () => {
    if (linhasValidas.length === 0) return;
    setSalvando(true);
    try {
      await addMateriais(ordemId, linhasValidas.map((l) => ({
        material: l.material,
        quantidade: l.quantidade,
        unidade: l.unidade,
        observacao: l.observacao || undefined,
      })));
      toast({ title: linhasValidas.length === 1 ? 'Material registrado' : `${linhasValidas.length} materiais registrados` });
      onSaved();
    } catch (err) {
      console.error('[Manutencao] Erro ao registrar material:', err);
      toast({ title: 'Não foi possível registrar', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <ModalShell title="Adicionar Material" onClose={onClose}>
      <div className="space-y-4">
        {linhas.map((linha, index) => (
          <div key={index} className="space-y-2.5 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">Item {index + 1}</span>
              {linhas.length > 1 && (
                <button onClick={() => removerLinha(index)} className="text-slate-400 hover:text-red-500" aria-label="Remover item">
                  <X size={14} />
                </button>
              )}
            </div>
            <input
              value={linha.material}
              onChange={(e) => atualizarLinha(index, { material: e.target.value })}
              placeholder="Ex: Cabo Drop 1FO"
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number" min={0.01} step={0.01}
                value={linha.quantidade}
                onChange={(e) => atualizarLinha(index, { quantidade: Number(e.target.value) || 1 })}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
              <select
                value={linha.unidade}
                onChange={(e) => atualizarLinha(index, { unidade: e.target.value })}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                {UNIDADES_MATERIAL.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <input
              value={linha.observacao}
              onChange={(e) => atualizarLinha(index, { observacao: e.target.value })}
              placeholder="Obs (opcional)"
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          </div>
        ))}

        <button
          onClick={() => setLinhas((prev) => [...prev, LINHA_VAZIA()])}
          className="w-full flex items-center justify-center gap-2 text-xs font-bold text-amber-600 dark:text-amber-400 py-2"
        >
          + Adicionar outro item
        </button>

        <button
          onClick={handleSalvar}
          disabled={salvando || linhasValidas.length === 0}
          className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-bold py-2.5 rounded-xl transition-colors"
        >
          {salvando ? <Loader2 size={16} className="animate-spin" /> : `Salvar ${linhasValidas.length > 1 ? `${linhasValidas.length} materiais` : 'material'}`}
        </button>
      </div>
    </ModalShell>
  );
}

function PausarModal({
  busy,
  onClose,
  onConfirmar,
}: {
  busy: boolean;
  onClose: () => void;
  onConfirmar: (motivo?: string) => void;
}) {
  const [motivo, setMotivo] = useState('');

  return (
    <ModalShell title="Pausar Execução" onClose={onClose}>
      <div>
        <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">
          Motivo da pausa (opcional)
        </label>
        <textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={2}
          placeholder="Ex: aguardando material, cliente ausente, fim de expediente..."
          className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 resize-none"
        />
      </div>
      <button
        onClick={() => onConfirmar(motivo.trim() || undefined)}
        disabled={busy}
        className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-bold py-2.5 rounded-xl transition-colors"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : 'Confirmar pausa'}
      </button>
    </ModalShell>
  );
}
