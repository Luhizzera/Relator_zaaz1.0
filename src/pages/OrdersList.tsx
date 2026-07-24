// @ts-nocheck
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Plus, Trash2, MapPin, Camera, Loader2, ChevronDown, Sheet,
} from 'lucide-react';
import { useOrders } from '@/contexts/OrdersContext';
import { useAuth } from '@/contexts/AuthContext';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { NovaOSModal } from '@/components/NovaOSModal';
import { PageHeader } from '@/components/PageHeader';
import { cn } from '@/lib/utils';
import { OrdemStatus } from '@/lib/supabaseClient';
import { exportToXlsx } from '@/lib/xlsxExport';

const STATUS_LABEL: Record<OrdemStatus, string> = {
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  exportada: 'Exportada',
  cancelada: 'Cancelada',
};

const STATUS_COLOR: Record<OrdemStatus, string> = {
  em_andamento: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  concluida: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  exportada: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  cancelada: 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

export default function OrdersList() {
  const { orders, loadingOrders, refreshOrders, createOrder, deleteOrder, setOrderStatus } = useOrders();
  const { canManageOrders } = useAuth();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrdemStatus | 'todas'>('todas');
  const [tecnicoFilter, setTecnicoFilter] = useState<string>('todos');
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showNovaOSModal, setShowNovaOSModal] = useState(false);
  const [exportando, setExportando] = useState(false);

  useEffect(() => { refreshOrders(); }, [refreshOrders]);

  const tecnicos = useMemo(
    () => Array.from(new Set(orders.map((o) => o.tecnico_nome).filter(Boolean))),
    [orders],
  );

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (statusFilter !== 'todas' && o.status !== statusFilter) return false;
      if (tecnicoFilter !== 'todos' && o.tecnico_nome !== tecnicoFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const haystack = `${o.codigo_referencia} ${o.local} ${o.tecnico_nome}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [orders, search, statusFilter, tecnicoFilter]);

  const handleSelectRelatorio = async () => {
    setShowNovaOSModal(false);
    setCreating(true);
    try {
      const id = await createOrder();
      navigate(`/ordens/${id}`);
    } finally {
      setCreating(false);
    }
  };

  const handleSelectManutencao = () => {
    setShowNovaOSModal(false);
    navigate('/manutencao/nova');
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    await deleteOrder(toDelete);
    setToDelete(null);
  };

  const handleExportarExcel = async () => {
    setExportando(true);
    try {
      await exportToXlsx(
        'ordens-relatorio',
        'Relatórios',
        [
          { header: 'Referência', key: 'referencia', width: 20 },
          { header: 'Status', key: 'status', width: 16 },
          { header: 'Local', key: 'local', width: 28 },
          { header: 'Técnico', key: 'tecnico', width: 20 },
          { header: 'Total de fotos', key: 'fotos', width: 14, type: 'number' },
          { header: 'Abertura', key: 'abertura', width: 14, type: 'date' },
        ],
        filtered.map((o) => ({
          referencia: o.codigo_referencia || '',
          status: STATUS_LABEL[o.status],
          local: o.local || '',
          tecnico: o.tecnico_nome || '',
          fotos: o.total_fotos ?? 0,
          abertura: new Date(o.created_at),
        })),
      );
    } catch (err) {
      console.error('[Orders] Erro ao exportar Excel:', err);
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-6 space-y-5">
      <PageHeader
        title="Relatórios"
        backTo="/"
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
              onClick={() => setShowNovaOSModal(true)}
              disabled={creating}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-4 py-2.5 rounded-xl shadow-sm transition-colors disabled:opacity-60"
            >
              {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Nova OS
            </button>
          </div>
        }
      />

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por referência, local ou técnico..."
            className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="appearance-none pl-3 pr-8 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold text-slate-600 dark:text-slate-300"
          >
            <option value="todas">Todos os status</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>

        {canManageOrders && tecnicos.length > 0 && (
          <div className="relative">
            <select
              value={tecnicoFilter}
              onChange={(e) => setTecnicoFilter(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold text-slate-600 dark:text-slate-300"
            >
              <option value="todos">Todos os técnicos</option>
              {tecnicos.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        )}
      </div>

      {/* Lista */}
      {loadingOrders ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="animate-spin mr-2" size={18} /> Carregando...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-sm text-slate-400">Nenhum relatório encontrado.</div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
          {filtered.map((o) => (
            <div key={o.id} className="flex items-center gap-3 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
              <button onClick={() => navigate(`/ordens/${o.id}`)} className="flex-1 min-w-0 text-left">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                    {o.codigo_referencia || 'Sem referência'}
                  </p>
                  <span className={cn('text-[10px] font-black px-2 py-0.5 rounded-full shrink-0', STATUS_COLOR[o.status])}>
                    {STATUS_LABEL[o.status]}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1">
                  <span className="flex items-center gap-1 truncate"><MapPin size={10} /> {o.local || '—'}</span>
                  <span className="flex items-center gap-1 shrink-0"><Camera size={10} /> {o.total_fotos ?? 0}</span>
                  {canManageOrders && <span className="truncate">{o.tecnico_nome}</span>}
                </div>
              </button>

              <div className="relative shrink-0">
                <select
                  value={o.status}
                  onChange={(e) => setOrderStatus(o.id, e.target.value as OrdemStatus)}
                  className="text-[11px] font-bold border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-900"
                >
                  {Object.entries(STATUS_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={() => setToDelete(o.id)}
                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors shrink-0"
                aria-label="Excluir ordem"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!toDelete}
        title="Excluir relatório?"
        description="Esta ação também remove todas as fotos vinculadas. Não pode ser desfeita."
        confirmLabel="Excluir"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
      />

      <NovaOSModal
        isOpen={showNovaOSModal}
        onClose={() => setShowNovaOSModal(false)}
        onSelectRelatorio={handleSelectRelatorio}
        onSelectManutencao={handleSelectManutencao}
      />
    </div>
  );
}
