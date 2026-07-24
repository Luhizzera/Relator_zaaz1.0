import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Plus, MapPin, ChevronDown, Loader2, UserPlus, MoreVertical,
  Pencil, Copy, FileDown, Ban, Paperclip, X, Sheet, ArrowRight, BellRing,
} from 'lucide-react';
import {
  listManutencaoOrders, assignTecnico, duplicarOrdemManutencao, cancelarOrdem,
} from '@/lib/manutencaoService';
import { exportManutencaoPdf } from '@/lib/manutencaoPdfEngine';
import { exportToXlsx } from '@/lib/xlsxExport';
import { ManutencaoOrdem, StatusOS, PrioridadeOS, STATUS_LABEL, PRIORIDADE_LABEL } from '@/types/manutencao';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh';
import { PageHeader } from '@/components/PageHeader';
import { DelegarTecnicoModal } from '@/components/DelegarTecnicoModal';
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
  aguardando_aprovacao: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
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

function tempoEmAtendimento(ordem: ManutencaoOrdem): string {
  const fim = ordem.execucaoFimEm || ordem.aprovadoEm || ordem.canceladoEm;
  const fimData = fim ? new Date(fim) : new Date();
  const min = Math.round((fimData.getTime() - new Date(ordem.createdAt).getTime()) / 60000);
  if (min < 60) return `${min}min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `${horas}h`;
  return `${Math.floor(horas / 24)}d`;
}

function distinctSorted(values: (string | undefined)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v && v.trim() !== ''))).sort((a, b) => a.localeCompare(b));
}

interface Filtros {
  numero: string;
  cidade: string;
  bairro: string;
  tecnico: string;
  equipe: string;
  status: StatusOS | 'todas';
  prioridade: PrioridadeOS | 'todas';
  tipo: string;
  dataInicial: string;
  dataFinal: string;
}

const FILTROS_VAZIOS: Filtros = {
  numero: '', cidade: '', bairro: '', tecnico: '', equipe: '',
  status: 'todas', prioridade: 'todas', tipo: '', dataInicial: '', dataFinal: '',
};

export default function ManutencaoOrdersList() {
  const navigate = useNavigate();
  const { canManageOrders, isTecnico } = useAuth();
  const [orders, setOrders] = useState<ManutencaoOrdem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [ordemParaDelegar, setOrdemParaDelegar] = useState<ManutencaoOrdem | null>(null);
  const [ordemParaCancelar, setOrdemParaCancelar] = useState<ManutencaoOrdem | null>(null);
  const [motivoCancelamento, setMotivoCancelamento] = useState('');
  const [processando, setProcessando] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

  const carregar = useCallback((silencioso = false) => {
    if (!silencioso) setLoading(true);
    listManutencaoOrders()
      .then(setOrders)
      .catch((err) => console.error('[Manutencao] Erro ao listar OS:', err))
      .finally(() => { if (!silencioso) setLoading(false); });
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  useRealtimeRefresh([{ table: 'ordens_manutencao' }], () => carregar(true));

  // Técnico só recebe suas próprias OS na query — isso é garantido pela RLS
  // do banco (ver supabase/migrations/0001_manutencao_schema.sql), não
  // precisa ser refiltrado no cliente por nome/id.
  const ordersEscopo = orders;

  const filaAtribuicao = useMemo(
    () => (canManageOrders ? orders.filter((o) => o.status === 'aberta') : []),
    [orders, canManageOrders],
  );

  // OS delegadas (ou devolvidas) a este técnico que ele ainda não "recebeu" —
  // o alerta de "notificação não lida" do lado do técnico, espelhando a fila
  // de atribuição que o gestor/supervisor vê acima.
  const filaNovasParaTecnico = useMemo(
    () => (isTecnico ? orders.filter((o) => o.status === 'atribuida' || o.status === 'reaberta') : []),
    [orders, isTecnico],
  );

  const opcoes = useMemo(() => ({
    cidades: distinctSorted(orders.map((o) => o.municipio)),
    bairros: distinctSorted(orders.map((o) => o.bairro)),
    tecnicos: distinctSorted(orders.map((o) => o.tecnico)),
    equipes: distinctSorted(orders.map((o) => o.equipe)),
    tipos: distinctSorted(orders.map((o) => o.tipo)),
  }), [orders]);

  const filtered = useMemo(() => {
    return ordersEscopo.filter((o) => {
      if (filtros.numero.trim() && !o.numero.toLowerCase().includes(filtros.numero.trim().toLowerCase())) return false;
      if (filtros.cidade && o.municipio !== filtros.cidade) return false;
      if (filtros.bairro && o.bairro !== filtros.bairro) return false;
      if (filtros.tecnico && o.tecnico !== filtros.tecnico) return false;
      if (filtros.equipe && o.equipe !== filtros.equipe) return false;
      if (filtros.status !== 'todas' && o.status !== filtros.status) return false;
      if (filtros.prioridade !== 'todas' && o.prioridade !== filtros.prioridade) return false;
      if (filtros.tipo && o.tipo !== filtros.tipo) return false;
      if (filtros.dataInicial && o.createdAt < filtros.dataInicial) return false;
      if (filtros.dataFinal && o.createdAt > `${filtros.dataFinal}T23:59:59`) return false;
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

  // Técnico abre a tela de execução mobile (linear, botões grandes);
  // gestor/supervisor abrem a tela de detalhe com abas (desktop).
  const handleAbrirOrdem = (ordemId: string, aba?: string) => {
    const base = isTecnico ? `/manutencao/ordens/${ordemId}/execucao` : `/manutencao/ordens/${ordemId}`;
    navigate(aba && !isTecnico ? `${base}?aba=${aba}` : base);
  };

  const handleConfirmarDelegacao = async (tecnicoId: string, tecnicoNome: string) => {
    if (!ordemParaDelegar) return;
    try {
      await assignTecnico(ordemParaDelegar.id, tecnicoId, tecnicoNome);
      setOrdemParaDelegar(null);
      carregar();
    } catch (err) {
      console.error('[Manutencao] Erro ao delegar OS:', err);
    }
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

  const handleExportarPdf = (ordem: ManutencaoOrdem) => {
    try {
      exportManutencaoPdf(ordem);
    } catch (err) {
      console.error('[Manutencao] Erro ao exportar PDF:', err);
      toast({ title: 'Não foi possível gerar o PDF', variant: 'destructive' });
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
              {exportando ? <Loader2 size={16} className="animate-spin" /> : <Sheet size={16} />} Excel
            </button>
            <button
              onClick={handleNovaOS}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold px-4 py-2.5 rounded-xl shadow-sm transition-colors"
            >
              <Plus size={16} /> Nova OS
            </button>
          </div>
        }
      />

      {/* Fila de atribuição — só supervisor/gestor vê isso */}
      {canManageOrders && filaAtribuicao.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-amber-800 dark:text-amber-400 flex items-center gap-2">
              <UserPlus size={16} /> Aguardando atribuição de técnico
            </h2>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-200 text-amber-800 dark:bg-amber-800/40 dark:text-amber-300">
              {filaAtribuicao.length}
            </span>
          </div>
          <div className="space-y-2">
            {filaAtribuicao.map((o) => (
              <div
                key={o.id}
                className="flex items-center gap-3 bg-white dark:bg-slate-900 rounded-xl border border-amber-100 dark:border-amber-900/30 p-3"
              >
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
                  onClick={() => setOrdemParaDelegar(o)}
                  className="flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-900/50 px-3 py-2 rounded-lg transition-colors shrink-0"
                >
                  <UserPlus size={13} /> Delegar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Novas OS delegadas/devolvidas ao técnico — alerta estilo "não lida" */}
      {isTecnico && filaNovasParaTecnico.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/50 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-red-700 dark:text-red-400 flex items-center gap-2">
              <BellRing size={16} /> Novas OS para você
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
                  Ver <ArrowRight size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Busca rápida + toggle de filtros avançados */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
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
          <ChevronDown size={14} className={cn('transition-transform', mostrarFiltros && 'rotate-180')} />
        </button>
        {filtrosAtivos && (
          <button
            onClick={() => setFiltros(FILTROS_VAZIOS)}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <X size={13} /> Limpar
          </button>
        )}
      </div>

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
          <div className="flex gap-2 col-span-2 md:col-span-1">
            <input type="date" value={filtros.dataInicial} onChange={(e) => setFiltro('dataInicial', e.target.value)} className="w-full px-2 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800" title="Data inicial" />
            <input type="date" value={filtros.dataFinal} onChange={(e) => setFiltro('dataFinal', e.target.value)} className="w-full px-2 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800" title="Data final" />
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="animate-spin mr-2" size={18} /> Carregando...
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
                  className="border-b last:border-0 border-slate-50 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                  onClick={() => handleAbrirOrdem(o.id)}
                >
                  <td className="px-4 py-3 font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">{o.numero}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={cn('text-[10px] font-black px-2 py-0.5 rounded-full whitespace-nowrap', STATUS_COLOR[o.status])}>
                        {STATUS_LABEL[o.status]}
                      </span>
                      {isTecnico && (o.status === 'atribuida' || o.status === 'reaberta') && (
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
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">{o.dataPrevista || '—'}</td>
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
                          {processando === o.id ? <Loader2 size={16} className="animate-spin" /> : <MoreVertical size={16} />}
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleAbrirOrdem(o.id)}>
                          <Pencil size={14} className="mr-2" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleAbrirOrdem(o.id, 'fotos')}>
                          <Paperclip size={14} className="mr-2" /> Ver anexos
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleAbrirLocalizacao(o)}>
                          <MapPin size={14} className="mr-2" /> Abrir localização
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicar(o)}>
                          <Copy size={14} className="mr-2" /> Duplicar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleExportarPdf(o)}>
                          <FileDown size={14} className="mr-2" /> Exportar PDF
                        </DropdownMenuItem>
                        {canManageOrders && !['cancelada', 'aprovada', 'concluida'].includes(o.status) && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setOrdemParaCancelar(o)} className="text-red-600 dark:text-red-400 focus:text-red-600">
                              <Ban size={14} className="mr-2" /> Cancelar
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
        isOpen={!!ordemParaDelegar}
        ordemNumero={ordemParaDelegar?.numero ?? ''}
        onClose={() => setOrdemParaDelegar(null)}
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
                {processando === ordemParaCancelar.id && <Loader2 size={14} className="animate-spin" />} Cancelar OS
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
