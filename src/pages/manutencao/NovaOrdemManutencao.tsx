import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, Check, Loader2, MapPin, Navigation, RefreshCw, AlertTriangle, Sparkles,
  Camera, X, Image as ImageIcon,
} from 'lucide-react';
import { reverseGeocode, UFS } from '@/lib/geocoding';
import { LocationMapPicker } from '@/components/LocationMapPicker';
import { toast } from '@/hooks/use-toast';
import { createManutencaoOrder, addFotoManutencao } from '@/lib/manutencaoService';
import {
  PrioridadeOS, PRIORIDADE_LABEL, PROBLEMAS_CTO_GRUPOS, deserializeProblemas, serializeProblemas,
} from '@/types/manutencao';
import { useAuth } from '@/contexts/AuthContext';
import { BackButton } from '@/components/BackButton';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { cn } from '@/lib/utils';

type Step = 'motivo' | 'informacoes' | 'localizacao';

const STEPS: { key: Step; label: string }[] = [
  { key: 'motivo', label: 'Motivo da manutenção' },
  { key: 'informacoes', label: 'Coleta de informações' },
  { key: 'localizacao', label: 'Localização' },
];

const TIPOS = [
  'Manutenção Corretiva', 'Manutenção Preventiva', 'Manutenção Preditiva', 'Instalação', 'Vistoria Técnica',
  // Preventiva CTO/Rede — normalmente nascem do fluxo de pendência do módulo
  // de Vistoria (ver vistoriaService.ts), mas continuam selecionáveis aqui
  // pra quando o problema já é identificado sem passar por uma rota.
  'Preventiva CTO', 'Preventiva Rede',
];
const ORIGENS = ['Chamado do cliente', 'Sistema', 'Fiscalização', 'Solicitação interna'];

// Múltipla escolha, porque mais de um problema costuma coexistir na mesma
// CTO (ex: quebrada + sem tampa). Serialização por '||' vive em
// types/manutencao.ts, ao lado de deserializeProblemas — o registro de
// pendência de vistoria grava no mesmo formato.

const PRIORIDADE_ACTIVE_COLOR: Record<PrioridadeOS, string> = {
  baixa: 'bg-slate-500 border-slate-500 text-white',
  media: 'bg-blue-500 border-blue-500 text-white',
  alta: 'bg-orange-500 border-orange-500 text-white',
  critica: 'bg-red-500 border-red-500 text-white',
};

