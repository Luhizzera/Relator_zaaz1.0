// @ts-nocheck
import React, { useEffect, useMemo, useState } from 'react';
import {
  ClipboardList, CheckCircle2, Clock, Download, Camera, MapPin, Plus, Loader2, Menu, LogOut,
  FileText, Wrench, ShieldAlert, ArrowRight,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useOrders } from '@/contexts/OrdersContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSidebar } from '@/contexts/SidebarContext';
import { listManutencaoOrders } from '@/lib/manutencaoService';
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh';
import { cn } from '@/lib/utils';
import { NovaOSModal } from '@/components/NovaOSModal';
import { ThemeToggle } from '@/components/ThemeToggle';
import { iconChipButtonClass } from '@/components/BackButton';

const STATUS_LABEL: Record<string, string> = {
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  exportada: 'Exportada',
  cancelada: 'Cancelada',
};

const STATUS_COLOR: Record<string, string> = {
  em_andamento: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  concluida: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  exportada: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  cancelada: 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

function StatCard({ icon: Icon, label, value, accent }: any) {
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

/** Cabeçalho de seção — divide visualmente Relatórios e Manutenção no dashboard principal. */
function SectionHeader({ icon: Icon, title, accent, action, badge }: any) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <h2 className="flex items-center gap-2 text-base font-black text-slate-800 dark:text-slate-100">
        <span className={cn('w-7 h-7 rounded-lg flex items-center justify-center', accent)}>
          <Icon size={15} />
        </span>
        {title}
        {/* Alerta estilo "notificação não lida" — OS novas delegadas ao técnico que ele ainda não recebeu. */}
        {badge != null && (
          <span
            className="min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full bg-red-500 text-white text-[11px] font-black animate-pulse"
            title={`${badge} nova(s) OS aguardando você`}
          >
            {badge}
          </span>
        )}
      </h2>
      {action}
    </div>
  );
}

