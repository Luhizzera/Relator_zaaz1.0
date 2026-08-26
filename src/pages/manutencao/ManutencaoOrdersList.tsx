import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Plus, MapPin, ChevronDown, Loader2, UserPlus, MoreVertical,
  Pencil, Copy, FileDown, Ban, Paperclip, X, Sheet, ArrowRight, BellRing,
  AlertTriangle, ThumbsUp, CheckSquare, Square,
} from 'lucide-react';
import {
  listManutencaoOrders, assignTecnico, duplicarOrdemManutencao, cancelarOrdem,
} from '@/lib/manutencaoService';
import { exportManutencaoPdf } from '@/lib/manutencaoPdfEngine';
import { exportToXlsx } from '@/lib/xlsxExport';
import { ManutencaoOrdem, StatusOS, PrioridadeOS, STATUS_LABEL, PRIORIDADE_LABEL, tempoEmAtendimento } from '@/types/manutencao';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh';
import { PageHeader } from '@/components/PageHeader';
import { DelegarTecnicoModal } from '@/components/DelegarTecnicoModal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const STATUS_COLOR: Record<StatusOS, string> = {
  aberta: 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  atribuida: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  recebida: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  deslocamento: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  no_local: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  em_execucao: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  pausada: 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  finalizada: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  aprovada: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  reaberta: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  cancelada: 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  concluida: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
};

const PRIORIDADE_COLOR: Record<string, string> = {
  baixa: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  media: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  alta: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
  critica: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
};

function distinctSorted(values: (string | undefined)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v && v.trim() !== ''))).sort((a, b) => a.localeCompare(b));
}

/** Prazo (data_prevista) já passou e a OS ainda não foi encerrada — mesmo critério usado no card "Vencidas" do dashboard. */
function estaVencida(o: ManutencaoOrdem): boolean {
  if (!o.dataPrevista) return false;
  const hojeStr = new Date().toISOString().slice(0, 10);
  return o.dataPrevista < hojeStr && !['concluida', 'aprovada', 'finalizada', 'cancelada'].includes(o.status);
}

// Recortes compostos (mais de um status) usados pelos cards clicáveis do
// dashboard (ver ManutencaoDashboard.tsx) — não dá pra expressar com o filtro
// de status único de sempre, por isso viram um parâmetro à parte na URL.
type Grupo = 'abertas' | 'andamento' | 'concluidas' | 'prioridade_alta' | null;
const GRUPOS_STATUS: Record<Exclude<Grupo, 'prioridade_alta' | null>, StatusOS[]> = {
  abertas: ['aberta', 'atribuida', 'reaberta'],
  andamento: ['recebida', 'deslocamento', 'no_local', 'em_execucao', 'pausada'],
  concluidas: ['concluida', 'aprovada', 'finalizada'],
};
const GRUPO_LABEL: Record<Exclude<Grupo, null>, string> = {
  abertas: 'OS Abertas',
  andamento: 'Em andamento',
  concluidas: 'Concluídas',
  prioridade_alta: 'Prioridade alta/crítica',
};

interface Filtros {
  numero: string;
  referenciaExterna: string;
  cidade: string;
  bairro: string;
  tecnico: string;
  equipe: string;
  status: StatusOS | 'todas';
  prioridade: PrioridadeOS | 'todas';
  tipo: string;
  dataInicial: string;
  dataFinal: string;
  /** Vindos de um deep-link do dashboard — ver leitura de query params abaixo. */
  grupo: Grupo;
  vencidas: boolean;
}

const FILTROS_VAZIOS: Filtros = {
  numero: '', referenciaExterna: '', cidade: '', bairro: '', tecnico: '', equipe: '',
  status: 'todas', prioridade: 'todas', tipo: '', dataInicial: '', dataFinal: '',
  grupo: null, vencidas: false,
};