function formatDateLocal(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
function formatTimeLocal(d: Date) {
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mi}`;
}

/** Redimensiona/comprime uma foto antes do upload — mesmo princípio usado em ManutencaoExecucaoMobile.tsx (max 1200px, jpeg 0.7). */
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

type AutoCollectStatus = 'idle' | 'locating' | 'geocoding' | 'success' | 'partial' | 'error';

interface AutoCollectState {
  status: AutoCollectStatus;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  errorMessage?: string;
  /** Número do endereço veio do imóvel mais próximo (Overpass), não do ponto exato — ver geocoding.ts. */
  numeroAproximado?: boolean;
}

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  auto?: boolean; // indica visualmente que o valor veio da coleta automática
}

function Field({ label, auto, className, ...props }: FieldProps) {
  return (
    // `min-w-0` é o que faz esta div (o item do grid) conseguir encolher
    // abaixo da largura mínima intrínseca do conteúdo — sem isso, inputs
    // nativos de date/time (que o navegador nunca deixa encolher sozinhos)
    // estouram a coluna em telas estreitas em vez de respeitar `w-full`.
    <div className="min-w-0">
      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
        {label}
        {auto && (
          <span
            title="Preenchido automaticamente pela localização"
            className="inline-flex items-center gap-0.5 text-[9px] font-black normal-case tracking-normal text-blue-500 dark:text-blue-400"
          >
            <Sparkles size={10} /> auto
          </span>
        )}
      </label>
      <input
        {...props}
        className={cn(
          'w-full min-w-0 px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700',
          'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200',
          'placeholder:text-slate-400 dark:placeholder:text-slate-500',
          'focus:outline-none focus:ring-2 focus:ring-amber-500',
          'dark:[color-scheme:dark]',
          className,
        )}
      />
    </div>
  );
}

export default function NovaOrdemManutencao() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [step, setStep] = useState<Step>('motivo');
  const [creating, setCreating] = useState(false);
  const [autoCollect, setAutoCollect] = useState<AutoCollectState>({ status: 'idle' });
  const [showMapPicker, setShowMapPicker] = useState(false);

  // Fotos tiradas na abertura (categoria "antes") — ficam só na memória até a
  // OS existir de verdade; sobem pro storage logo depois de criar (ver
  // handleCriarOrdem), já que fotos_manutencao exige um ordem_id válido.
  const [fotosIniciais, setFotosIniciais] = useState<{ id: string; dataUrl: string }[]>([]);
  const [processandoFoto, setProcessandoFoto] = useState(false);
  const fotoInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState(() => {
    const previsto = new Date(Date.now() + 48 * 60 * 60 * 1000); // +48h a partir da abertura
    return {
      tipo: TIPOS[0],
      origem: ORIGENS[0],
      prioridade: 'media' as PrioridadeOS,
      problemaInformado: '', // string serializada ('||') dos itens marcados no checklist
      observacoes: '', // texto livre, opcional

      // Sem campo de "solicitante": o Técnico LA que abre a OS já É o
      // solicitante, por definição de negócio — usamos o nome dele
      // diretamente na criação (ver handleCriarOrdem), sem perguntar de novo.
      setor: profile?.setor ?? '',
      responsavel: profile?.nome ?? '',
      uf: '',
      municipio: '',
      bairro: '',
      endereco: '',
      numeroEndereco: '',
      referencia: '',
      dataPrevista: formatDateLocal(previsto),
      horarioPrevisto: formatTimeLocal(previsto),
    };
  });

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  // Caso o perfil do usuário ainda não tivesse carregado no momento do mount,
  // preenche o responsável assim que ele chegar (sem sobrescrever edição manual).
  useEffect(() => {
    if (profile?.nome) {
      setForm((prev) => (prev.responsavel ? prev : { ...prev, responsavel: profile.nome }));
    }
  }, [profile]);

  const updateField = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
  };

  // ── Checklist de problema informado (multi-seleção) ──────────────────
  const problemasSelecionados = deserializeProblemas(form.problemaInformado);

  const toggleProblema = (item: string) => {
    setForm((prev) => {
      const atual = deserializeProblemas(prev.problemaInformado);
      const next = atual.includes(item) ? atual.filter((i) => i !== item) : [...atual, item];
      return { ...prev, problemaInformado: serializeProblemas(next) };
    });
  };

  // ── Coleta automática: geolocalização + geocodificação reversa ────────
  const runAutoCollect = () => {
    if (!navigator.geolocation) {
      setAutoCollect({ status: 'error', errorMessage: 'Este navegador não suporta geolocalização.' });
      return;
    }
    setAutoCollect({ status: 'locating' });
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setAutoCollect({ status: 'geocoding', latitude, longitude, accuracy });

        const addr = await reverseGeocode(latitude, longitude);
        if (addr) {
          setForm((prev) => ({
            ...prev,
            bairro: prev.bairro || addr.bairro,
            municipio: prev.municipio || addr.municipio,
            uf: prev.uf || addr.uf,
            endereco: prev.endereco || addr.endereco,
            numeroEndereco: prev.numeroEndereco || addr.numeroEndereco,
            referencia: prev.referencia || addr.referencia,
          }));
          setAutoCollect({ status: 'success', latitude, longitude, accuracy, numeroAproximado: addr.numeroAproximado });
        } else {
          setAutoCollect({
            status: 'partial',
            latitude, longitude, accuracy,
            errorMessage: 'Coordenadas capturadas, mas não foi possível identificar o endereço automaticamente. Preencha manualmente se necessário.',
          });
        }
      },
      (err) => {
        let msg = 'Não foi possível obter sua localização.';
        if (err.code === err.PERMISSION_DENIED) {
          msg = 'Permissão de localização negada. Você pode preencher os campos manualmente, ou permitir o acesso e tentar de novo.';
        } else if (err.code === err.TIMEOUT) {
          msg = 'Tempo esgotado ao tentar obter a localização.';
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          msg = 'Sinal de GPS fraco nesta área. Tente se aproximar de uma janela, ou selecione o ponto manualmente no mapa.';
        }
        setAutoCollect({ status: 'error', errorMessage: msg });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  // Dispara assim que o wizard abre — não espera o usuário chegar no passo 3,
  // pra que os campos de endereço do passo 2 já venham preenchidos.
  useEffect(() => {
    runAutoCollect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handler do mapa manual — reaproveita o MESMO reverseGeocode do fluxo automático
  const handleManualPick = async (lat: number, lng: number) => {
    setShowMapPicker(false);
    setAutoCollect({ status: 'geocoding', latitude: lat, longitude: lng });
    const addr = await reverseGeocode(lat, lng);
    // Mesma precedência do runAutoCollect: o que o usuário já digitou manualmente
    // vence — ajustar o pino no mapa não deve apagar uma correção manual.
    setForm((prev) => ({
      ...prev,
      bairro: prev.bairro || addr?.bairro,
      municipio: prev.municipio || addr?.municipio,
      uf: prev.uf || addr?.uf,
      endereco: prev.endereco || addr?.endereco,
      numeroEndereco: prev.numeroEndereco || addr?.numeroEndereco,
      referencia: prev.referencia || addr?.referencia,
    }));
    setAutoCollect({
      status: 'success',
      latitude: lat,
      longitude: lng,
      numeroAproximado: !!(addr?.numeroAproximado && addr?.numeroEndereco),
    });
  };

  const isAutoBusy = autoCollect.status === 'locating' || autoCollect.status === 'geocoding';
  const hasCoords = autoCollect.latitude != null && autoCollect.longitude != null;
  // Não deixa a OS nascer sem nenhum jeito de localizar o serviço depois —
  // aceita tanto coordenada (UTM, capturada automaticamente ou marcada no
  // mapa) quanto um endereço mínimo digitado à mão; só bloqueia quando os
  // dois estão vazios.
  const hasLocationInfo = hasCoords || !!(form.municipio.trim() && form.endereco.trim());

  // ── Navegação entre passos ─────────────────────────────────────────────
  // Passo 1 exige pelo menos UM problema marcado no checklist (Obs é
  // opcional) — exceto em "Vistoria Técnica", que por definição parte pra
  // campo sem um defeito já identificado (é isso que a vistoria vai
  // levantar). Exigir um problema marcado ali só travava a abertura da OS.
  const isVistoriaTecnica = form.tipo === 'Vistoria Técnica';
  const canContinueStep1 = isVistoriaTecnica || problemasSelecionados.length > 0;
  // Etapa 2 não tem mais campo obrigatório (Setor/Responsável vêm
  // pré-preenchidos do perfil de quem está abrindo, e continuam editáveis).
  const canContinueStep2 = true;

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Sair no passo 0 descarta problemas já marcados e fotos já tiradas (só
  // viram uma OS de verdade em handleCriarOrdem, no fim do wizard) — sem
  // confirmação, um toque acidental em "Cancelar" perdia tudo silenciosamente.
  const handleBack = () => {
    if (stepIndex === 0) {
      if (problemasSelecionados.length > 0 || fotosIniciais.length > 0) {
        setShowCancelConfirm(true);
      } else {
        navigate('/manutencao');
      }
    } else {
      setStep(STEPS[stepIndex - 1].key);
    }
  };

  const handleAdicionarFotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setProcessandoFoto(true);
    try {
      const novas = await Promise.all(
        Array.from(files).map(async (file) => ({ id: crypto.randomUUID(), dataUrl: await normalizeImage(file) })),
      );
      setFotosIniciais((prev) => [...prev, ...novas]);
    } finally {
      setProcessandoFoto(false);
      // Limpa os dois — não dá pra saber de qual dos dois inputs (galeria ou
      // câmera) essa chamada veio, e um input com valor "sujo" não dispara
      // onChange de novo se o próximo arquivo escolhido tiver o mesmo path.
      if (fotoInputRef.current) fotoInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  };

  const handleRemoverFotoInicial = (id: string) => {
    setFotosIniciais((prev) => prev.filter((f) => f.id !== id));
  };

  const handleNext = () => {
    if (step === 'motivo' && canContinueStep1) setStep('informacoes');
    else if (step === 'informacoes' && canContinueStep2) setStep('localizacao');
  };

  const handleCriarOrdem = async () => {
    setCreating(true);
    try {
      // Nota de arquitetura: NÃO enviamos "equipe"/"tecnico" na abertura.
      // A OS nasce com status 'aberta' (default do service) e fica na fila
      // do supervisor/gestor da área — a delegação pro técnico de campo
      // acontece depois, na tela de Ordens (ManutencaoOrdersList), via
      // assignTecnico(). Ver DelegarTecnicoModal.tsx.
      const ordem = await createManutencaoOrder({
        tipo: form.tipo,
        origem: form.origem,
        prioridade: form.prioridade,
        problemaInformado: form.problemaInformado,
        observacoes: form.observacoes || undefined,
        // O solicitante é sempre quem abriu a OS (o Técnico LA, normalmente).
        solicitante: profile?.nome ?? '',
        setor: form.setor || undefined,
        responsavel: form.responsavel || undefined,
        uf: form.uf || undefined,
        municipio: form.municipio || undefined,
        bairro: form.bairro || undefined,
        endereco: form.endereco || undefined,
        numeroEndereco: form.numeroEndereco || undefined,
        referencia: form.referencia || undefined,
        dataPrevista: form.dataPrevista || undefined,
        horarioPrevisto: form.horarioPrevisto || undefined,
        latitude: hasCoords ? autoCollect.latitude : undefined,
        longitude: hasCoords ? autoCollect.longitude : undefined,
      });

      // Fotos da abertura (categoria "antes") só sobem depois da OS existir
      // de verdade. Falha em uma foto não desfaz a OS já criada — só avisa.
      if (fotosIniciais.length > 0) {
        const falhas = (await Promise.all(
          fotosIniciais.map((f) => addFotoManutencao(ordem.id, f.dataUrl, 'antes').then(() => null).catch(() => f.id)),
        )).filter((id): id is string => id != null);
        if (falhas.length > 0) {
          toast({
            title: `${falhas.length} foto(s) não enviada(s)`,
            description: 'A OS foi criada normalmente — anexe essas fotos depois pela aba Fotos.',
            variant: 'destructive',
          });
        }
      }

      navigate(`/manutencao/ordens/${ordem.id}`);
    } catch (err) {
      console.error('[Manutencao] Erro ao criar OS:', err);
      toast({
        title: 'Não foi possível criar a OS',
        description:
          err instanceof Error
            ? err.message
            : 'Verifique se seu usuário tem permissão para abrir ordens de manutenção.',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <BackButton onClick={handleBack} label={stepIndex === 0 ? 'Cancelar' : 'Voltar'} />
            <div className="min-w-0">
              <h1 className="text-xl font-black text-slate-800 dark:text-slate-100 truncate">Nova OS de Manutenção</h1>
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">{STEPS[stepIndex].label}</p>
            </div>
          </div>
          <ThemeToggle />
        </div>

        {/* Badge de status da coleta automática — visível em qualquer passo */}
        {isAutoBusy && (
          <div className="flex items-center gap-2 text-[11px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 rounded-xl px-3 py-2">
            <Loader2 size={13} className="animate-spin shrink-0" />
            {autoCollect.status === 'locating'
              ? 'Coletando localização automaticamente em segundo plano...'
              : 'Identificando o endereço a partir da sua localização...'}
          </div>
        )}
        {autoCollect.status === 'success' && (
          <div className="flex items-center gap-2 text-[11px] font-bold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800/50 rounded-xl px-3 py-2">
            <Sparkles size={13} className="shrink-0" />
            Endereço e localização coletados automaticamente — confira e ajuste se precisar.
          </div>
        )}

        {/* Stepper */}
        <div className="flex items-center">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex items-center flex-1 last:flex-none">
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 transition-colors',
                  step === s.key
                    ? 'bg-amber-500 text-white'
                    : stepIndex > i
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500',
                )}
              >
                {stepIndex > i ? <Check size={14} /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    'h-0.5 flex-1 mx-1.5 transition-colors',
                    stepIndex > i ? 'bg-amber-400' : 'bg-slate-200 dark:bg-slate-800',
                  )}
                />
              )}
            </div>
          ))}
        </div>

        {/* ── Passo 1: Motivo da manutenção ── */}
        {step === 'motivo' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-5">
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-2 block">
                Tipo de manutenção
              </label>
              <div className="grid grid-cols-2 gap-2">
                {TIPOS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm((prev) => ({
                      ...prev,
                      tipo: t,
                      // Vistoria é rotina, não urgência — preset só muda o
                      // padrão inicial, o técnico continua livre pra trocar.
                      prioridade: t === 'Vistoria Técnica' ? 'baixa' : prev.prioridade,
                    }))}
                    className={cn(
                      'text-sm font-semibold px-3 py-2.5 rounded-xl border text-left transition-colors',
                      form.tipo === t
                        ? 'bg-amber-500 border-amber-500 text-white'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800',
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-2 block">
                Prioridade
              </label>
              <div className="grid grid-cols-4 gap-2">
                {(Object.keys(PRIORIDADE_LABEL) as PrioridadeOS[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, prioridade: p }))}
                    className={cn(
                      'text-xs font-black px-2 py-2.5 rounded-xl border uppercase tracking-wide transition-colors',
                      form.prioridade === p
                        ? PRIORIDADE_ACTIVE_COLOR[p]
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800',
                    )}
                  >
                    {PRIORIDADE_LABEL[p]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-2 block">
                Origem
              </label>
              <select
                value={form.origem}
                onChange={(e) => setForm((prev) => ({ ...prev, origem: e.target.value }))}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {ORIGENS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>

            <div className="h-px bg-slate-100 dark:bg-slate-800" />

            {/* Checklist de problema informado — multi-seleção */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                  Problema informado{' '}
                  {isVistoriaTecnica
                    ? <span className="font-normal normal-case text-slate-500 dark:text-slate-400">(opcional nesta vistoria)</span>
                    : <span className="text-red-500">*</span>}
                </label>
                <span className={cn(
                  'text-[10px] font-black px-1.5 py-0.5 rounded-full',
                  problemasSelecionados.length === 0
                    ? isVistoriaTecnica
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                    : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
                )}>
                  {problemasSelecionados.length > 0
                    ? `${problemasSelecionados.length} marcado${problemasSelecionados.length > 1 ? 's' : ''}`
                    : 'nenhum marcado'}
                </span>
              </div>
              {isVistoriaTecnica && (
                <p className="text-[11px] text-slate-600 dark:text-slate-300 -mt-1 mb-2">
                  Marque só se já souber de algo específico — a vistoria em campo é o que vai levantar as pendências.
                </p>
              )}
              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {PROBLEMAS_CTO_GRUPOS.map((grupo) => (
                  <div key={grupo.grupo}>
                    <p className="text-[10px] font-black uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-1">
                      {grupo.grupo}
                    </p>
                    <div className="space-y-2">
                      {grupo.itens.map((item, i) => (
                        <label
                          key={i}
                          htmlFor={`problema-${grupo.grupo}-${i}`}
                          className="flex items-start gap-2.5 cursor-pointer select-none"
                        >
                          <input
                            id={`problema-${grupo.grupo}-${i}`}
                            type="checkbox"
                            checked={problemasSelecionados.includes(item)}
                            onChange={() => toggleProblema(item)}
                            className="mt-0.5 h-4 w-4 text-amber-500 border-slate-300 rounded focus:ring-amber-500"
                          />
                          <span className="text-sm text-slate-700 dark:text-slate-200 leading-tight">
                            {item}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-2 block">
                Obs <span className="font-normal normal-case text-slate-500 dark:text-slate-400">(opcional)</span>
              </label>
              <textarea
                value={form.observacoes}
                onChange={(e) => setForm((prev) => ({ ...prev, observacoes: e.target.value }))}
                rows={3}
                placeholder="Detalhes adicionais que não estão nas opções acima..."
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-2 block">
                Fotos do problema <span className="font-normal normal-case text-slate-500 dark:text-slate-400">(opcional, categoria "Antes")</span>
              </label>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 mb-2">
                Ficam salvas na aba Fotos e o técnico de manutenção já vê como estava antes de ir a campo.
              </p>

              {fotosIniciais.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3">
                  {fotosIniciais.map((f) => (
                    <div key={f.id} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                      <img src={f.dataUrl} alt="Antes" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => handleRemoverFotoInicial(f.id)}
                        className="absolute top-1 right-1 w-6 h-6 rounded-lg bg-black/60 text-white flex items-center justify-center"
                        aria-label="Remover foto"
                      >
                        <X className="icon-sm" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => fotoInputRef.current?.click()}
                  disabled={processandoFoto}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-bold transition-colors disabled:opacity-60"
                >
                  {processandoFoto ? <Loader2 className="icon-md animate-spin" /> : <ImageIcon className="icon-md" />}
                  Galeria
                </button>
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={processandoFoto}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-bold transition-colors disabled:opacity-60"
                >
                  {processandoFoto ? <Loader2 className="icon-md animate-spin" /> : <Camera className="icon-md" />}
                  Câmera
                </button>
              </div>
              {/* Sem `capture`, deixa o navegador oferecer a galeria (antes o
                  único input tinha `capture="environment"` junto com
                  `multiple`, e na prática o celular ignorava a galeria e
                  forçava a câmera sempre). */}
              <input
                ref={fotoInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleAdicionarFotos(e.target.files)}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handleAdicionarFotos(e.target.files)}
              />
            </div>
          </div>
        )}

        {/* ── Passo 2: Coleta de informações ── */}
        {step === 'informacoes' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  Setor
                </label>
                <p className="px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                  {form.setor || 'Nenhum setor cadastrado no seu perfil'}
                </p>
              </div>
              <Field
                label="Responsável pela abertura"
                auto={!!profile?.nome}
                value={form.responsavel}
                onChange={updateField('responsavel')}
              />
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-300">
              Setor e solicitante vêm automaticamente do seu perfil — não precisa informar de novo.
            </p>

            <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 rounded-xl px-3 py-2.5 text-[11px] text-blue-700 dark:text-blue-300">
              <Sparkles size={13} className="shrink-0 mt-0.5" />
              <span>
                Equipe e técnico não são definidos aqui — o supervisor da área recebe esta OS
                na fila de atribuição e delega para quem for a campo.
              </span>
            </div>

            <div className="h-px bg-slate-100 dark:bg-slate-800" />

            <div className="grid grid-cols-3 gap-3">
              {/* Seletor, não texto livre: o `className="uppercase"` de antes
                  era só CSS — o valor gravado podia sair "sp" e o filtro por
                  estado passaria a listar "SP" e "sp" como opções separadas. */}
              <div className="min-w-0">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  UF
                  {autoCollect.status === 'success' && !!form.uf && (
                    <span
                      title="Preenchido automaticamente pela localização"
                      className="inline-flex items-center gap-0.5 text-[9px] font-black normal-case tracking-normal text-blue-500 dark:text-blue-400"
                    >
                      <Sparkles size={10} /> auto
                    </span>
                  )}
                </label>
                <select
                  value={form.uf}
                  onChange={(e) => updateField('uf')(e as unknown as React.ChangeEvent<HTMLInputElement>)}
                  className="w-full min-w-0 px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">—</option>
                  {UFS.map((sigla) => <option key={sigla} value={sigla}>{sigla}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <Field
                  label="Município"
                  auto={autoCollect.status === 'success' && !!form.municipio}
                  value={form.municipio}
                  onChange={updateField('municipio')}
                />
              </div>
            </div>
            <Field
              label="Bairro"
              auto={autoCollect.status === 'success' && !!form.bairro}
              value={form.bairro}
              onChange={updateField('bairro')}
            />
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Field
                  label="Endereço"
                  auto={autoCollect.status === 'success' && !!form.endereco}
                  value={form.endereco}
                  onChange={updateField('endereco')}
                />
              </div>
              <div>
                <Field
                  label="Número"
                  auto={autoCollect.status === 'success' && !!form.numeroEndereco}
                  value={form.numeroEndereco}
                  onChange={updateField('numeroEndereco')}
                />
                {autoCollect.numeroAproximado && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold mt-1 leading-tight">
                    Número do imóvel mais próximo — confira no local.
                  </p>
                )}
              </div>
            </div>
            <Field
              label="Ponto de referência"
              auto={autoCollect.status === 'success' && !!form.referencia}
              value={form.referencia}
              onChange={updateField('referencia')}
              placeholder={isAutoBusy ? 'Buscando automaticamente...' : undefined}
            />

            <div className="h-px bg-slate-100 dark:bg-slate-800" />

            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Data prevista"
                auto
                type="date"
                value={form.dataPrevista}
                onChange={updateField('dataPrevista')}
              />
              <Field
                label="Horário previsto"
                auto
                type="time"
                value={form.horarioPrevisto}
                onChange={updateField('horarioPrevisto')}
              />
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 -mt-1">
              Sugerido automaticamente para 48h após a abertura — ajuste se necessário.
            </p>
          </div>
        )}

        {/* ── Passo 3: Confirmação da localização ── */}
        {step === 'localizacao' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 text-center">
            {showMapPicker ? (
              <LocationMapPicker
                initialLat={autoCollect.latitude}
                initialLng={autoCollect.longitude}
                onConfirm={handleManualPick}
                onCancel={() => setShowMapPicker(false)}
              />
            ) : (
              <>
                {isAutoBusy && (
                  <div className="py-8 space-y-3">
                    <Loader2 className="icon-xl animate-spin mx-auto text-amber-500" />
                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                      {autoCollect.status === 'locating' ? 'Obtendo sua localização atual...' : 'Identificando o endereço...'}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300">Seu navegador pode pedir permissão de acesso à localização.</p>
                  </div>
                )}

                {(autoCollect.status === 'success' || autoCollect.status === 'partial') && (
                  <div className="py-4 space-y-4">
                    <div className="w-14 h-14 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mx-auto">
                      <MapPin className="icon-lg text-[#1A1AFF] dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Localização capturada!</p>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">Será salva junto com a Ordem de Serviço</p>
                    </div>

                    <div className="inline-flex flex-col items-start gap-1 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 rounded-xl px-4 py-3 text-left">
                      <span className="text-[9px] uppercase font-black tracking-wide text-blue-500 dark:text-blue-400/80">
                        Coordenadas
                      </span>
                      <span className="text-sm font-mono font-bold text-[#1A1AFF] dark:text-blue-400">
                        {autoCollect.latitude?.toFixed(6)}, {autoCollect.longitude?.toFixed(6)}
                      </span>
                      {autoCollect.accuracy != null && (
                        <span className="text-[10px] text-blue-400 dark:text-blue-400/70">
                          Precisão: ~{Math.round(autoCollect.accuracy)}m
                        </span>
                      )}
                    </div>

                    {autoCollect.status === 'success' && (form.endereco || form.municipio) && (
                      <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl px-4 py-3 text-left text-xs text-slate-600 dark:text-slate-300">
                        <span className="text-[9px] uppercase font-black tracking-wide text-slate-600 dark:text-slate-300 block mb-1">
                          Endereço identificado
                        </span>
                        {form.endereco && <>{form.endereco}{form.numeroEndereco && `, ${form.numeroEndereco}`}<br /></>}
                        {form.bairro && <>{form.bairro} — </>}
                        {form.municipio}{form.uf && `/${form.uf}`}
                      </div>
                    )}

                    {autoCollect.status === 'partial' && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 max-w-xs mx-auto">{autoCollect.errorMessage}</p>
                    )}

                    <div className="flex items-center justify-center gap-4">
                      <button
                        type="button"
                        onClick={runAutoCollect}
                        className="text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100 flex items-center gap-1"
                      >
                        <RefreshCw className="icon-sm" /> Capturar novamente
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowMapPicker(true)}
                        className="text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100 flex items-center gap-1"
                      >
                        <MapPin className="icon-sm" /> Ajustar no mapa
                      </button>
                    </div>
                  </div>
                )}

                {autoCollect.status === 'error' && (
                  <div className="py-6 space-y-3">
                    <div className="w-14 h-14 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center mx-auto">
                      <AlertTriangle className="icon-lg text-red-500" />
                    </div>
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Não foi possível obter a localização</p>
                    <p className="text-xs text-slate-600 dark:text-slate-300 max-w-xs mx-auto">{autoCollect.errorMessage}</p>
                    <div className="flex items-center justify-center gap-4">
                      <button
                        type="button"
                        onClick={runAutoCollect}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400 hover:text-amber-700"
                      >
                        <RefreshCw className="icon-sm" /> Tentar novamente
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowMapPicker(true)}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700"
                      >
                        <MapPin className="icon-sm" /> Selecionar no mapa
                      </button>
                    </div>
                  </div>
                )}

                {autoCollect.status === 'idle' && (
                  <div className="py-8">
                    <button
                      type="button"
                      onClick={runAutoCollect}
                      className="inline-flex items-center gap-2 text-sm font-bold text-amber-600 dark:text-amber-400"
                    >
                      <Navigation className="icon-md" /> Capturar localização atual
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Navegação inferior ── */}
        {/* Aviso perto do próprio botão desabilitado — o selo "nenhum marcado"
            lá em cima do checklist fica fora de vista em formulários longos,
            então quem rola direto até o fim não entendia por que travou. */}
        {step === 'motivo' && !canContinueStep1 && (
          <p className="text-xs font-semibold text-red-500 text-right -mb-1">
            Marque ao menos um problema para continuar.
          </p>
        )}
        {step === 'localizacao' && !hasLocationInfo && !isAutoBusy && (
          <p className="text-xs font-semibold text-red-500 text-right -mb-1">
            Capture a localização ou preencha município e endereço para criar a OS.
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="text-sm font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 px-4 py-2.5"
          >
            {stepIndex === 0 ? 'Cancelar' : 'Voltar'}
          </button>

          {step !== 'localizacao' ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={step === 'motivo' ? !canContinueStep1 : !canContinueStep2}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold px-5 py-2.5 rounded-xl shadow-sm transition-colors disabled:opacity-40"
            >
              Continuar <ArrowRight className="icon-md" />
            </button>
          ) : (
            // Um único botão — antes havia dois lado a lado ("Continuar sem
            // localização" e "Criar Ordem de Serviço") chamando exatamente a
            // mesma função. Agora exige coordenada (UTM) OU endereço mínimo
            // (município + endereço) antes de deixar criar — sem isso a OS
            // nascia sem jeito nenhum de localizar o serviço depois.
            <button
              type="button"
              onClick={handleCriarOrdem}
              disabled={creating || !hasLocationInfo}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold px-5 py-2.5 rounded-xl shadow-sm transition-colors disabled:opacity-40"
            >
              {creating ? <Loader2 className="icon-md animate-spin" /> : <Check className="icon-md" />}
              Criar Ordem de Serviço
            </button>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={showCancelConfirm}
        title="Descartar esta OS?"
        description="Os problemas marcados e as fotos já tiradas ainda não foram salvos — sair agora descarta tudo."
        confirmLabel="Descartar"
        variant="danger"
        onConfirm={() => { setShowCancelConfirm(false); navigate('/manutencao'); }}
        onCancel={() => setShowCancelConfirm(false)}
      />
    </div>
  );
}