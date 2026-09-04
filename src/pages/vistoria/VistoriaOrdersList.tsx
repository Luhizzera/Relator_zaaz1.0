import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  // `Map` sai aliasado de propósito: sem isso o ícone sombreia o `Map` nativo
  // do JavaScript e `new Map()` para de compilar dentro deste arquivo.
  Plus, Loader2, MapPinned, Route as RouteIcon, Map as MapIcon, MapPin, UserPlus, X, User,
  Download, Search,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { LocationMapPicker } from '@/components/LocationMapPicker';
import { ExportarPendenciasModal } from '@/components/ExportarPendenciasModal';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { OrdemVistoria, STATUS_VISTORIA_LABEL, StatusOrdemVistoria } from '@/types/vistoria';
import {
  listOrdensVistoria, createOrdemVistoria, listTecnicosParaVistoria, delegarTecnicoVistoria,
  listPendenciasBacklog,
} from '@/lib/vistoriaService';
import { pendenciaParaPonto } from '@/lib/vistoriaExport';
import type { PendenciaBacklog } from '@/types/vistoria';
import { listEquipes, listEquipesDoSupervisor } from '@/lib/manutencaoService';
import { EquipeRow, ProfileRow } from '@/lib/supabaseClient';

const STATUS_COLOR: Record<StatusOrdemVistoria, string> = {
  aberta: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  em_andamento: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  concluida: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  cancelada: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
};

/**
 * Um extremo do trajeto da rota. Antes os dois pontos eram botões idênticos
 * lado a lado, distinguidos só por um rótulo minúsculo — quem não conhecia o
 * fluxo não sabia qual era qual, e depois de preenchidos viravam duas
 * coordenadas iguais em âmbar. Aqui cada ponto carrega três marcas
 * redundantes: a letra (A/B), a cor (verde/vermelho, a mesma do mapa de
 * execução) e o verbo ("Começa em" / "Termina em").
 */
function PontoTrajeto({
  extremo, valor, onClick,
}: {
  extremo: 'inicio' | 'fim';
  valor: { lat: number; lng: number } | null;
  onClick: () => void;
}) {
  const inicio = extremo === 'inicio';
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors text-left',
        valor
          ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
          : 'border-dashed border-slate-300 dark:border-slate-700 hover:border-amber-400',
      )}
    >
      <span
        className={cn(
          'w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0',
          inicio ? 'bg-green-600' : 'bg-red-600',
        )}
      >
        {inicio ? 'A' : 'B'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-black uppercase tracking-wide text-slate-400">
          {inicio ? 'Começa em' : 'Termina em'}
        </span>
        <span className={cn(
          'block text-xs font-bold truncate',
          valor ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400',
        )}
        >
          {valor ? `${valor.lat.toFixed(6)}, ${valor.lng.toFixed(6)}` : 'Toque para marcar no mapa'}
        </span>
      </span>
      <MapPin size={14} className={cn('shrink-0', valor ? 'text-slate-400' : 'text-amber-500')} />
    </button>
  );
}

function NovaRotaModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { isGestor, profile } = useAuth();
  const [equipes, setEquipes] = useState<EquipeRow[]>([]);
  const [tecnicos, setTecnicos] = useState<Pick<ProfileRow, 'id' | 'nome' | 'email'>[]>([]);
  const [titulo, setTitulo] = useState('');
  const [equipeId, setEquipeId] = useState('');
  const [tecnicoId, setTecnicoId] = useState('');
  const [dataPrevista, setDataPrevista] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [utmInicio, setUtmInicio] = useState<{ lat: number; lng: number } | null>(null);
  const [utmFim, setUtmFim] = useState<{ lat: number; lng: number } | null>(null);
  const [mapaAberto, setMapaAberto] = useState<'inicio' | 'fim' | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const promise = isGestor ? listEquipes('manutencao') : (profile ? listEquipesDoSupervisor(profile.id, 'manutencao') : Promise.resolve([]));
    promise.then(setEquipes).catch((err) => console.error('[Vistoria] Erro ao carregar equipes:', err));
  }, [isGestor, profile]);

  useEffect(() => {
    setTecnicoId('');
    if (!equipeId) { setTecnicos([]); return; }
    listTecnicosParaVistoria(equipeId)
      .then(setTecnicos)
      .catch((err) => console.error('[Vistoria] Erro ao carregar técnicos:', err));
  }, [equipeId]);

  const podeSalvar = titulo.trim() && equipeId && !salvando;

  const handleSalvar = async () => {
    if (!podeSalvar) return;
    setSalvando(true);
    try {
      await createOrdemVistoria({
        titulo: titulo.trim(),
        equipeId,
        tecnicoId: tecnicoId || null,
        dataPrevista: dataPrevista || null,
        observacoes: observacoes.trim() || null,
        utmInicio,
        utmFim,
      });
      toast({ title: 'Rota de vistoria criada' });
      onCreated();
      onClose();
    } catch (err) {
      console.error('[Vistoria] Erro ao criar rota:', err);
      toast({ title: 'Não foi possível criar a rota', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-base font-black text-slate-800 dark:text-slate-100">Nova rota de vistoria</h2>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1.5 block">Título da rota</label>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Rota Jardim Europa — semana 33"
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1.5 block">Equipe</label>
            <select
              value={equipeId}
              onChange={(e) => setEquipeId(e.target.value)}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            >
              <option value="">Selecione uma equipe</option>
              {equipes.map((eq) => <option key={eq.id} value={eq.id}>{eq.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1.5 block">Técnico (opcional agora)</label>
            <select
              value={tecnicoId}
              onChange={(e) => setTecnicoId(e.target.value)}
              disabled={!equipeId}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-50"
            >
              <option value="">A definir depois</option>
              {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1.5 block">Data prevista</label>
            <input
              type="date"
              value={dataPrevista}
              onChange={(e) => setDataPrevista(e.target.value)}
              className="w-full min-w-0 px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1.5 block">Descrição da atividade</label>
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 resize-none"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1.5 block">
              Trajeto da rota
            </label>
            {/* Empilhado, não lado a lado: a leitura de cima pra baixo é o
                próprio sentido do percurso, e o traço tracejado liga um ponto
                ao outro em vez de deixá-los como dois campos soltos. */}
            <div className="relative pl-[13px]">
              <span className="absolute left-[13px] top-9 bottom-9 w-px border-l-2 border-dashed border-slate-300 dark:border-slate-700" />
              <div className="relative space-y-2 -ml-[13px]">
                <PontoTrajeto extremo="inicio" valor={utmInicio} onClick={() => setMapaAberto('inicio')} />
                <PontoTrajeto extremo="fim" valor={utmFim} onClick={() => setMapaAberto('fim')} />
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-600 dark:text-slate-300">
              Cancelar
            </button>
            <button
              onClick={handleSalvar}
              disabled={!podeSalvar}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-bold transition-colors"
            >
              {salvando && <Loader2 size={14} className="animate-spin" />} Criar rota
            </button>
          </div>
        </div>
      </div>

      {mapaAberto && (
        <div className="fixed inset-0 z-[1001] flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
          <div className="absolute inset-0 bg-black/60" onClick={() => setMapaAberto(null)} />
          <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm p-4">
            {/* O mapa repete a mesma marca do campo (letra + cor + verbo) pra
                não haver dúvida sobre qual dos dois se está marcando. */}
            <p className="text-sm font-black text-slate-800 dark:text-slate-100 mb-3 flex items-center gap-2">
              <span className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black text-white',
                mapaAberto === 'inicio' ? 'bg-green-600' : 'bg-red-600',
              )}
              >
                {mapaAberto === 'inicio' ? 'A' : 'B'}
              </span>
              {mapaAberto === 'inicio' ? 'Onde a rota começa' : 'Onde a rota termina'}
            </p>
            <LocationMapPicker
              initialLat={(mapaAberto === 'inicio' ? utmInicio : utmFim)?.lat}
              initialLng={(mapaAberto === 'inicio' ? utmInicio : utmFim)?.lng}
              onCancel={() => setMapaAberto(null)}
              onConfirm={(lat, lng) => {
                if (mapaAberto === 'inicio') setUtmInicio({ lat, lng });
                else setUtmFim({ lat, lng });
                setMapaAberto(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Delegação de uma rota já criada sem técnico. Diferente de DelegarTecnicoModal.tsx
 * (usado em Manutenção), a equipe já está fixada na rota — então o técnico é
 * buscado direto por ela (listTecnicosParaVistoria), sem re-derivar as
 * equipes do supervisor.
 */
function DelegarTecnicoVistoriaModal({
  ordem,
  onClose,
  onDelegado,
}: {
  ordem: OrdemVistoria;
  onClose: () => void;
  onDelegado: () => void;
}) {
  const [tecnicos, setTecnicos] = useState<Pick<ProfileRow, 'id' | 'nome' | 'email'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>('');
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    if (!ordem.equipeId) { setLoading(false); return; }
    listTecnicosParaVistoria(ordem.equipeId)
      .then(setTecnicos)
      .catch((err) => console.error('[Vistoria] Erro ao carregar técnicos:', err))
      .finally(() => setLoading(false));
  }, [ordem.equipeId]);

  const handleConfirmar = async () => {
    if (!selected || confirmando) return;
    setConfirmando(true);
    try {
      await delegarTecnicoVistoria(ordem.id, selected);
      toast({ title: 'Rota delegada' });
      onDelegado();
      onClose();
    } catch (err) {
      console.error('[Vistoria] Erro ao delegar rota:', err);
      toast({ title: 'Não foi possível delegar a rota', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setConfirmando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-black text-slate-800 dark:text-slate-100">Delegar rota</h2>
            <p className="text-xs text-slate-400">{ordem.numero} — {ordem.titulo}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-2 max-h-72 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-slate-400">
              <Loader2 className="animate-spin mr-2" size={16} /> Carregando técnicos...
            </div>
          ) : tecnicos.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8">
              Nenhum técnico ativo em {ordem.equipe || 'equipe'}. Adicione um em &quot;Minha Equipe&quot;.
            </p>
          ) : (
            tecnicos.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelected(t.id)}
                className={cn(
                  'w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors',
                  selected === t.id
                    ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800',
                )}
              >
                <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center shrink-0">
                  <User size={14} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{t.nome}</p>
                  <p className="text-[11px] text-slate-400 truncate">{t.email}</p>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="px-5 pb-5">
          <button
            type="button"
            disabled={!selected || confirmando}
            onClick={handleConfirmar}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-bold transition-colors"
          >
            {confirmando && <Loader2 size={14} className="animate-spin" />}
            Confirmar delegação
          </button>
        </div>
      </div>
    </div>
  );
}

export default function VistoriaOrdersList() {
  const navigate = useNavigate();
  const { canManageOrders } = useAuth();
  const [ordens, setOrdens] = useState<OrdemVistoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNovaRota, setShowNovaRota] = useState(false);
  const [ordemParaDelegar, setOrdemParaDelegar] = useState<OrdemVistoria | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState<StatusOrdemVistoria | 'todas'>('todas');
  const [filtroEquipe, setFiltroEquipe] = useState('');
  const [busca, setBusca] = useState('');
  // Os pontos vivem nas pendências, não nas rotas — o backlog é carregado
  // junto pra que a exportação use exatamente o mesmo shape (com cor e OS
  // corretiva resolvidas) que o mapa usa.
  const [backlog, setBacklog] = useState<PendenciaBacklog[]>([]);

  const carregar = () => {
    setLoading(true);
    listOrdensVistoria()
      .then(setOrdens)
      .catch((err) => console.error('[Vistoria] Erro ao listar rotas:', err))
      .finally(() => setLoading(false));
    listPendenciasBacklog()
      .then(setBacklog)
      .catch((err) => console.error('[Vistoria] Erro ao carregar pontos:', err));
  };

  useEffect(carregar, []);
  useRealtimeRefresh([{ table: 'ordens_vistoria' }, { table: 'pendencias_vistoria' }], carregar);

  const resumo = useMemo(() => {
    const abertas = ordens.filter((o) => o.status === 'aberta').length;
    const emAndamento = ordens.filter((o) => o.status === 'em_andamento').length;
    const concluidas = ordens.filter((o) => o.status === 'concluida').length;
    return { abertas, emAndamento, concluidas };
  }, [ordens]);

  const filaAtribuicao = useMemo(
    () => (canManageOrders ? ordens.filter((o) => !o.tecnicoId && o.status !== 'cancelada') : []),
    [ordens, canManageOrders],
  );

  // Equipes derivadas do que já foi carregado — evita uma consulta só pra
  // montar o seletor, e nunca oferece equipe sem nenhuma rota visível.
  const equipesDisponiveis = useMemo(() => {
    const mapa = new Map<string, string>();
    ordens.forEach((o) => { if (o.equipeId && o.equipe) mapa.set(o.equipeId, o.equipe); });
    return Array.from(mapa.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [ordens]);

  const ordensFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return ordens.filter((o) => {
      if (filtroStatus !== 'todas' && o.status !== filtroStatus) return false;
      if (filtroEquipe && o.equipeId !== filtroEquipe) return false;
      if (termo && !`${o.numero} ${o.titulo}`.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [ordens, filtroStatus, filtroEquipe, busca]);

  const filtrosAtivos = filtroStatus !== 'todas' || !!filtroEquipe || !!busca.trim();

  // "Tudo que estiver filtrado entra no export": o recorte das rotas manda
  // nos pontos, não o contrário.
  const pendenciasFiltradas = useMemo(() => {
    const ids = new Set(ordensFiltradas.map((o) => o.id));
    return backlog.filter((p) => ids.has(p.ordemVistoriaId));
  }, [backlog, ordensFiltradas]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-6 space-y-6">
      <PageHeader
        title="Vistoria"
        subtitle="Rotas de vistoria e pendências registradas em campo"
        backTo="/"
        rightContent={canManageOrders && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/vistoria/backlog')}
              className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-bold px-4 py-2.5 rounded-xl transition-colors"
            >
              <MapIcon className="icon-md" /> Backlog no mapa
            </button>
            <button
              onClick={() => setShowNovaRota(true)}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold px-4 py-2.5 rounded-xl shadow-sm transition-colors"
            >
              <Plus className="icon-md" /> Nova rota
            </button>
          </div>
        )}
      />

      {!loading && ordens.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowExport(true)}
            title={filtrosAtivos ? 'Exporta só os pontos das rotas que passam pelo filtro' : 'Exporta os pontos de todas as rotas'}
            className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-bold px-3 py-2 rounded-xl transition-colors"
          >
            <Download className="icon-sm" /> Exportar
            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
              {pendenciasFiltradas.length}
            </span>
          </button>

          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por número ou título..."
              className="w-56 pl-8 pr-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          </div>

          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value as StatusOrdemVistoria | 'todas')}
            className="px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
          >
            <option value="todas">Status (todos)</option>
            {Object.entries(STATUS_VISTORIA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>

          <select
            value={filtroEquipe}
            onChange={(e) => setFiltroEquipe(e.target.value)}
            className="px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
          >
            <option value="">Equipe (todas)</option>
            {equipesDisponiveis.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
          </select>

          {filtrosAtivos && (
            <button
              onClick={() => { setFiltroStatus('todas'); setFiltroEquipe(''); setBusca(''); }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <X size={13} /> Limpar filtros
            </button>
          )}
        </div>
      )}

      {!loading && ordens.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
            <p className="text-2xl font-black text-slate-800 dark:text-slate-100">{resumo.abertas}</p>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Abertas</p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
            <p className="text-2xl font-black text-amber-600 dark:text-amber-400">{resumo.emAndamento}</p>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Em andamento</p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
            <p className="text-2xl font-black text-green-600 dark:text-green-400">{resumo.concluidas}</p>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Concluídas</p>
          </div>
        </div>
      )}

      {/* Fila de atribuição — só gestor/supervisor vê isso: rotas criadas
          sem técnico ("A definir depois" na abertura) aguardando delegação. */}
      {!loading && filaAtribuicao.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-sm font-black text-amber-800 dark:text-amber-400 flex items-center gap-2">
              <UserPlus className="icon-sm" /> Fila de atribuição
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
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{o.numero} — {o.titulo}</p>
                  <p className="text-[11px] text-slate-400 truncate">{o.equipe || 'Sem equipe'}</p>
                </div>
                <button
                  onClick={() => setOrdemParaDelegar(o)}
                  className="flex items-center gap-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded-lg transition-colors shrink-0"
                >
                  <UserPlus className="icon-sm" /> Delegar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="icon-md animate-spin mr-2" /> Carregando...
        </div>
      ) : ordensFiltradas.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-16">
          {ordens.length > 0
            ? 'Nenhuma rota corresponde aos filtros aplicados.'
            : canManageOrders ? 'Nenhuma rota de vistoria criada ainda.' : 'Nenhuma rota de vistoria atribuída a você ainda.'}
        </p>
      ) : (
        <div className="space-y-2">
          {ordensFiltradas.map((o) => (
            <button
              key={o.id}
              onClick={() => navigate(`/vistoria/ordens/${o.id}/execucao`)}
              className="w-full flex items-center gap-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 text-left hover:border-amber-300 dark:hover:border-amber-700 transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <RouteIcon className="icon-md" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{o.numero} — {o.titulo}</p>
                <p className="text-[11px] text-slate-400 flex items-center gap-1 truncate">
                  <MapPinned size={10} /> {o.equipe || 'Sem equipe'} • {o.tecnico || 'Sem técnico'} • {o.pendencias.length} pendência(s)
                </p>
              </div>
              <span className={cn('text-[10px] font-black px-2 py-1 rounded-full shrink-0', STATUS_COLOR[o.status])}>
                {STATUS_VISTORIA_LABEL[o.status]}
              </span>
            </button>
          ))}
        </div>
      )}

      {showNovaRota && <NovaRotaModal onClose={() => setShowNovaRota(false)} onCreated={carregar} />}
      {showExport && (
        <ExportarPendenciasModal
          pendencias={pendenciasFiltradas.map(pendenciaParaPonto)}
          selecionadas={[]}
          onClose={() => setShowExport(false)}
        />
      )}
      {ordemParaDelegar && (
        <DelegarTecnicoVistoriaModal
          ordem={ordemParaDelegar}
          onClose={() => setOrdemParaDelegar(null)}
          onDelegado={carregar}
        />
      )}
    </div>
  );
}
