import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ClipboardList, Clock3, CheckCircle2, ShieldAlert, Ban, AlertTriangle,
  Flame, Siren, Plus, ListFilter, PencilLine, Users, FileBarChart, Loader2, Timer, ArrowRight,
} from 'lucide-react';
import { useNavigate, NavigateFunction } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { listManutencaoOrders } from '@/lib/manutencaoService';
import { ManutencaoOrdem, StatusOS, STATUS_LABEL } from '@/types/manutencao';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh';
import { cn } from '@/lib/utils';

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: any;
  label: string;
  value: number | string;
  accent: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3 shadow-sm">
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', accent)}>
        <Icon size={18} />
      </div>
      <div>
        <p className="text-2xl font-black text-slate-800 dark:text-slate-100 leading-none">{value}</p>
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mt-1">{label}</p>
      </div>
    </div>
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

function OrdensRecentes({
  orders, navigate, vazio, isTecnico,
}: {
  orders: ManutencaoOrdem[];
  navigate: NavigateFunction;
  vazio: string;
  isTecnico: boolean;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
      <h2 className="text-sm font-black text-slate-700 dark:text-slate-200 mb-4">Ordens recentes</h2>
      <div className="space-y-2">
        {orders.length === 0 && <p className="text-xs text-slate-400">{vazio}</p>}
        {orders.slice(0, 6).map((o) => {
          // Delegada/devolvida e ainda não recebida pelo técnico — mesmo
          // conceito de "não lida" usado no badge do Dashboard/QuickAction.
          const nova = isTecnico && (o.status === 'atribuida' || o.status === 'reaberta');
          const destino = isTecnico ? `/manutencao/ordens/${o.id}/execucao` : `/manutencao/ordens/${o.id}`;
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
    const emAndamento = orders.filter((o) =>
      ['recebida', 'deslocamento', 'no_local', 'em_execucao', 'pausada'].includes(o.status),
    ).length;
    const concluidasHoje = orders.filter((o) => o.status === 'concluida').length;
    const aguardandoAprovacao = orders.filter((o) => o.status === 'aguardando_aprovacao').length;
    const canceladas = orders.filter((o) => o.status === 'cancelada').length;
    const prioridadeAlta = orders.filter((o) => o.prioridade === 'alta' || o.prioridade === 'critica').length;
    const ocorrenciasCriticas = orders.reduce((sum, o) => sum + o.ocorrencias.length, 0);
    return { abertas, emAndamento, concluidasHoje, aguardandoAprovacao, canceladas, prioridadeAlta, ocorrenciasCriticas };
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
        <StatCard icon={ClipboardList} label="OS Abertas" value={stats.abertas} accent="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" />
        <StatCard icon={Clock3} label="Em andamento" value={stats.emAndamento} accent="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400" />
        <StatCard icon={CheckCircle2} label="Concluídas hoje" value={stats.concluidasHoje} accent="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" />
        <StatCard icon={ShieldAlert} label="Finalizadas (para aprovar)" value={stats.aguardandoAprovacao} accent="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" />
        <StatCard icon={Ban} label="Canceladas" value={stats.canceladas} accent="bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" />
        <StatCard icon={AlertTriangle} label="Vencidas" value={0} accent="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" />
        <StatCard icon={Flame} label="Prioridade alta" value={stats.prioridadeAlta} accent="bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400" />
        <StatCard icon={Siren} label="Ocorrências" value={stats.ocorrenciasCriticas} accent="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400" />
        <StatCard
          icon={Timer}
          label="Tempo médio de atendimento"
          value={graficos.tempoMedioMin != null ? formatMinutos(graficos.tempoMedioMin) : '—'}
          accent="bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400"
        />
      </div>

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

      <OrdensRecentes orders={orders} navigate={navigate} vazio="Nenhuma ordem de manutenção cadastrada ainda." isTecnico={false} />
    </>
  );
}

/** Visão simplificada — técnico (LA ou manutenção). Só o que é relevante pro próprio trabalho de campo. */
function MeuPainelManutencao({
  orders,
  navigate,
  onNovaOS,
  isTecnico,
}: {
  orders: ManutencaoOrdem[];
  navigate: NavigateFunction;
  onNovaOS: () => void;
  isTecnico: boolean;
}) {
  const stats = useMemo(() => {
    // Mesma definição de "Abertas" usada em DashboardGestor/Dashboard.tsx —
    // atribuída e reaberta ainda não foram iniciadas em campo, então contam
    // como "abertas" (precisam de ação do técnico), não "em andamento".
    const abertas = orders.filter((o) => o.status === 'aberta' || o.status === 'atribuida' || o.status === 'reaberta').length;
    const emAndamento = orders.filter((o) =>
      ['recebida', 'deslocamento', 'no_local', 'em_execucao', 'pausada'].includes(o.status),
    ).length;
    const aguardandoAprovacao = orders.filter((o) => o.status === 'aguardando_aprovacao').length;
    const concluidas = orders.filter((o) => o.status === 'concluida' || o.status === 'aprovada').length;
    // Delegadas (ou devolvidas) e ainda não recebidas — o "alerta" de OS nova.
    const novas = orders.filter((o) => o.status === 'atribuida' || o.status === 'reaberta').length;
    return { abertas, emAndamento, aguardandoAprovacao, concluidas, novas };
  }, [orders]);

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={ClipboardList} label="Abertas" value={stats.abertas} accent="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" />
        <StatCard icon={Clock3} label="Em andamento" value={stats.emAndamento} accent="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400" />
        <StatCard icon={ShieldAlert} label="Finalizadas (para aprovar)" value={stats.aguardandoAprovacao} accent="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" />
        <StatCard icon={CheckCircle2} label="Concluídas" value={stats.concluidas} accent="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <QuickAction icon={Plus} label="Nova OS" onClick={onNovaOS} />
        <QuickAction icon={ListFilter} label="Minhas Ordens" onClick={() => navigate('/manutencao/ordens')} badge={stats.novas} />
      </div>

      <OrdensRecentes orders={orders} navigate={navigate} vazio="Nenhuma OS aberta ou delegada a você ainda." isTecnico={isTecnico} />
    </>
  );
}

export default function ManutencaoDashboard() {
  const navigate = useNavigate();
  const { isGestor, canManageOrders, isTecnico } = useAuth();
  const [orders, setOrders] = useState<ManutencaoOrdem[]>([]);
  const [loading, setLoading] = useState(true);

  // `silencioso` evita piscar o spinner de tela cheia quando o realtime
  // recarrega em segundo plano — só a carga inicial mostra o loading.
  const carregar = useCallback((silencioso = false) => {
    if (!silencioso) setLoading(true);
    listManutencaoOrders()
      .then(setOrders)
      .catch((err) => console.error('[Manutencao] Erro ao carregar OS:', err))
      .finally(() => { if (!silencioso) setLoading(false); });
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  useRealtimeRefresh([{ table: 'ordens_manutencao' }], () => carregar(true));

  const handleNovaOSManutencao = () => {
    navigate('/manutencao/nova');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-6 space-y-6">
      <PageHeader
        title={canManageOrders ? 'Manutenção' : 'Meu Painel'}
        backTo="/"
        subtitle={canManageOrders ? 'Visão geral das ordens de serviço de campo' : 'Suas ordens de serviço de campo'}
        rightContent={
          <button
            onClick={handleNovaOSManutencao}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold px-4 py-2.5 rounded-xl shadow-sm transition-colors"
          >
            <Plus size={16} /> Nova OS
          </button>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="animate-spin mr-2" size={18} /> Carregando...
        </div>
      ) : canManageOrders ? (
        <DashboardGestor orders={orders} navigate={navigate} onNovaOS={handleNovaOSManutencao} isGestor={isGestor} />
      ) : (
        <MeuPainelManutencao orders={orders} navigate={navigate} onNovaOS={handleNovaOSManutencao} isTecnico={isTecnico} />
      )}
    </div>
  );
}