/** Lê os filtros iniciais da URL (?status=, ?prioridade=, ?grupo=, ?vencidas=1) — usado só uma vez, ao montar. */
function filtrosIniciais(): Filtros {
  const params = new URLSearchParams(window.location.search);
  const status = params.get('status');
  const prioridade = params.get('prioridade');
  const grupo = params.get('grupo');
  return {
    ...FILTROS_VAZIOS,
    status: status && status in STATUS_LABEL ? (status as StatusOS) : 'todas',
    prioridade: prioridade && prioridade in PRIORIDADE_LABEL ? (prioridade as PrioridadeOS) : 'todas',
    grupo: grupo && ['abertas', 'andamento', 'concluidas', 'prioridade_alta'].includes(grupo) ? (grupo as Grupo) : null,
    vencidas: params.get('vencidas') === '1',
  };
}

export default function ManutencaoOrdersList() {
  const navigate = useNavigate();
  const { canManageOrders, isTecnicoManutencao, profile } = useAuth();
  const [orders, setOrders] = useState<ManutencaoOrdem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState<Filtros>(filtrosIniciais);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  // Array (não um único item) — usado tanto pra delegação individual (um
  // item só) quanto em massa (fila de atribuição inteira ou uma seleção).
  const [ordensParaDelegar, setOrdensParaDelegar] = useState<ManutencaoOrdem[]>([]);
  const [delegando, setDelegando] = useState(false);
  const [ordemParaCancelar, setOrdemParaCancelar] = useState<ManutencaoOrdem | null>(null);
  const [motivoCancelamento, setMotivoCancelamento] = useState('');
  const [processando, setProcessando] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const [selecaoDelegar, setSelecaoDelegar] = useState<Set<string>>(new Set());

  const carregar = useCallback((silencioso = false) => {
    if (!silencioso) setLoading(true);
    listManutencaoOrders()
      .then(setOrders)
      .catch((err) => console.error('[Manutencao] Erro ao listar OS:', err))
      .finally(() => { if (!silencioso) setLoading(false); });
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  useRealtimeRefresh([{ table: 'ordens_manutencao' }], () => carregar(true));

  // A RLS deixa quem ABRIU a OS (responsavel_id) enxergá-la pra sempre, mesmo
  // depois de delegada — correto pra ele poder consultar o que reportou, mas
  // errado pra tratar como fila de trabalho dele. Só o Técnico de Manutenção
  // tem fila de execução (tecnico_id); o Técnico LA só acompanha o que ele
  // mesmo abriu. Sem esse recorte, uma OS delegada a outro técnico continuava
  // aparecendo — e sendo notificada como "nova" — pro Técnico LA que a abriu.
  const ordersEscopo = useMemo(() => {
    if (canManageOrders || !profile) return orders;
    if (isTecnicoManutencao) return orders.filter((o) => o.tecnicoId === profile.id);
    return orders.filter((o) => o.responsavelId === profile.id);
  }, [orders, canManageOrders, isTecnicoManutencao, profile]);

  const filaAtribuicao = useMemo(
    () => (canManageOrders ? ordersEscopo.filter((o) => o.status === 'aberta') : []),
    [ordersEscopo, canManageOrders],
  );

  // OS finalizadas pelo técnico — não bloqueia nada, é só uma notificação
  // pro supervisor saber o que foi concluído e reabrir se precisar.
  const filaFinalizadas = useMemo(
    () => (canManageOrders ? ordersEscopo.filter((o) => o.status === 'finalizada') : []),
    [ordersEscopo, canManageOrders],
  );

  // OS delegadas (ou devolvidas) a este técnico que ele ainda não "recebeu" —
  // o alerta de "notificação não lida" do lado do técnico, espelhando a fila
  // de atribuição que o gestor/supervisor vê acima. Só existe pra quem
  // executa (Técnico de Manutenção) — o LA nunca recebe uma delegação.
  const filaNovasParaTecnico = useMemo(
    () => (isTecnicoManutencao ? ordersEscopo.filter((o) => o.status === 'atribuida' || o.status === 'reaberta') : []),
    [ordersEscopo, isTecnicoManutencao],
  );

  const opcoes = useMemo(() => ({
    cidades: distinctSorted(ordersEscopo.map((o) => o.municipio)),
    bairros: distinctSorted(ordersEscopo.map((o) => o.bairro)),
    tecnicos: distinctSorted(ordersEscopo.map((o) => o.tecnico)),
    equipes: distinctSorted(ordersEscopo.map((o) => o.equipe)),
    tipos: distinctSorted(ordersEscopo.map((o) => o.tipo)),
  }), [ordersEscopo]);

  const filtered = useMemo(() => {
    return ordersEscopo.filter((o) => {
      if (filtros.numero.trim() && !o.numero.toLowerCase().includes(filtros.numero.trim().toLowerCase())) return false;
      if (filtros.referenciaExterna.trim() && !(o.referenciaExterna ?? '').toLowerCase().includes(filtros.referenciaExterna.trim().toLowerCase())) return false;
      if (filtros.cidade && o.municipio !== filtros.cidade) return false;
      if (filtros.bairro && o.bairro !== filtros.bairro) return false;
      if (filtros.tecnico && o.tecnico !== filtros.tecnico) return false;
      if (filtros.equipe && o.equipe !== filtros.equipe) return false;
      if (filtros.status !== 'todas' && o.status !== filtros.status) return false;
      if (filtros.prioridade !== 'todas' && o.prioridade !== filtros.prioridade) return false;
      if (filtros.tipo && o.tipo !== filtros.tipo) return false;
      if (filtros.dataInicial && o.createdAt < filtros.dataInicial) return false;
      if (filtros.dataFinal && o.createdAt > `${filtros.dataFinal}T23:59:59`) return false;
      if (filtros.grupo === 'prioridade_alta') {
        if (o.prioridade !== 'alta' && o.prioridade !== 'critica') return false;
      } else if (filtros.grupo && !GRUPOS_STATUS[filtros.grupo].includes(o.status)) {
        return false;
      }
      if (filtros.vencidas && !estaVencida(o)) return false;
      return true;
    });
  }, [ordersEscopo, filtros]);

  const filtrosAtivos = Object.entries(filtros).some(([k, v]) => v !== (FILTROS_VAZIOS as any)[k]);

  const handleNovaOS = () => {
    navigate('/manutencao/nova');
  };

  const handleExportarExcel = async () => {
    setExportando(true);
    try {
      await exportToXlsx(
        'ordens-manutencao',
        'Ordens de Manutenção',
        [
          { header: 'Número', key: 'numero', width: 16 },
          { header: 'Status', key: 'status', width: 20 },
          { header: 'Prioridade', key: 'prioridade', width: 12 },
          { header: 'Solicitante', key: 'solicitante', width: 22 },
          { header: 'Cidade', key: 'cidade', width: 18 },
          { header: 'Bairro', key: 'bairro', width: 18 },
          { header: 'Endereço', key: 'endereco', width: 30 },
          { header: 'UTM', key: 'utm', width: 24 },
          { header: 'Equipe', key: 'equipe', width: 16 },
          { header: 'Técnico', key: 'tecnico', width: 20 },
          { header: 'Prazo', key: 'prazo', width: 14, type: 'date' },
          { header: 'Abertura', key: 'abertura', width: 14, type: 'date' },
          { header: 'Tempo em atendimento', key: 'tempo', width: 18 },
        ],
        filtered.map((o) => ({
          numero: o.numero,
          status: STATUS_LABEL[o.status],
          prioridade: PRIORIDADE_LABEL[o.prioridade],
          solicitante: o.solicitante,
          cidade: o.municipio ?? '',
          bairro: o.bairro ?? '',
          endereco: `${o.endereco ?? ''}${o.numeroEndereco ? `, ${o.numeroEndereco}` : ''}`,
          utm: o.latitude != null && o.longitude != null ? `${o.latitude.toFixed(6)}, ${o.longitude.toFixed(6)}` : '',
          equipe: o.equipe ?? '',
          tecnico: o.tecnico ?? '',
          prazo: o.dataPrevista ? new Date(o.dataPrevista) : null,
          abertura: new Date(o.createdAt),
          tempo: tempoEmAtendimento(o),
        })),
      );
    } catch (err) {
      console.error('[Manutencao] Erro ao exportar Excel:', err);
      toast({ title: 'Não foi possível exportar', variant: 'destructive' });
    } finally {
      setExportando(false);
    }
  };

  // Só o Técnico de Manutenção abre a tela de execução mobile (linear,
  // botões grandes) — é quem de fato executa. Gestor/supervisor E Técnico LA
  // (que só acompanha o que abriu, sem ação de execução) abrem a tela de
  // detalhe com abas (desktop).
  const handleAbrirOrdem = (ordemId: string, aba?: string) => {
    const base = isTecnicoManutencao ? `/manutencao/ordens/${ordemId}/execucao` : `/manutencao/ordens/${ordemId}`;
    navigate(aba && !isTecnicoManutencao ? `${base}?aba=${aba}` : base);
  };

  const handleConfirmarDelegacao = async (tecnicoId: string, tecnicoNome: string, referenciaExterna?: string) => {
    if (ordensParaDelegar.length === 0) return;
    setDelegando(true);
    try {
      // Promise.allSettled — se uma OS falhar (ex: já foi delegada por outra
      // aba entre o clique e a confirmação), as demais ainda são delegadas
      // em vez de travar o lote inteiro por causa de uma só.
      const resultados = await Promise.allSettled(
        ordensParaDelegar.map((o) => assignTecnico(o.id, tecnicoId, tecnicoNome, referenciaExterna)),
      );
      const falhas = resultados.filter((r) => r.status === 'rejected').length;
      const sucesso = resultados.length - falhas;
      if (sucesso > 0) {
        toast({
          title: sucesso > 1 ? `${sucesso} OS delegadas` : 'OS delegada',
          description: falhas > 0 ? `${falhas} não puderam ser delegadas.` : undefined,
        });
      }
      if (falhas > 0 && sucesso === 0) {
        toast({ title: 'Não foi possível delegar', variant: 'destructive' });
      }
      setOrdensParaDelegar([]);
      setSelecaoDelegar(new Set());
      carregar();
    } finally {
      setDelegando(false);
    }
  };

  const toggleSelecaoDelegar = (id: string) => {
    setSelecaoDelegar((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleDuplicar = async (ordem: ManutencaoOrdem) => {
    setProcessando(ordem.id);
    try {
      const nova = await duplicarOrdemManutencao(ordem.id);
      toast({ title: 'OS duplicada', description: `Criada ${nova.numero}` });
      carregar();
    } catch (err) {
      console.error('[Manutencao] Erro ao duplicar OS:', err);
      toast({ title: 'Não foi possível duplicar', variant: 'destructive' });
    } finally {
      setProcessando(null);
    }
  };

  const handleAbrirLocalizacao = (ordem: ManutencaoOrdem) => {
    if (ordem.latitude == null || ordem.longitude == null) {
      toast({ title: 'Sem coordenadas registradas para esta OS', variant: 'destructive' });
      return;
    }
    window.open(`https://www.google.com/maps?q=${ordem.latitude},${ordem.longitude}`, '_blank', 'noopener');
  };

  const handleExportarPdf = async (ordem: ManutencaoOrdem) => {
    setProcessando(ordem.id);
    try {
      await exportManutencaoPdf(ordem);
    } catch (err) {
      console.error('[Manutencao] Erro ao exportar PDF:', err);
      toast({ title: 'Não foi possível gerar o PDF', variant: 'destructive' });
    } finally {
      setProcessando(null);
    }
  };

  const handleConfirmarCancelamento = async () => {
    if (!ordemParaCancelar || !motivoCancelamento.trim()) return;
    setProcessando(ordemParaCancelar.id);
    try {
      await cancelarOrdem(ordemParaCancelar.id, motivoCancelamento);
      toast({ title: 'OS cancelada' });
      setOrdemParaCancelar(null);
      setMotivoCancelamento('');
      carregar();
    } catch (err) {
      console.error('[Manutencao] Erro ao cancelar OS:', err);
      toast({ title: 'Não foi possível cancelar', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setProcessando(null);
    }
  };

  const setFiltro = <K extends keyof Filtros>(key: K, value: Filtros[K]) => setFiltros((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-6 space-y-5">
      <PageHeader
        title={canManageOrders ? 'Ordens de Manutenção' : 'Minhas Ordens de Manutenção'}
        backTo="/manutencao"
        rightContent={
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportarExcel}
              disabled={exportando}
              className="flex items-center gap-2 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-bold px-3.5 py-2.5 rounded-xl transition-colors disabled:opacity-60"
            >
              {exportando ? <Loader2 className="icon-md animate-spin" /> : <Sheet className="icon-md" />} Excel
            </button>
            <button
              onClick={handleNovaOS}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold px-4 py-2.5 rounded-xl shadow-sm transition-colors"
            >
              <Plus className="icon-md" /> Nova OS
            </button>
          </div>
        }
      />

      {/* Fila de atribuição — só supervisor/gestor vê isso. Seleção múltipla
          permite delegar várias OS pro mesmo técnico numa única confirmação. */}
      {canManageOrders && filaAtribuicao.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-sm font-black text-amber-800 dark:text-amber-400 flex items-center gap-2">
              <UserPlus className="icon-md" /> Aguardando atribuição de técnico
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-200 text-amber-800 dark:bg-amber-800/40 dark:text-amber-300">
                {filaAtribuicao.length}
              </span>
              {selecaoDelegar.size > 0 && (
                <button
                  onClick={() => setOrdensParaDelegar(filaAtribuicao.filter((o) => selecaoDelegar.has(o.id)))}
                  className="flex items-center gap-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <UserPlus className="icon-sm" /> Delegar {selecaoDelegar.size} selecionada{selecaoDelegar.size > 1 ? 's' : ''}
                </button>
              )}
            </div>
          </div>
          <div className="space-y-2">
            {filaAtribuicao.map((o) => (
              <div
                key={o.id}
                className="flex items-center gap-3 bg-white dark:bg-slate-900 rounded-xl border border-amber-100 dark:border-amber-900/30 p-3"
              >
                <button
                  onClick={() => toggleSelecaoDelegar(o.id)}
                  aria-label={selecaoDelegar.has(o.id) ? 'Desmarcar' : 'Selecionar'}
                  className="shrink-0 text-amber-500"
                >
                  {selecaoDelegar.has(o.id) ? <CheckSquare className="icon-md" /> : <Square className="icon-md" />}
                </button>
                <button
                  onClick={() => handleAbrirOrdem(o.id)}
                  className="flex-1 min-w-0 text-left"
                >
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                    {o.numero} — {o.solicitante || 'Sem solicitante'}
                  </p>
                  <p className="text-[11px] text-slate-400 flex items-center gap-1 truncate">
                    <MapPin size={10} /> {o.municipio || '—'} • {PRIORIDADE_LABEL[o.prioridade]}
                  </p>
                </button>
                <button
                  onClick={() => setOrdensParaDelegar([o])}
                  className="flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-900/50 px-3 py-2 rounded-lg transition-colors shrink-0"
                >
                  <UserPlus className="icon-sm" /> Delegar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* OS finalizadas — não bloqueia nada nem exige ação do supervisor;
          é só uma notificação do que já foi concluído, pra ele saber onde
          reabrir caso perceba que algum serviço precisa de retrabalho. */}
      {canManageOrders && filaFinalizadas.length > 0 && (
        <div className="bg-purple-50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-800/50 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-sm font-black text-purple-800 dark:text-purple-400 flex items-center gap-2">
              <ThumbsUp className="icon-md" /> Finalizadas — revise se precisar de retrabalho
            </h2>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-purple-200 text-purple-800 dark:bg-purple-800/40 dark:text-purple-300">
              {filaFinalizadas.length}
            </span>
          </div>
          <div className="space-y-2">
            {filaFinalizadas.map((o) => (
              <div
                key={o.id}
                className="flex items-center gap-3 bg-white dark:bg-slate-900 rounded-xl border border-purple-100 dark:border-purple-900/30 p-3"
              >
                <button
                  onClick={() => handleAbrirOrdem(o.id, 'aprovacao')}
                  className="flex-1 min-w-0 text-left"
                >
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                    {o.numero} — {o.solicitante || 'Sem solicitante'}
                  </p>
                  <p className="text-[11px] text-slate-400 flex items-center gap-1 truncate">
                    <MapPin size={10} /> {o.municipio || '—'} • {o.tecnico || 'Sem técnico'}
                  </p>
                </button>
                <button
                  onClick={() => handleAbrirOrdem(o.id, 'aprovacao')}
                  className="flex items-center gap-1.5 text-xs font-bold text-purple-700 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30 hover:bg-purple-200 dark:hover:bg-purple-900/50 px-3 py-2 rounded-lg transition-colors shrink-0"
                >
                  Ver <ArrowRight className="icon-sm" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Novas OS delegadas/devolvidas ao técnico — alerta estilo "não lida" */}
      {isTecnicoManutencao && filaNovasParaTecnico.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/50 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-red-700 dark:text-red-400 flex items-center gap-2">
              <BellRing className="icon-md" /> Novas OS para você
            </h2>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-500 text-white animate-pulse">
              {filaNovasParaTecnico.length}
            </span>
          </div>
          <div className="space-y-2">
            {filaNovasParaTecnico.map((o) => (
              <div
                key={o.id}
                className="flex items-center gap-3 bg-white dark:bg-slate-900 rounded-xl border border-red-100 dark:border-red-900/30 p-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                    {o.numero} — {o.solicitante || 'Sem solicitante'}
                  </p>
                  <p className="text-[11px] text-slate-400 flex items-center gap-1 truncate">
                    <MapPin size={10} /> {o.municipio || '—'} • {PRIORIDADE_LABEL[o.prioridade]}
                  </p>
                </div>
                {/* Botão explícito — abrir a OS não depende de clicar em cima da linha. */}
                <button
                  onClick={() => handleAbrirOrdem(o.id)}
                  className="flex items-center gap-1.5 text-xs font-bold text-white bg-red-500 hover:bg-red-600 px-3 py-2 rounded-lg transition-colors shrink-0"
                >
                  Ver <ArrowRight className="icon-sm" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Busca rápida + toggle de filtros avançados */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="icon-sm absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={filtros.numero}
            onChange={(e) => setFiltro('numero', e.target.value)}
            placeholder="Buscar por número da OS..."
            className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <button
          onClick={() => setMostrarFiltros((v) => !v)}
          className={cn(
            'flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-bold border transition-colors',
            filtrosAtivos
              ? 'border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300',
          )}
        >
          Filtros {filtrosAtivos && `(${Object.entries(filtros).filter(([k, v]) => v !== (FILTROS_VAZIOS as any)[k]).length})`}
          <ChevronDown className={cn('icon-sm transition-transform', mostrarFiltros && 'rotate-180')} />
        </button>
        <button
          onClick={() => setFiltro('vencidas', !filtros.vencidas)}
          title="Mostrar só OS com prazo vencido"
          className={cn(
            'flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-sm font-bold border transition-colors',
            filtros.vencidas
              ? 'border-red-400 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300',
          )}
        >
          <AlertTriangle className="icon-sm" /> Vencidas
        </button>
        {filtrosAtivos && (
          <button
            onClick={() => setFiltros(FILTROS_VAZIOS)}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <X className="icon-sm" /> Limpar
          </button>
        )}
      </div>

      {/* Recorte vindo de um clique nos cards do dashboard — sem isso, o
          gestor chegava numa lista pré-filtrada sem entender por quê. */}
      {filtros.grupo && (
        <div className="flex items-center gap-2 text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-xl px-3 py-2 w-fit">
          Filtro do dashboard: {GRUPO_LABEL[filtros.grupo]}
          <button onClick={() => setFiltro('grupo', null)} aria-label="Remover filtro" className="hover:text-amber-900 dark:hover:text-amber-200">
            <X className="icon-sm" />
          </button>
        </div>
      )}

      {mostrarFiltros && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <select value={filtros.cidade} onChange={(e) => setFiltro('cidade', e.target.value)} className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <option value="">Cidade (todas)</option>
            {opcoes.cidades.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filtros.bairro} onChange={(e) => setFiltro('bairro', e.target.value)} className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <option value="">Bairro (todos)</option>
            {opcoes.bairros.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          {canManageOrders && (
            <select value={filtros.tecnico} onChange={(e) => setFiltro('tecnico', e.target.value)} className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <option value="">Técnico (todos)</option>
              {opcoes.tecnicos.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          <select value={filtros.equipe} onChange={(e) => setFiltro('equipe', e.target.value)} className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <option value="">Equipe (todas)</option>
            {opcoes.equipes.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
          <select value={filtros.status} onChange={(e) => setFiltro('status', e.target.value as StatusOS | 'todas')} className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <option value="todas">Status (todos)</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={filtros.prioridade} onChange={(e) => setFiltro('prioridade', e.target.value as PrioridadeOS | 'todas')} className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <option value="todas">Prioridade (todas)</option>
            {Object.entries(PRIORIDADE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={filtros.tipo} onChange={(e) => setFiltro('tipo', e.target.value)} className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <option value="">Tipo de serviço (todos)</option>
            {opcoes.tipos.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input
            value={filtros.referenciaExterna}
            onChange={(e) => setFiltro('referenciaExterna', e.target.value)}
            placeholder="OS Aniel"
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
          />
          <div className="flex gap-2 col-span-2 md:col-span-1">
            <input type="date" value={filtros.dataInicial} onChange={(e) => setFiltro('dataInicial', e.target.value)} className="w-full px-2 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800" title="Data inicial" />
            <input type="date" value={filtros.dataFinal} onChange={(e) => setFiltro('dataFinal', e.target.value)} className="w-full px-2 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800" title="Data final" />
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="icon-md animate-spin mr-2" /> Carregando...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-sm text-slate-400">
          {ordersEscopo.length === 0
            ? (canManageOrders ? 'Nenhuma ordem de manutenção encontrada.' : 'Nenhuma OS aberta ou delegada a você ainda.')
            : 'Nenhuma OS corresponde aos filtros aplicados.'}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="text-left text-[10px] uppercase font-black text-slate-400 border-b border-slate-100 dark:border-slate-800">
                <th className="px-4 py-3">Número</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Prioridade</th>
                <th className="px-4 py-3">Solicitante</th>
                <th className="px-4 py-3">Cidade</th>
                <th className="px-4 py-3">Endereço</th>
                {canManageOrders && <th className="px-4 py-3">Equipe</th>}
                {canManageOrders && <th className="px-4 py-3">Técnico</th>}
                <th className="px-4 py-3">Prazo</th>
                <th className="px-4 py-3">Abertura</th>
                <th className="px-4 py-3">Tempo</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr
                  key={o.id}
                  className={cn(
                    'border-b last:border-0 border-slate-50 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors',
                    estaVencida(o) && 'bg-red-50/60 dark:bg-red-900/10 hover:bg-red-50 dark:hover:bg-red-900/20',
                  )}
                  onClick={() => handleAbrirOrdem(o.id)}
                >
                  <td className="px-4 py-3 font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">{o.numero}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={cn('text-[10px] font-black px-2 py-0.5 rounded-full whitespace-nowrap', STATUS_COLOR[o.status])}>
                        {STATUS_LABEL[o.status]}
                      </span>
                      {isTecnicoManutencao && (o.status === 'atribuida' || o.status === 'reaberta') && (
                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full whitespace-nowrap bg-red-500 text-white animate-pulse">
                          Nova
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('text-[10px] font-black px-2 py-0.5 rounded-full whitespace-nowrap', PRIORIDADE_COLOR[o.prioridade])}>
                      {PRIORIDADE_LABEL[o.prioridade]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300 max-w-[140px] truncate">{o.solicitante || '—'}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{o.municipio || '—'}</td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400 max-w-[160px] truncate">
                    {o.endereco ? `${o.endereco}${o.numeroEndereco ? `, ${o.numeroEndereco}` : ''}` : '—'}
                  </td>
                  {canManageOrders && <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{o.equipe || '—'}</td>}
                  {canManageOrders && <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{o.tecnico || '—'}</td>}
                  <td className={cn('px-4 py-3 whitespace-nowrap', estaVencida(o) ? 'text-red-600 dark:text-red-400 font-bold' : 'text-slate-500 dark:text-slate-400')}>
                    <span className="inline-flex items-center gap-1">
                      {estaVencida(o) && <AlertTriangle className="icon-sm" />} {o.dataPrevista || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">{new Date(o.createdAt).toLocaleDateString('pt-BR')}</td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">{tempoEmAtendimento(o)}</td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          disabled={processando === o.id}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors disabled:opacity-40"
                          aria-label="Ações"
                        >
                          {processando === o.id ? <Loader2 className="icon-md animate-spin" /> : <MoreVertical className="icon-md" />}
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleAbrirOrdem(o.id)}>
                          <Pencil className="icon-sm mr-2" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleAbrirOrdem(o.id, 'fotos')}>
                          <Paperclip className="icon-sm mr-2" /> Ver anexos
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleAbrirLocalizacao(o)}>
                          <MapPin className="icon-sm mr-2" /> Abrir localização
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicar(o)}>
                          <Copy className="icon-sm mr-2" /> Duplicar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleExportarPdf(o)}>
                          <FileDown className="icon-sm mr-2" /> Exportar PDF
                        </DropdownMenuItem>
                        {canManageOrders && !['cancelada', 'aprovada', 'concluida'].includes(o.status) && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setOrdemParaCancelar(o)} className="text-red-600 dark:text-red-400 focus:text-red-600">
                              <Ban className="icon-sm mr-2" /> Cancelar
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DelegarTecnicoModal
        isOpen={ordensParaDelegar.length > 0}
        titulo={ordensParaDelegar.length > 1 ? `${ordensParaDelegar.length} OS selecionadas` : (ordensParaDelegar[0]?.numero ?? '')}
        permitirReferenciaExterna={ordensParaDelegar.length === 1}
        onClose={() => { if (!delegando) setOrdensParaDelegar([]); }}
        onConfirm={handleConfirmarDelegacao}
      />

      {ordemParaCancelar && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4" onClick={() => setOrdemParaCancelar(null)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-black text-slate-800 dark:text-slate-100">Cancelar {ordemParaCancelar.numero}?</h3>
            <textarea
              value={motivoCancelamento}
              onChange={(e) => setMotivoCancelamento(e.target.value)}
              rows={3}
              placeholder="Motivo do cancelamento"
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 resize-none"
            />
            <div className="flex gap-3">
              <button onClick={() => setOrdemParaCancelar(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-600 dark:text-slate-300">
                Voltar
              </button>
              <button
                onClick={handleConfirmarCancelamento}
                disabled={!motivoCancelamento.trim() || processando === ordemParaCancelar.id}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-sm font-bold transition-colors"
              >
                {processando === ordemParaCancelar.id && <Loader2 className="icon-sm animate-spin" />} Cancelar OS
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
