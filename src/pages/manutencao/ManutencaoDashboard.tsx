import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ClipboardList, Clock3, CheckCircle2, ShieldAlert, Ban, AlertTriangle,
  Flame, Siren, Plus, ListFilter, PencilLine, Users, FileBarChart, Loader2, Timer, ArrowRight,
  ChevronDown, X, Sheet,
} from 'lucide-react';
import { useNavigate, NavigateFunction } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { listManutencaoOrders } from '@/lib/manutencaoService';
import {
  ManutencaoOrdem, StatusOS, PrioridadeOS, STATUS_LABEL, PRIORIDADE_LABEL, tempoEmAtendimento,
} from '@/types/manutencao';
import { exportToXlsx } from '@/lib/xlsxExport';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export interface FiltrosDashboard {
  dataInicial: string;
  dataFinal: string;
  tipo: string;
  prioridade: PrioridadeOS | 'todas';
  status: StatusOS | 'todas';
  tecnico: string;
  cidade: string;
}

export const FILTROS_DASHBOARD_VAZIOS: FiltrosDashboard = {
  dataInicial: '', dataFinal: '', tipo: '', prioridade: 'todas', status: 'todas', tecnico: '', cidade: '',
};

export function distinctSorted(values: (string | undefined)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v && v.trim() !== ''))).sort((a, b) => a.localeCompare(b));
}