export default function Dashboard() {
  const { orders, loadingOrders, refreshOrders, createOrder } = useOrders();
  const { profile, canManageOrders, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => { refreshOrders(); }, [refreshOrders]);

  const stats = useMemo(() => {
    const total = orders.length;
    const concluidas = orders.filter((o) => o.status === 'concluida' || o.status === 'exportada').length;
    const emAndamento = orders.filter((o) => o.status === 'em_andamento').length;
    const exportadas = orders.filter((o) => o.status === 'exportada').length;
    const totalFotos = orders.reduce((sum, o) => sum + (o.total_fotos ?? 0), 0);
    return { total, concluidas, emAndamento, exportadas, totalFotos };
  }, [orders]);

  const porTecnico = useMemo(() => {
    const map = new Map<string, number>();
    orders.forEach((o) => {
      const key = o.tecnico_nome ?? '—';
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [orders]);

  const maxPorTecnico = Math.max(1, ...porTecnico.map(([, n]) => n));
  const recentes = orders.slice(0, 6);

  const [showNovaOSModal, setShowNovaOSModal] = useState(false);
  const { open: openSidebar } = useSidebar();

  // Resumo condensado do domínio de Manutenção — dividido visualmente do de
  // Relatório Fotográfico, com atalho pro dashboard completo (/manutencao).
  const [loadingManutencao, setLoadingManutencao] = useState(true);
  const [statsManutencao, setStatsManutencao] = useState({ abertas: 0, emAndamento: 0, aguardandoAprovacao: 0, concluidas: 0, novas: 0 });

  const carregarManutencao = () => {
    setLoadingManutencao(true);
    listManutencaoOrders()
      .then((ordensManutencao) => {
        setStatsManutencao({
          // Mesma definição usada em ManutencaoDashboard.tsx — atribuída e
          // reaberta ainda não foram iniciadas em campo, contam como "abertas".
          abertas: ordensManutencao.filter((o) => o.status === 'aberta' || o.status === 'atribuida' || o.status === 'reaberta').length,
          emAndamento: ordensManutencao.filter((o) =>
            ['recebida', 'deslocamento', 'no_local', 'em_execucao', 'pausada'].includes(o.status),
          ).length,
          aguardandoAprovacao: ordensManutencao.filter((o) => o.status === 'aguardando_aprovacao').length,
          concluidas: ordensManutencao.filter((o) => ['concluida', 'aprovada'].includes(o.status)).length,
          // OS delegadas ao técnico que ele ainda não "recebeu" — o alerta de
          // notificação não lida na home é sobre essas, não faz sentido pro
          // gestor/supervisor (que vê a fila inteira da empresa, não a dele).
          novas: ordensManutencao.filter((o) => o.status === 'atribuida' || o.status === 'reaberta').length,
        });
      })
      .catch((err) => console.error('[Dashboard] Erro ao carregar resumo de manutenção:', err))
      .finally(() => setLoadingManutencao(false));
  };

  useEffect(carregarManutencao, []);
  useRealtimeRefresh([{ table: 'ordens_manutencao' }], carregarManutencao);

  const handleSelectRelatorio = async () => {
    setShowNovaOSModal(false);
    const id = await createOrder();
    navigate(`/ordens/${id}`);
  };

  const handleSelectManutencao = () => {
    setShowNovaOSModal(false);
    navigate('/manutencao/nova');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          {canManageOrders ? (
            <button
              onClick={openSidebar}
              aria-label="Abrir menu"
              title="Menu"
              className={iconChipButtonClass}
            >
              <Menu size={18} />
            </button>
          ) : (
            <button
              onClick={signOut}
              aria-label="Sair da conta"
              title="Sair da conta"
              className={iconChipButtonClass}
            >
              <LogOut size={18} />
            </button>
          )}
          <div className="min-w-0">
            <h1 className="text-xl font-black text-slate-800 dark:text-slate-100">Dashboard</h1>
            <p className="text-sm text-slate-500">
              {canManageOrders ? 'Visão geral de relatórios e manutenções' : `Seus relatórios e manutenções, ${profile?.nome ?? ''}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowNovaOSModal(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-4 py-2.5 rounded-xl shadow-sm transition-colors"
          >
            <Plus size={16} /> Nova OS
          </button>
          <ThemeToggle />
        </div>
      </div>

      <section>
        <SectionHeader icon={FileText} title="Relatórios" accent="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" />
      {loadingOrders ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="animate-spin mr-2" size={18} /> Carregando...
        </div>
      ) : (
        <div className="space-y-4">
          {/* Cards de estatística */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard icon={ClipboardList} label="Total de OS" value={stats.total} accent="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" />
            <StatCard icon={Clock} label="Em andamento" value={stats.emAndamento} accent="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400" />
            <StatCard icon={CheckCircle2} label="Concluídas" value={stats.concluidas} accent="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" />
            <StatCard icon={Download} label="Exportadas" value={stats.exportadas} accent="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" />
            <StatCard icon={Camera} label="Fotos registradas" value={stats.totalFotos} accent="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400" />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {/* OS por técnico (admin) */}
            {canManageOrders && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
                <h2 className="text-sm font-black text-slate-700 dark:text-slate-200 mb-4">OS por técnico</h2>
                <div className="space-y-3">
                  {porTecnico.length === 0 && <p className="text-xs text-slate-400">Nenhuma ordem cadastrada ainda.</p>}
                  {porTecnico.map(([nome, count]) => (
                    <div key={nome} className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300">
                        <span>{nome}</span>
                        <span>{count}</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${(count / maxPorTecnico) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Ordens recentes */}
            <div className={cn('bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5', !canManageOrders && 'md:col-span-2')}>
              <h2 className="text-sm font-black text-slate-700 dark:text-slate-200 mb-4">Ordens recentes</h2>
              <div className="space-y-2">
                {recentes.length === 0 && <p className="text-xs text-slate-400">Nenhuma ordem cadastrada ainda.</p>}
                {recentes.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => navigate(`/ordens/${o.id}`)}
                    className="w-full flex items-center justify-between gap-3 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                        {o.codigo_referencia || 'Sem referência'}
                      </p>
                      <p className="text-[11px] text-slate-400 flex items-center gap-1 truncate">
                        <MapPin size={10} /> {o.local || '—'} {canManageOrders && `• ${o.tecnico_nome}`}
                      </p>
                    </div>
                    <span className={cn('text-[10px] font-black px-2 py-1 rounded-full shrink-0', STATUS_COLOR[o.status])}>
                      {STATUS_LABEL[o.status]}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      </section>

      <section>
        <SectionHeader
          icon={Wrench}
          title="Manutenção"
          badge={!canManageOrders && statsManutencao.novas > 0 ? statsManutencao.novas : undefined}
          accent="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
          action={
            <button
              onClick={() => navigate('/manutencao')}
              className="flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline"
            >
              Ver dashboard completo <ArrowRight size={12} />
            </button>
          }
        />
        {loadingManutencao ? (
          <div className="flex items-center justify-center py-14 text-slate-400">
            <Loader2 className="animate-spin mr-2" size={18} /> Carregando...
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={ClipboardList} label="Abertas" value={statsManutencao.abertas} accent="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" />
            <StatCard icon={Clock} label="Em andamento" value={statsManutencao.emAndamento} accent="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400" />
            <StatCard icon={ShieldAlert} label="Finalizadas (para aprovar)" value={statsManutencao.aguardandoAprovacao} accent="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400" />
            <StatCard icon={CheckCircle2} label="Concluídas" value={statsManutencao.concluidas} accent="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" />
          </div>
        )}
      </section>

      <NovaOSModal
        isOpen={showNovaOSModal}
        onClose={() => setShowNovaOSModal(false)}
        onSelectRelatorio={handleSelectRelatorio}
        onSelectManutencao={handleSelectManutencao}
      />
    </div>
  );
}
