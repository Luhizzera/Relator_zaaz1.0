import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Plus, Loader2, X, User, UserPlus, Search, MapPin, Trash2, SignalHigh,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { LocationMapPicker } from '@/components/LocationMapPicker';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  OrdemCertificacao, STATUS_CERTIFICACAO_LABEL, StatusOrdemCertificacao,
  MARGEM_DB_PADRAO, resumoCertificacao, parseDbm, formatarDbm,
} from '@/types/certificacao';
import {
  listOrdensCertificacao, createOrdemCertificacao, delegarTecnicoCertificacao,
  listTecnicosParaCertificacao, type PontoPlanejado,
} from '@/lib/certificacaoService';
import { listEquipes, listEquipesDoSupervisor } from '@/lib/manutencaoService';
import { EquipeRow, ProfileRow } from '@/lib/supabaseClient';

const STATUS_COLOR: Record<StatusOrdemCertificacao, string> = {
  aberta: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  em_andamento: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  finalizada: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  aprovada: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  reaberta: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  cancelada: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
};

/** Status vindo da URL — mesma porta de entrada que os cards do painel usam nas outras listas. */
function statusDaUrl(search: string): StatusOrdemCertificacao | 'todas' {
  const status = new URLSearchParams(search).get('status');
  return status && status in STATUS_CERTIFICACAO_LABEL ? (status as StatusOrdemCertificacao) : 'todas';
}

/** Uma CTO sendo planejada no formulário — ainda sem id, só o que o gestor digitou. */
interface PontoEmEdicao {
  chave: string;
  nomeCto: string;
  sinalEsperado: string;
  coords: { lat: number; lng: number } | null;
}

const pontoVazio = (): PontoEmEdicao => ({
  chave: crypto.randomUUID(),
  nomeCto: '',
  sinalEsperado: '',
  coords: null,
});

function NovaCertificacaoModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { isGestor, profile } = useAuth();
  const [equipes, setEquipes] = useState<EquipeRow[]>([]);
  const [tecnicos, setTecnicos] = useState<Pick<ProfileRow, 'id' | 'nome' | 'email'>[]>([]);
  const [titulo, setTitulo] = useState('');
  const [equipeId, setEquipeId] = useState('');
  const [tecnicoId, setTecnicoId] = useState('');
  const [dataPrevista, setDataPrevista] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [margem, setMargem] = useState(String(MARGEM_DB_PADRAO));
  const [pontos, setPontos] = useState<PontoEmEdicao[]>([pontoVazio()]);
  const [mapaDoPonto, setMapaDoPonto] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const promise = isGestor
      ? listEquipes('manutencao')
      : (profile ? listEquipesDoSupervisor(profile.id, 'manutencao') : Promise.resolve([]));
    promise.then(setEquipes).catch((err) => console.error('[Certificação] Erro ao carregar equipes:', err));
  }, [isGestor, profile]);

  useEffect(() => {
    setTecnicoId('');
    if (!equipeId) { setTecnicos([]); return; }
    listTecnicosParaCertificacao(equipeId)
      .then(setTecnicos)
      .catch((err) => console.error('[Certificação] Erro ao carregar técnicos:', err));
  }, [equipeId]);

  const atualizarPonto = (chave: string, mudanca: Partial<PontoEmEdicao>) =>
    setPontos((antes) => antes.map((p) => (p.chave === chave ? { ...p, ...mudanca } : p)));

  const margemNumero = parseDbm(margem);
  // Cada CTO precisa de nome, sinal esperado válido e ponto no mapa: é isso que
  // o técnico vai procurar em campo e conferir contra o powermeter.
  const pontosValidos: PontoPlanejado[] = pontos.flatMap((p) => {
    const esperado = parseDbm(p.sinalEsperado);
    if (!p.nomeCto.trim() || esperado == null || !p.coords) return [];
    return [{
      nomeCto: p.nomeCto.trim(),
      sinalEsperadoDbm: esperado,
      latitude: p.coords.lat,
      longitude: p.coords.lng,
    }];
  });
  const pontosIncompletos = pontos.length - pontosValidos.length;
  const podeSalvar = !!titulo.trim() && !!equipeId && margemNumero != null && margemNumero >= 0
    && pontosValidos.length > 0 && pontosIncompletos === 0 && !salvando;

  const handleSalvar = async () => {
    if (!podeSalvar) return;
    setSalvando(true);
    try {
      await createOrdemCertificacao({
        titulo: titulo.trim(),
        equipeId,
        tecnicoId: tecnicoId || null,
        dataPrevista: dataPrevista || null,
        observacoes: observacoes.trim() || null,
        margemDb: margemNumero ?? MARGEM_DB_PADRAO,
        pontos: pontosValidos,
      });
      toast({ title: 'Certificação criada' });
      onCreated();
      onClose();
    } catch (err) {
      console.error('[Certificação] Erro ao criar:', err);
      toast({ title: 'Não foi possível criar a certificação', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setSalvando(false);
    }
  };

  const pontoDoMapa = pontos.find((p) => p.chave === mapaDoPonto);

  return (
    <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-base font-black text-slate-800 dark:text-slate-100">Nova certificação</h2>
          <p className="text-xs text-slate-400">Obra nova: cada CTO entra com o sinal esperado de projeto.</p>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1.5 block">Título</label>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Residencial Vila Nova — quadra 3"
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

          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1.5 block">Técnico</label>
              <select
                value={tecnicoId}
                onChange={(e) => setTecnicoId(e.target.value)}
                disabled={!equipeId}
                className="w-full min-w-0 px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-50"
              >
                <option value="">A definir depois</option>
                {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </div>
            <div className="min-w-0">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1.5 block">Data prevista</label>
              <input
                type="date"
                value={dataPrevista}
                onChange={(e) => setDataPrevista(e.target.value)}
                className="w-full min-w-0 px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 dark:[color-scheme:dark]"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1.5 block">
              Margem aceita (dB)
            </label>
            <input
              value={margem}
              onChange={(e) => setMargem(e.target.value)}
              inputMode="decimal"
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Quanto o medido pode ficar pior que o esperado e ainda passar. Com margem {margemNumero ?? MARGEM_DB_PADRAO} dB,
              um ponto esperado em -18 dBm aceita até {formatarDbm(-18 - (margemNumero ?? MARGEM_DB_PADRAO))}.
            </p>
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
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                CTOs a certificar <span className="text-red-500">*</span>
              </label>
              <span className={cn(
                'text-[10px] font-black px-1.5 py-0.5 rounded-full',
                pontosValidos.length > 0 && pontosIncompletos === 0
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
              )}>
                {pontosValidos.length} pronta(s)
              </span>
            </div>

            <div className="space-y-2">
              {pontos.map((ponto, i) => (
                <div key={ponto.chave} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 text-[11px] font-black flex items-center justify-center shrink-0">
                      {i + 1}
                    </span>
                    <input
                      value={ponto.nomeCto}
                      onChange={(e) => atualizarPonto(ponto.chave, { nomeCto: e.target.value })}
                      placeholder="Nome da CTO"
                      className="flex-1 min-w-0 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                    {pontos.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setPontos((antes) => antes.filter((p) => p.chave !== ponto.chave))}
                        aria-label={`Remover CTO ${i + 1}`}
                        className="text-slate-400 hover:text-red-500 shrink-0"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={ponto.sinalEsperado}
                      onChange={(e) => atualizarPonto(ponto.chave, { sinalEsperado: e.target.value })}
                      inputMode="text"
                      placeholder="Sinal esperado (-18,5)"
                      className="w-full min-w-0 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                    <button
                      type="button"
                      onClick={() => setMapaDoPonto(ponto.chave)}
                      className={cn(
                        'flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border text-xs font-bold transition-colors min-w-0',
                        ponto.coords
                          ? 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                          : 'border-dashed border-amber-400 text-amber-600 dark:text-amber-400',
                      )}
                    >
                      <MapPin size={13} className="shrink-0" />
                      <span className="truncate">
                        {ponto.coords ? `${ponto.coords.lat.toFixed(5)}, ${ponto.coords.lng.toFixed(5)}` : 'Marcar no mapa'}
                      </span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setPontos((antes) => [...antes, pontoVazio()])}
              className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-500 dark:text-slate-400"
            >
              <Plus size={14} /> Adicionar CTO
            </button>

            {pontosIncompletos > 0 && (
              <p className="text-[11px] font-semibold text-red-500 mt-1.5">
                {pontosIncompletos === 1
                  ? 'Uma CTO está incompleta: precisa de nome, sinal esperado e ponto no mapa.'
                  : `${pontosIncompletos} CTOs estão incompletas: cada uma precisa de nome, sinal esperado e ponto no mapa.`}
              </p>
            )}
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
              {salvando && <Loader2 size={14} className="animate-spin" />} Criar certificação
            </button>
          </div>
        </div>
      </div>

      {mapaDoPonto && (
        <div className="fixed inset-0 z-[1001] flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
          <div className="absolute inset-0 bg-black/60" onClick={() => setMapaDoPonto(null)} />
          <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm p-4">
            <p className="text-sm font-black text-slate-800 dark:text-slate-100 mb-3">
              Onde fica {pontoDoMapa?.nomeCto.trim() || 'a CTO'}
            </p>
            <LocationMapPicker
              initialLat={pontoDoMapa?.coords?.lat}
              initialLng={pontoDoMapa?.coords?.lng}
              onCancel={() => setMapaDoPonto(null)}
              onConfirm={(lat, lng) => {
                atualizarPonto(mapaDoPonto, { coords: { lat, lng } });
                setMapaDoPonto(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** Delegação de uma certificação criada sem técnico — a equipe já está fixada na OS. */
function DelegarTecnicoCertificacaoModal({
  ordem, onClose, onDelegado,
}: {
  ordem: OrdemCertificacao;
  onClose: () => void;
  onDelegado: () => void;
}) {
  const [tecnicos, setTecnicos] = useState<Pick<ProfileRow, 'id' | 'nome' | 'email'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecionado, setSelecionado] = useState('');
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    if (!ordem.equipeId) { setLoading(false); return; }
    listTecnicosParaCertificacao(ordem.equipeId)
      .then(setTecnicos)
      .catch((err) => console.error('[Certificação] Erro ao carregar técnicos:', err))
      .finally(() => setLoading(false));
  }, [ordem.equipeId]);

  const handleConfirmar = async () => {
    if (!selecionado || confirmando) return;
    setConfirmando(true);
    try {
      await delegarTecnicoCertificacao(ordem.id, selecionado);
      toast({ title: 'Certificação delegada' });
      onDelegado();
      onClose();
    } catch (err) {
      console.error('[Certificação] Erro ao delegar:', err);
      toast({ title: 'Não foi possível delegar', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
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
          <div className="min-w-0">
            <h2 className="text-base font-black text-slate-800 dark:text-slate-100">Delegar certificação</h2>
            <p className="text-xs text-slate-400 truncate">{ordem.numero} — {ordem.titulo}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0" aria-label="Fechar">
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
                onClick={() => setSelecionado(t.id)}
                className={cn(
                  'w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors',
                  selecionado === t.id
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
            disabled={!selecionado || confirmando}
            onClick={handleConfirmar}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-bold transition-colors"
          >
            {confirmando && <Loader2 size={14} className="animate-spin" />} Confirmar delegação
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CertificacaoOrdersList() {
  const navigate = useNavigate();
  const location = useLocation();
  const { canManageOrders } = useAuth();
  const [ordens, setOrdens] = useState<OrdemCertificacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNova, setShowNova] = useState(false);
  const [ordemParaDelegar, setOrdemParaDelegar] = useState<OrdemCertificacao | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<StatusOrdemCertificacao | 'todas'>(() => statusDaUrl(location.search));
  const [busca, setBusca] = useState('');

  // O React Router não remonta a tela quando só a query string muda.
  useEffect(() => { setFiltroStatus(statusDaUrl(location.search)); }, [location.search]);

  const carregar = () => {
    setLoading(true);
    listOrdensCertificacao()
      .then(setOrdens)
      .catch((err) => console.error('[Certificação] Erro ao listar:', err))
      .finally(() => setLoading(false));
  };

  useEffect(carregar, []);
  useRealtimeRefresh([{ table: 'ordens_certificacao' }, { table: 'pontos_certificacao' }], carregar);

  const filaAtribuicao = useMemo(
    () => (canManageOrders ? ordens.filter((o) => !o.tecnicoId && o.status !== 'cancelada') : []),
    [ordens, canManageOrders],
  );

  const aguardandoConferencia = useMemo(
    () => (canManageOrders ? ordens.filter((o) => o.status === 'finalizada') : []),
    [ordens, canManageOrders],
  );

  const ordensFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return ordens.filter((o) => {
      if (filtroStatus !== 'todas' && o.status !== filtroStatus) return false;
      if (termo && !`${o.numero} ${o.titulo}`.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [ordens, filtroStatus, busca]);

  const filtrosAtivos = filtroStatus !== 'todas' || !!busca.trim();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-6 space-y-6">
      <PageHeader
        title="Certificação"
        subtitle="Certificação de sinal em obra nova, CTO a CTO"
        backTo="/"
        rightContent={canManageOrders && (
          <button
            onClick={() => setShowNova(true)}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold px-4 py-2.5 rounded-xl shadow-sm transition-colors"
          >
            <Plus className="icon-md" /> Nova certificação
          </button>
        )}
      />

      {!loading && ordens.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
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
            onChange={(e) => setFiltroStatus(e.target.value as StatusOrdemCertificacao | 'todas')}
            className="px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
          >
            <option value="todas">Status (todos)</option>
            {Object.entries(STATUS_CERTIFICACAO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {filtrosAtivos && (
            <button
              onClick={() => { setFiltroStatus('todas'); setBusca(''); }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <X size={13} /> Limpar filtros
            </button>
          )}
        </div>
      )}

      {/* Conferência pendente vem antes da fila de atribuição: é trabalho já
          feito em campo esperando o gestor, e quem espera é o técnico. */}
      {!loading && aguardandoConferencia.length > 0 && (
        <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/50 rounded-2xl p-4 space-y-3">
          <h2 className="text-sm font-black text-blue-800 dark:text-blue-400 flex items-center gap-2">
            <SignalHigh className="icon-sm" /> Aguardando sua conferência
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-200 text-blue-800 dark:bg-blue-800/40 dark:text-blue-300">
              {aguardandoConferencia.length}
            </span>
          </h2>
          <div className="space-y-2">
            {aguardandoConferencia.map((o) => {
              const resumo = resumoCertificacao(o);
              return (
                <button
                  key={o.id}
                  onClick={() => navigate(`/certificacao/ordens/${o.id}`)}
                  className="w-full flex items-center gap-3 bg-white dark:bg-slate-900 rounded-xl border border-blue-100 dark:border-blue-900/30 p-3 text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{o.numero} — {o.titulo}</p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {resumo.aprovados} aprovado(s) · {resumo.reprovados} reprovado(s) · {o.tecnico || 'sem técnico'}
                    </p>
                  </div>
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400 shrink-0">Conferir</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!loading && filaAtribuicao.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50 rounded-2xl p-4 space-y-3">
          <h2 className="text-sm font-black text-amber-800 dark:text-amber-400 flex items-center gap-2">
            <UserPlus className="icon-sm" /> Fila de atribuição
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-200 text-amber-800 dark:bg-amber-800/40 dark:text-amber-300">
              {filaAtribuicao.length}
            </span>
          </h2>
          <div className="space-y-2">
            {filaAtribuicao.map((o) => (
              <div key={o.id} className="flex items-center gap-3 bg-white dark:bg-slate-900 rounded-xl border border-amber-100 dark:border-amber-900/30 p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{o.numero} — {o.titulo}</p>
                  <p className="text-[11px] text-slate-400 truncate">{o.equipe || 'Sem equipe'} · {o.pontos.length} CTO(s)</p>
                </div>
                <button
                  onClick={() => setOrdemParaDelegar(o)}
                  className="flex items-center gap-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded-lg transition-colors shrink-0"
                >
                  <UserPlus size={13} /> Delegar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="animate-spin mr-2" size={18} /> Carregando...
        </div>
      ) : ordensFiltradas.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-10 text-center">
          <p className="text-sm text-slate-400">
            {ordens.length === 0
              ? 'Nenhuma certificação cadastrada ainda.'
              : 'Nenhuma certificação encontrada com esses filtros.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {ordensFiltradas.map((o) => {
            const resumo = resumoCertificacao(o);
            return (
              <button
                key={o.id}
                onClick={() => navigate(`/certificacao/ordens/${o.id}`)}
                className="w-full flex items-center gap-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 text-left hover:border-amber-300 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{o.numero} — {o.titulo}</p>
                    <span className={cn('text-[10px] font-black px-2 py-0.5 rounded-full shrink-0', STATUS_COLOR[o.status])}>
                      {STATUS_CERTIFICACAO_LABEL[o.status]}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">
                    {o.equipe || 'Sem equipe'} · {o.tecnico || 'sem técnico'} · margem {o.margemDb} dB
                  </p>
                  {/* O progresso é o que o gestor quer saber de relance: quantas
                      CTOs já foram medidas e quantas passaram. */}
                  <div className="flex items-center gap-3 mt-1.5 text-[11px] font-bold">
                    <span className="text-slate-500 dark:text-slate-400">{resumo.medidos}/{resumo.total} medidas</span>
                    {resumo.aprovados > 0 && <span className="text-green-600 dark:text-green-400">{resumo.aprovados} aprovadas</span>}
                    {resumo.reprovados > 0 && <span className="text-red-600 dark:text-red-400">{resumo.reprovados} reprovadas</span>}
                    {resumo.aRefazer > 0 && <span className="text-orange-600 dark:text-orange-400">{resumo.aRefazer} a refazer</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {showNova && <NovaCertificacaoModal onClose={() => setShowNova(false)} onCreated={carregar} />}
      {ordemParaDelegar && (
        <DelegarTecnicoCertificacaoModal
          ordem={ordemParaDelegar}
          onClose={() => setOrdemParaDelegar(null)}
          onDelegado={carregar}
        />
      )}
    </div>
  );
}