/** Barra de filtros do dashboard — período, tipo de atividade, criticidade, status e (gestor/supervisor) técnico. Afeta os cards e os gráficos abaixo. Reaproveitada na home do técnico (Dashboard.tsx). */
export function FiltrosBar({
  filtros, setFiltro, limpar, ativos, tipos, tecnicos, cidades, mostrarTecnico,
}: {
  filtros: FiltrosDashboard;
  setFiltro: <K extends keyof FiltrosDashboard>(key: K, value: FiltrosDashboard[K]) => void;
  limpar: () => void;
  ativos: boolean;
  tipos: string[];
  tecnicos: string[];
  cidades: string[];
  mostrarTecnico: boolean;
}) {
  const [aberto, setAberto] = useState(ativos);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3">
      <button
        onClick={() => setAberto((v) => !v)}
        className={cn(
          'w-full flex items-center justify-between gap-2 text-sm font-bold transition-colors',
          ativos ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-slate-300',
        )}
      >
        <span className="flex items-center gap-2">
          <ListFilter size={15} /> Filtros
          {ativos && (
            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              ativos
            </span>
          )}
        </span>
        <ChevronDown size={15} className={cn('transition-transform', aberto && 'rotate-180')} />
      </button>

      {aberto && (
        <div className={cn('mt-3 grid grid-cols-2 gap-2', mostrarTecnico ? 'md:grid-cols-7' : 'md:grid-cols-6')}>
          <div className="flex gap-2 col-span-2">
            <input type="date" value={filtros.dataInicial} onChange={(e) => setFiltro('dataInicial', e.target.value)} title="Período — data inicial" className="w-full px-2 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800" />
            <input type="date" value={filtros.dataFinal} onChange={(e) => setFiltro('dataFinal', e.target.value)} title="Período — data final" className="w-full px-2 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800" />
          </div>
          <select value={filtros.tipo} onChange={(e) => setFiltro('tipo', e.target.value)} className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <option value="">Tipo de atividade (todos)</option>
            {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filtros.prioridade} onChange={(e) => setFiltro('prioridade', e.target.value as PrioridadeOS | 'todas')} className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <option value="todas">Criticidade (todas)</option>
            {Object.entries(PRIORIDADE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={filtros.status} onChange={(e) => setFiltro('status', e.target.value as StatusOS | 'todas')} className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <option value="todas">Status (todos)</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={filtros.cidade} onChange={(e) => setFiltro('cidade', e.target.value)} className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <option value="">Cidade (todas)</option>
            {cidades.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {mostrarTecnico && (
            <select value={filtros.tecnico} onChange={(e) => setFiltro('tecnico', e.target.value)} className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <option value="">Técnico (todos)</option>
              {tecnicos.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          {ativos && (
            <button
              onClick={limpar}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 border border-transparent"
            >
              <X size={13} /> Limpar filtros
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
  onClick,
}: {
  icon: any;
  label: string;
  value: number | string;
  accent: string;
  /** Quando presente, o card vira atalho pra lista já filtrada — sem isso o
      gestor via o número mas tinha que ir refazer o filtro manualmente. */
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={cn(
        'bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3 shadow-sm w-full text-left',
        onClick && 'hover:border-amber-300 hover:shadow-md transition-all cursor-pointer active:scale-[0.98]',
      )}
    >
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', accent)}>
        <Icon size={18} />
      </div>
      <div>
        <p className="text-2xl font-black text-slate-800 dark:text-slate-100 leading-none">{value}</p>
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mt-1">{label}</p>
      </div>
    </Tag>
  );
}

function QuickAction({
  icon: Icon,
  label,
  onClick,
  disabled,
  badge,
}: {
  icon: any;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Contador estilo "notificação não lida" — ex: OS novas aguardando o técnico. */
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="relative flex items-center gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors disabled:opacity-60 text-left"
    >
      <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
        {disabled ? <Loader2 size={16} className="animate-spin" /> : <Icon size={16} />}
      </div>
      <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{label}</span>
      {!!badge && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full bg-red-500 text-white text-[11px] font-black animate-pulse">
          {badge}
        </span>
      )}
    </button>
  );
}

const CHART_COLOR = '#f59e0b'; // amber-500, mesma paleta do resto do módulo

function topN(items: string[], n: number): { name: string; total: number }[] {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    const key = item?.trim() || 'Não informado';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, n);
}

function ChartCard({ title, data, dataKey = 'total', color = CHART_COLOR }: {
  title: string;
  data: { name: string; total: number }[];
  dataKey?: string;
  color?: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
      <h3 className="text-sm font-black text-slate-700 dark:text-slate-200 mb-4">{title}</h3>
      {data.length === 0 ? (
        <p className="text-xs text-slate-400 py-10 text-center">Sem dados suficientes ainda.</p>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-slate-100 dark:stroke-slate-800" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} stroke="currentColor" className="text-slate-400" />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} stroke="currentColor" className="text-slate-400" />
              <Tooltip
                contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e2e8f0' }}
                cursor={{ fill: 'rgba(245, 158, 11, 0.08)' }}
              />
              <Bar dataKey={dataKey} radius={[0, 4, 4, 0]}>
                {data.map((_, i) => <Cell key={i} fill={color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function formatMinutos(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h${m.toString().padStart(2, '0')}min` : `${m}min`;
}

/** Reaproveitada na home do técnico (Dashboard.tsx) — lista compacta com badge "Nova" nas OS ainda não recebidas. */
export function OrdensRecentes({
  orders, navigate, vazio, isTecnicoManutencao,
}: {
  orders: ManutencaoOrdem[];
  navigate: NavigateFunction;
  vazio: string;
  /** Só o Técnico de Manutenção vai pra execução mobile e recebe o alerta de "Nova" — o Técnico LA só acompanha, então cai na tela de detalhe (leitura). */
  isTecnicoManutencao: boolean;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
      <h2 className="text-sm font-black text-slate-700 dark:text-slate-200 mb-4">Ordens recentes</h2>
      <div className="space-y-2">
        {orders.length === 0 && <p className="text-xs text-slate-400">{vazio}</p>}
        {orders.slice(0, 6).map((o) => {
          // Delegada/devolvida e ainda não recebida pelo técnico — mesmo
          // conceito de "não lida" usado no badge do Dashboard/QuickAction.
          const nova = isTecnicoManutencao && (o.status === 'atribuida' || o.status === 'reaberta');
          const destino = isTecnicoManutencao ? `/manutencao/ordens/${o.id}/execucao` : `/manutencao/ordens/${o.id}`;
          return (
            <div
              key={o.id}
              className={cn(
                'flex items-center gap-3 p-3 rounded-xl border transition-colors',
                nova
                  ? 'border-red-200 bg-red-50/60 dark:border-red-900/40 dark:bg-red-900/10'
                  : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800',
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate flex items-center gap-2">
                  {o.numero} — {o.solicitante || 'Sem solicitante'}
                  {nova && (
                    <span className="shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded-full bg-red-500 text-white">
                      Nova
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-slate-400 truncate">{o.tipo} • {o.equipe || '—'}</p>
              </div>
              {/* Botão explícito — não depende de "clicar em cima da OS" pra abrir. */}
              <button
                onClick={() => navigate(destino)}
                className={cn(
                  'shrink-0 flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg transition-colors',
                  nova
                    ? 'bg-red-500 hover:bg-red-600 text-white'
                    : 'bg-amber-100 hover:bg-amber-200 text-amber-700 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 dark:text-amber-400',
                )}
              >
                Ver <ArrowRight size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Visão completa — gestor e supervisor (ambos "gerenciam", não executam em campo). Cards operacionais, gráficos (Fase 4) e atalhos administrativos. */
function DashboardGestor({
  orders,
  navigate,
  onNovaOS,
  isGestor,
}: {
  orders: ManutencaoOrdem[];
  navigate: NavigateFunction;
  onNovaOS: () => void;
  isGestor: boolean;
}) {
  const stats = useMemo(() => {
    // "Abertas" cobre tudo que ainda não foi iniciado em campo — inclui
    // atribuída (delegada, não recebida) e reaberta (retrabalho devolvido),
    // não só o status literal 'aberta'. Mesma definição usada no painel do
    // técnico (MeuPainelManutencao, abaixo) e na home (Dashboard.tsx).
    const abertas = orders.filter((o) => o.status === 'aberta' || o.status === 'atribuida' || o.status === 'reaberta').length;
    // Só o status literal 'aberta' — nenhum técnico atribuído ainda. É o
    // mesmo recorte da fila de atribuição em ManutencaoOrdersList.tsx, usado
    // aqui pro alerta que faltava na home do gestor.
    const aguardandoAtribuicao = orders.filter((o) => o.status === 'aberta').length;
    const emAndamento = orders.filter((o) =>
      ['recebida', 'deslocamento', 'no_local', 'em_execucao', 'pausada'].includes(o.status),
    ).length;
    // 'concluida' sozinho nunca é setado pelo service — o fluxo real termina
    // em 'finalizada' (o técnico marca sozinho, sem depender de aprovação) ou,
    // no legado, em 'aprovada'. Contar só 'concluida' subestimava (zerava) o indicador.
    const concluidas = orders.filter((o) => ['concluida', 'aprovada', 'finalizada'].includes(o.status)).length;
    // Finalizada não bloqueia nada — é só um indicador de "concluído
    // recentemente" pro supervisor saber onde reabrir se precisar.
    const finalizadas = orders.filter((o) => o.status === 'finalizada').length;
    const canceladas = orders.filter((o) => o.status === 'cancelada').length;
    const prioridadeAlta = orders.filter((o) => o.prioridade === 'alta' || o.prioridade === 'critica').length;
    const ocorrenciasCriticas = orders.reduce((sum, o) => sum + o.ocorrencias.length, 0);
    // "Vencidas" — prazo (data_prevista, coluna `date` sem hora) já passou e a
    // OS ainda não foi encerrada de nenhuma forma. Comparação por string
    // (YYYY-MM-DD) evita fuso horário criando Date a partir de uma data pura.
    const hojeStr = new Date().toISOString().slice(0, 10);
    const vencidas = orders.filter((o) =>
      !!o.dataPrevista
      && o.dataPrevista < hojeStr
      && !['concluida', 'aprovada', 'finalizada', 'cancelada'].includes(o.status),
    ).length;
    return { abertas, aguardandoAtribuicao, emAndamento, concluidas, finalizadas, canceladas, prioridadeAlta, ocorrenciasCriticas, vencidas };
  }, [orders]);

  const graficos = useMemo(() => {
    const porStatus = (Object.keys(STATUS_LABEL) as StatusOS[])
      .map((status) => ({ name: STATUS_LABEL[status], total: orders.filter((o) => o.status === status).length }))
      .filter((s) => s.total > 0)
      .sort((a, b) => b.total - a.total);

    const porCidade = topN(orders.map((o) => o.municipio || ''), 6);
    const porTecnico = topN(orders.filter((o) => o.tecnico).map((o) => o.tecnico!), 6);

    const materiais = topN(orders.flatMap((o) => o.materiais.map((m) => m.material)), 6);
    const ocorrencias = topN(orders.flatMap((o) => o.ocorrencias.map((oc) => oc.tipo)), 6);

    const concluidas = orders.filter((o) => ['concluida', 'aprovada'].includes(o.status));
    const produtividadePorEquipe = topN(concluidas.filter((o) => o.equipe).map((o) => o.equipe!), 6);

    const comTempo = orders.filter((o) => o.execucaoInicioEm && o.execucaoFimEm);
    const tempoMedioMin = comTempo.length
      ? comTempo.reduce((sum, o) => sum + (new Date(o.execucaoFimEm!).getTime() - new Date(o.execucaoInicioEm!).getTime()) / 60000, 0) / comTempo.length
      : null;

    return { porStatus, porCidade, porTecnico, materiais, ocorrencias, produtividadePorEquipe, tempoMedioMin };
  }, [orders]);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={ClipboardList} label="OS Abertas" value={stats.abertas} accent="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" onClick={() => navigate('/manutencao/ordens?grupo=abertas')} />
        <StatCard icon={Clock3} label="Em andamento" value={stats.emAndamento} accent="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400" onClick={() => navigate('/manutencao/ordens?grupo=andamento')} />
        <StatCard icon={CheckCircle2} label="Concluídas" value={stats.concluidas} accent="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" onClick={() => navigate('/manutencao/ordens?grupo=concluidas')} />
        <StatCard icon={ShieldAlert} label="Finalizadas" value={stats.finalizadas} accent="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" onClick={() => navigate('/manutencao/ordens?status=finalizada')} />
        <StatCard icon={Ban} label="Canceladas" value={stats.canceladas} accent="bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" onClick={() => navigate('/manutencao/ordens?status=cancelada')} />
        <StatCard icon={AlertTriangle} label="Vencidas" value={stats.vencidas} accent="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" onClick={() => navigate('/manutencao/ordens?vencidas=1')} />
        <StatCard icon={Flame} label="Prioridade alta" value={stats.prioridadeAlta} accent="bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400" onClick={() => navigate('/manutencao/ordens?grupo=prioridade_alta')} />
        {/* Ocorrências e tempo médio são agregados sem uma lista equivalente pra deep-linkar — permanecem só informativos. */}
        <StatCard icon={Siren} label="Ocorrências" value={stats.ocorrenciasCriticas} accent="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400" />
        <StatCard
          icon={Timer}
          label="Tempo médio de atendimento"
          value={graficos.tempoMedioMin != null ? formatMinutos(graficos.tempoMedioMin) : '—'}
          accent="bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400"
        />
      </div>

      {/* A home do gestor não tinha nenhum alerta de OS parada esperando
          técnico — só existia na lista (ManutencaoOrdersList.tsx), que o
          gestor só via se fosse até lá conferir. */}
      {stats.aguardandoAtribuicao > 0 && (
        <button
          onClick={() => navigate('/manutencao/ordens?status=aberta')}
          className="w-full flex items-center justify-between gap-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50 rounded-2xl p-4 hover:bg-amber-100/60 dark:hover:bg-amber-900/20 transition-colors text-left"
        >
          <span className="text-sm font-black text-amber-800 dark:text-amber-400 flex items-center gap-2">
            <ClipboardList size={16} />
            {stats.aguardandoAtribuicao} OS aguardando atribuição de técnico
          </span>
          <span className="flex items-center gap-1 text-xs font-bold text-amber-700 dark:text-amber-400 shrink-0">
            Ver e delegar <ArrowRight size={13} />
          </span>
        </button>
      )}

      <div>
        <h2 className="text-sm font-black text-slate-700 dark:text-slate-200 mb-3">Gráficos</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <ChartCard title="OS por Status" data={graficos.porStatus} />
          <ChartCard title="OS por Cidade" data={graficos.porCidade} />
          <ChartCard title="OS por Técnico" data={graficos.porTecnico} />
          <ChartCard title="Produtividade por Equipe (concluídas)" data={graficos.produtividadePorEquipe} />
          <ChartCard title="Materiais mais utilizados" data={graficos.materiais} />
          <ChartCard title="Ocorrências mais frequentes" data={graficos.ocorrencias} />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-black text-slate-700 dark:text-slate-200 mb-3">Atalhos rápidos</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <QuickAction icon={Plus} label="Nova OS" onClick={onNovaOS} />
          <QuickAction icon={PencilLine} label="Editar OS" onClick={() => navigate('/manutencao/ordens')} />
          {isGestor && (
            <QuickAction icon={Users} label="Gerenciar usuários" onClick={() => navigate('/usuarios')} />
          )}
          <QuickAction icon={FileBarChart} label="Relatórios" onClick={() => navigate('/ordens')} />
        </div>
      </div>

      <OrdensRecentes orders={orders} navigate={navigate} vazio="Nenhuma ordem de manutenção cadastrada ainda." isTecnicoManutencao={false} />
    </>
  );
}

export default function ManutencaoDashboard() {
  const navigate = useNavigate();
  const { isGestor, canManageOrders } = useAuth();
  const [orders, setOrders] = useState<ManutencaoOrdem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState<FiltrosDashboard>(FILTROS_DASHBOARD_VAZIOS);
  const [exportando, setExportando] = useState(false);

  // O painel do técnico foi incorporado na home (Dashboard.tsx) — essa tela
  // agora é só do gestor/supervisor. Quem não gerencia OS é redirecionado
  // pra "/" em vez de ver um "Meu Painel" duplicado aqui.
  useEffect(() => {
    if (!canManageOrders) navigate('/', { replace: true });
  }, [canManageOrders, navigate]);

  // `silencioso` evita piscar o spinner de tela cheia quando o realtime
  // recarrega em segundo plano — só a carga inicial mostra o loading.
  const carregar = useCallback((silencioso = false) => {
    if (!silencioso) setLoading(true);
    listManutencaoOrders()
      .then(setOrders)
      .catch((err) => console.error('[Manutencao] Erro ao carregar OS:', err))
      .finally(() => { if (!silencioso) setLoading(false); });
  }, []);

  useEffect(() => { if (canManageOrders) carregar(); }, [carregar, canManageOrders]);

  useRealtimeRefresh([{ table: 'ordens_manutencao' }], () => carregar(true));

  const handleNovaOSManutencao = () => {
    navigate('/manutencao/nova');
  };

  const setFiltro = <K extends keyof FiltrosDashboard>(key: K, value: FiltrosDashboard[K]) =>
    setFiltros((prev) => ({ ...prev, [key]: value }));

  const tiposDisponiveis = useMemo(() => distinctSorted(orders.map((o) => o.tipo)), [orders]);
  // Técnico só faz sentido pra quem vê a fila inteira (gestor/supervisor) —
  // o próprio técnico já só enxerga as OS dele, filtrar por si mesmo não ajuda.
  const tecnicosDisponiveis = useMemo(() => distinctSorted(orders.map((o) => o.tecnico)), [orders]);
  const cidadesDisponiveis = useMemo(() => distinctSorted(orders.map((o) => o.municipio)), [orders]);

  const filtrosAtivos = Object.entries(filtros).some(([k, v]) => v !== (FILTROS_DASHBOARD_VAZIOS as any)[k]);

  // Cards e gráficos abaixo consomem só o resultado filtrado — período
  // (createdAt), tipo de atividade, criticidade (prioridade), status, cidade e técnico.
  const ordersFiltradas = useMemo(() => {
    if (!filtrosAtivos) return orders;
    return orders.filter((o) => {
      if (filtros.dataInicial && o.createdAt < filtros.dataInicial) return false;
      if (filtros.dataFinal && o.createdAt > `${filtros.dataFinal}T23:59:59`) return false;
      if (filtros.tipo && o.tipo !== filtros.tipo) return false;
      if (filtros.prioridade !== 'todas' && o.prioridade !== filtros.prioridade) return false;
      if (filtros.status !== 'todas' && o.status !== filtros.status) return false;
      if (filtros.tecnico && o.tecnico !== filtros.tecnico) return false;
      if (filtros.cidade && o.municipio !== filtros.cidade) return false;
      return true;
    });
  }, [orders, filtros, filtrosAtivos]);

  // Exporta exatamente o que os filtros acima deixaram visível — mesmo
  // princípio já usado em ManutencaoOrdersList.tsx: nunca exporta o
  // universo inteiro quando há um recorte aplicado na tela.
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
          { header: 'Tipo', key: 'tipo', width: 20 },
          { header: 'Solicitante', key: 'solicitante', width: 22 },
          { header: 'Cidade', key: 'cidade', width: 18 },
          { header: 'UTM', key: 'utm', width: 24 },
          { header: 'Equipe', key: 'equipe', width: 16 },
          { header: 'Técnico', key: 'tecnico', width: 20 },
          { header: 'Abertura', key: 'abertura', width: 14, type: 'date' },
          { header: 'Tempo em atendimento', key: 'tempo', width: 18 },
        ],
        ordersFiltradas.map((o) => ({
          numero: o.numero,
          status: STATUS_LABEL[o.status],
          prioridade: PRIORIDADE_LABEL[o.prioridade],
          tipo: o.tipo,
          solicitante: o.solicitante,
          cidade: o.municipio ?? '',
          utm: o.latitude != null && o.longitude != null ? `${o.latitude.toFixed(6)}, ${o.longitude.toFixed(6)}` : '',
          equipe: o.equipe ?? '',
          tecnico: o.tecnico ?? '',
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

  if (!canManageOrders) return null; // redirecionando pra "/" (useEffect acima)

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-6 space-y-6">
      <PageHeader
        title="Manutenção"
        backTo="/"
        subtitle="Visão geral das ordens de serviço de campo"
        rightContent={
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportarExcel}
              disabled={exportando}
              title={filtrosAtivos ? 'Exporta só as OS que passam pelos filtros aplicados' : 'Exporta todas as OS'}
              className="flex items-center gap-2 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-bold px-3.5 py-2.5 rounded-xl transition-colors disabled:opacity-60"
            >
              {exportando ? <Loader2 size={16} className="animate-spin" /> : <Sheet size={16} />} Excel
            </button>
            <button
              onClick={handleNovaOSManutencao}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold px-4 py-2.5 rounded-xl shadow-sm transition-colors"
            >
              <Plus size={16} /> Nova OS
            </button>
          </div>
        }
      />

      {!loading && (
        <FiltrosBar
          filtros={filtros}
          setFiltro={setFiltro}
          limpar={() => setFiltros(FILTROS_DASHBOARD_VAZIOS)}
          ativos={filtrosAtivos}
          tipos={tiposDisponiveis}
          tecnicos={tecnicosDisponiveis}
          cidades={cidadesDisponiveis}
          mostrarTecnico={canManageOrders}
        />
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="animate-spin mr-2" size={18} /> Carregando...
        </div>
      ) : (
        <DashboardGestor orders={ordersFiltradas} navigate={navigate} onNovaOS={handleNovaOSManutencao} isGestor={isGestor} />
      )}
    </div>
  );
}
