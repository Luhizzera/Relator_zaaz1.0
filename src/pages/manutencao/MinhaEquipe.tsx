import { useEffect, useMemo, useState } from 'react';
import { useNavigate, NavigateFunction } from 'react-router-dom';
import {
  Users, Plus, X, Loader2, UserPlus, Briefcase, MapPin, Wrench, ArrowRight, ListChecks,
  ChevronDown, Search,
} from 'lucide-react';
import { supabase, ProfileRow, EquipeRow, TipoEquipe, UserRole } from '@/lib/supabaseClient';
import {
  listEquipes, listEquipesDoSupervisor, criarEquipe, definirSupervisorDaEquipe,
  listTecnicosDaEquipe, listTecnicosSemEquipe, adicionarTecnicoAEquipe, removerTecnicoDaEquipe,
  listManutencaoOrders,
} from '@/lib/manutencaoService';
import { ManutencaoOrdem, STATUS_LABEL } from '@/types/manutencao';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh';
import { PageHeader } from '@/components/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type ProfileLite = Pick<ProfileRow, 'id' | 'nome' | 'email' | 'ativo' | 'equipe_id'>;

// Mesmo papel 'supervisor' de sempre — só passa a poder administrar dois
// tipos de equipe. `role` é o papel de TÉCNICO associado a cada tipo (quem
// pode ser membro), não o do supervisor.
const ROLE_POR_TIPO: Record<TipoEquipe, UserRole> = { la: 'tecnico_la', manutencao: 'tecnico_manutencao' };
const ESTATISTICA_TITULO: Record<TipoEquipe, string> = { la: 'OS abertas', manutencao: 'OS em andamento' };

function EquipeCard({
  equipe,
  isGestor,
  supervisores,
  onChanged,
  estatisticaPorTecnico,
  todasOrdens,
  navigate,
}: {
  equipe: EquipeRow;
  isGestor: boolean;
  supervisores: ProfileRow[];
  onChanged: () => void;
  /** Por tipo: OS em andamento (Manutenção) ou total de OS abertas pelo técnico (LA) — mesmo indicador, significado diferente. */
  estatisticaPorTecnico: Map<string, number>;
  /** Base pra montar "Atividade da equipe" quando `equipe.tipo === 'la'` — ver abaixo. */
  todasOrdens: ManutencaoOrdem[];
  navigate: NavigateFunction;
}) {
  const [membros, setMembros] = useState<ProfileLite[]>([]);
  const [candidatos, setCandidatos] = useState<ProfileLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [adicionando, setAdicionando] = useState(false);
  const [buscaCandidato, setBuscaCandidato] = useState('');
  const [processandoId, setProcessandoId] = useState<string | null>(null);
  const [mostrarAtividade, setMostrarAtividade] = useState(false);
  // Única exclusão do app que não pedia confirmação — bastava um toque
  // errado na lista (fácil no celular) pra tirar alguém da equipe sem querer.
  const [paraRemover, setParaRemover] = useState<ProfileLite | null>(null);

  const role = ROLE_POR_TIPO[equipe.tipo];
  const estatisticaTitulo = ESTATISTICA_TITULO[equipe.tipo];

  // "Todas as atividades e OS abertas pelos técnicos da equipe" — só faz
  // sentido pra LA (o técnico de Manutenção já tem essa visão via delegação/
  // fila de atribuição, que o supervisor de Manutenção já enxerga sem isso).
  const membrosIds = useMemo(() => new Set(membros.map((m) => m.id)), [membros]);
  const atividadeEquipe = useMemo(() => {
    if (equipe.tipo !== 'la') return [];
    return todasOrdens
      .filter((o) => o.responsavelId && membrosIds.has(o.responsavelId))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [todasOrdens, membrosIds, equipe.tipo]);

  const carregar = () => {
    setLoading(true);
    Promise.all([listTecnicosDaEquipe(equipe.id, role), listTecnicosSemEquipe(role)])
      .then(([m, c]) => { setMembros(m); setCandidatos(c); })
      .catch((err) => console.error('[MinhaEquipe] Erro ao carregar membros:', err))
      .finally(() => setLoading(false));
  };

  useEffect(carregar, [equipe.id, role]);

  // A lista continua vindo inteira — a busca só estreita o que está na tela,
  // pra não obrigar a rolar uma lista longa procurando um nome específico.
  const candidatosFiltrados = useMemo(() => {
    const termo = buscaCandidato.trim().toLowerCase();
    if (!termo) return candidatos;
    return candidatos.filter((c) => `${c.nome} ${c.email}`.toLowerCase().includes(termo));
  }, [candidatos, buscaCandidato]);

  const handleAdicionar = async (tecnicoId: string) => {
    setProcessandoId(tecnicoId);
    try {
      await adicionarTecnicoAEquipe(tecnicoId, equipe.id);
      toast({ title: 'Técnico adicionado à equipe' });
      carregar();
      onChanged();
    } catch (err) {
      console.error('[MinhaEquipe] Erro ao adicionar técnico:', err);
      toast({ title: 'Não foi possível adicionar', variant: 'destructive' });
    } finally {
      setProcessandoId(null);
      setAdicionando(false);
    }
  };

  const handleRemover = async () => {
    if (!paraRemover) return;
    setProcessandoId(paraRemover.id);
    try {
      await removerTecnicoDaEquipe(paraRemover.id);
      toast({ title: 'Técnico removido da equipe' });
      setParaRemover(null);
      carregar();
      onChanged();
    } catch (err) {
      console.error('[MinhaEquipe] Erro ao remover técnico:', err);
      toast({ title: 'Não foi possível remover', variant: 'destructive' });
    } finally {
      setProcessandoId(null);
    }
  };

  const handleTrocarSupervisor = async (supervisorId: string) => {
    try {
      await definirSupervisorDaEquipe(equipe.id, supervisorId || null);
      toast({ title: 'Supervisor da equipe atualizado' });
      onChanged();
    } catch (err) {
      console.error('[MinhaEquipe] Erro ao trocar supervisor:', err);
      toast({ title: 'Não foi possível trocar o supervisor', variant: 'destructive' });
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Users size={16} className="text-amber-500" /> {equipe.nome}
        </h3>
        {isGestor && (
          <select
            value={equipe.supervisor_id ?? ''}
            onChange={(e) => handleTrocarSupervisor(e.target.value)}
            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
          >
            <option value="">Sem líder</option>
            {/* O cargo vai no rótulo porque a lista agora mistura gestor e
                supervisor — sem isso não dá pra saber quem é quem na hora de escolher. */}
            {supervisores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome} — {s.role === 'gestor' ? 'Gestor' : 'Supervisor'}
              </option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6 text-slate-400">
          <Loader2 size={16} className="animate-spin mr-2" /> Carregando...
        </div>
      ) : (
        <div className="space-y-1.5">
          {membros.length === 0 && (
            <p className="text-xs text-slate-400 py-2">Nenhum técnico nesta equipe ainda.</p>
          )}
          {membros.map((m) => {
            const estatistica = estatisticaPorTecnico.get(m.id) ?? 0;
            return (
            <div key={m.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{m.nome}</p>
                <p className="text-[11px] text-slate-400 truncate">{m.email}</p>
              </div>
              {/* Carga de trabalho (Manutenção) ou atividade (LA) — ajuda a
                  ver de relance sem precisar ir e voltar até a lista de OS. */}
              <span
                title={estatisticaTitulo}
                className={cn(
                  'shrink-0 flex items-center gap-1 text-[11px] font-black px-2 py-1 rounded-lg',
                  estatistica === 0
                    ? 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
                )}
              >
                <Briefcase size={11} /> {estatistica}
              </span>
              <button
                onClick={() => setParaRemover(m)}
                disabled={processandoId === m.id}
                className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg transition-colors disabled:opacity-40"
                aria-label="Remover da equipe"
              >
                {processandoId === m.id ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
              </button>
            </div>
            );
          })}
        </div>
      )}

      {adicionando ? (
        <div className="space-y-2">
          {candidatos.length > 0 && (
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                value={buscaCandidato}
                onChange={(e) => setBuscaCandidato(e.target.value)}
                placeholder={`Buscar entre ${candidatos.length} técnico(s)...`}
                className="w-full pl-8 pr-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          )}

          {/* Lista rolável: sem isto, uma equipe com dezenas de candidatos
              empurra o botão "Cancelar" e o resto do card pra fora da tela. */}
          <div className="space-y-2 max-h-64 overflow-y-auto">
          {candidatos.length === 0 ? (
            <p className="text-xs text-slate-400">Nenhum técnico sem equipe no momento.</p>
          ) : candidatosFiltrados.length === 0 ? (
            <p className="text-xs text-slate-400">Nenhum técnico encontrado para &quot;{buscaCandidato}&quot;.</p>
          ) : (
            candidatosFiltrados.map((c) => (
              <button
                key={c.id}
                onClick={() => handleAdicionar(c.id)}
                disabled={processandoId === c.id}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left disabled:opacity-50"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{c.nome}</p>
                  <p className="text-[11px] text-slate-400 truncate">{c.email}</p>
                </div>
                {processandoId === c.id && <Loader2 size={14} className="animate-spin" />}
              </button>
            ))
          )}
          </div>
          <button
            onClick={() => { setAdicionando(false); setBuscaCandidato(''); }}
            className="text-xs font-bold text-slate-400 hover:text-slate-600"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAdicionando(true)}
          className="flex items-center gap-2 text-xs font-bold text-amber-600 dark:text-amber-400"
        >
          <UserPlus size={14} /> Adicionar técnico
        </button>
      )}

      {/* Atividade da equipe — todas as OS que os técnicos LA desta equipe
          abriram, não só a contagem do badge acima. Só existe pra LA: o
          supervisor de Manutenção já acompanha isso pela fila de atribuição
          e pela lista de OS, que ele já vê por completo. */}
      {equipe.tipo === 'la' && atividadeEquipe.length > 0 && (
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={() => setMostrarAtividade((v) => !v)}
            className="w-full flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-300"
          >
            <span className="flex items-center gap-1.5">
              <ListChecks size={13} /> Atividade da equipe ({atividadeEquipe.length})
            </span>
            <ChevronDown size={14} className={cn('transition-transform', mostrarAtividade && 'rotate-180')} />
          </button>
          {mostrarAtividade && (
            <div className="mt-2 space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {atividadeEquipe.slice(0, 30).map((o) => (
                <button
                  key={o.id}
                  onClick={() => navigate(`/manutencao/ordens/${o.id}`)}
                  className="w-full flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-left transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{o.numero} — {o.tipo}</p>
                    <p className="text-[10px] text-slate-400 truncate">{o.municipio || '—'} • aberta por {o.responsavel || '—'}</p>
                  </div>
                  <span className="shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    {STATUS_LABEL[o.status]}
                  </span>
                  <ArrowRight size={12} className="text-slate-300 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!paraRemover}
        title={`Remover ${paraRemover?.nome ?? ''} da equipe?`}
        description="Ele deixa de aparecer no modal de delegação desta equipe. Pode ser adicionado de volta a qualquer momento."
        confirmLabel="Remover"
        variant="warning"
        onConfirm={handleRemover}
        onCancel={() => setParaRemover(null)}
      />
    </div>
  );
}

const TIPO_TEXTO: Record<TipoEquipe, string> = { la: 'Localização e Ativação', manutencao: 'Manutenção' };

export default function MinhaEquipe() {
  const { isGestor, isSupervisor, canManageOrders, profile } = useAuth();
  const [tipo, setTipo] = useState<TipoEquipe>('manutencao');
  const [equipes, setEquipes] = useState<EquipeRow[]>([]);
  const [supervisores, setSupervisores] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [novoNome, setNovoNome] = useState('');
  const [criando, setCriando] = useState(false);
  const [todasOrdens, setTodasOrdens] = useState<ManutencaoOrdem[]>([]);
  const navigate = useNavigate();

  // Base das duas estatísticas por técnico (uma consulta só, lida de dois
  // jeitos): carga de trabalho de Manutenção (OS em aberto atribuídas) e
  // atividade de LA (total de OS que o técnico abriu — ele não "executa",
  // então não existe "carga em andamento" pra ele, só o quanto já produziu).
  const carregarOrdens = () => {
    listManutencaoOrders()
      .then(setTodasOrdens)
      .catch((err) => console.error('[MinhaEquipe] Erro ao carregar ordens:', err));
  };
  useEffect(carregarOrdens, []);
  useRealtimeRefresh([{ table: 'ordens_manutencao' }], carregarOrdens);

  const estatisticaPorTecnico = useMemo(() => {
    const map = new Map<string, number>();
    if (tipo === 'manutencao') {
      todasOrdens.forEach((o) => {
        if (!o.tecnicoId || ['aprovada', 'concluida', 'cancelada'].includes(o.status)) return;
        map.set(o.tecnicoId, (map.get(o.tecnicoId) ?? 0) + 1);
      });
    } else {
      todasOrdens.forEach((o) => {
        if (!o.responsavelId) return;
        map.set(o.responsavelId, (map.get(o.responsavelId) ?? 0) + 1);
      });
    }
    return map;
  }, [todasOrdens, tipo]);

  const carregar = () => {
    if (!profile) return;
    setLoading(true);
    const equipesPromise = isGestor ? listEquipes(tipo) : listEquipesDoSupervisor(profile.id, tipo);
    // Gestor também pode liderar equipe: na prática quem coordena um contrato
    // menor acumula os dois papéis, e antes só quem tinha `role = 'supervisor'`
    // podia ser vinculado. Nada no banco exigia isso — `equipes.supervisor_id`
    // é só FK pra profiles, sem constraint de cargo —, era restrição só desta
    // consulta. Gestor primeiro na lista porque a troca costuma ser pra ele.
    const supervisoresPromise = isGestor
      ? supabase.from('profiles').select('*').in('role', ['gestor', 'supervisor']).eq('ativo', true)
        .order('role', { ascending: true }).order('nome', { ascending: true })
        .then(({ data }) => (data ?? []) as ProfileRow[])
      : Promise.resolve([]);

    Promise.all([equipesPromise, supervisoresPromise])
      .then(([e, s]) => { setEquipes(e); setSupervisores(s); })
      .catch((err) => console.error('[MinhaEquipe] Erro ao carregar equipes:', err))
      .finally(() => setLoading(false));
  };

  useEffect(carregar, [isGestor, profile?.id, tipo]);

  const handleCriarEquipe = async () => {
    if (!novoNome.trim() || !profile || !isGestor) return;
    setCriando(true);
    try {
      await criarEquipe(novoNome.trim(), tipo, isSupervisor ? profile.id : undefined);
      toast({ title: 'Equipe criada' });
      setNovoNome('');
      carregar();
    } catch (err) {
      console.error('[MinhaEquipe] Erro ao criar equipe:', err);
      toast({ title: 'Não foi possível criar a equipe', variant: 'destructive' });
    } finally {
      setCriando(false);
    }
  };

  if (!canManageOrders) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-6 space-y-6">
        <PageHeader title="Minha Equipe" backTo="/manutencao" />
        <div className="flex items-center justify-center py-20 text-center">
          <div>
            <p className="font-bold text-slate-700 dark:text-slate-200">Acesso restrito</p>
            <p className="text-sm text-slate-400 mt-1">Somente gestor e supervisor gerenciam equipes.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-6 space-y-5">
      <PageHeader
        title={isGestor ? 'Equipes' : 'Minha Equipe'}
        subtitle={isGestor ? `Todas as equipes de ${TIPO_TEXTO[tipo]} da empresa` : `Técnicos de ${TIPO_TEXTO[tipo]} que você administra`}
        backTo="/manutencao"
      />

      {/* Mesmo supervisor pode administrar os dois tipos de equipe — o
          toggle troca qual conjunto está sendo visto/editado, sem sair da
          tela nem exigir um papel diferente. */}
      <div className="inline-flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-1">
        <button
          onClick={() => setTipo('la')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors',
            tipo === 'la' ? 'bg-amber-500 text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800',
          )}
        >
          <MapPin size={13} /> Localização e Ativação
        </button>
        <button
          onClick={() => setTipo('manutencao')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors',
            tipo === 'manutencao' ? 'bg-amber-500 text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800',
          )}
        >
          <Wrench size={13} /> Manutenção
        </button>
      </div>

      {isGestor && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-wrap items-center gap-3">
          <input
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            placeholder={`Nome da nova equipe de ${TIPO_TEXTO[tipo]}`}
            className="flex-1 min-w-[180px] px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
          />
          <button
            onClick={handleCriarEquipe}
            disabled={criando || !novoNome.trim()}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors"
          >
            {criando ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Nova equipe
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="animate-spin mr-2" size={18} /> Carregando...
        </div>
      ) : equipes.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-16">
          {isGestor ? 'Nenhuma equipe cadastrada ainda.' : 'Você ainda não administra nenhuma equipe — peça a um gestor para criar uma e vincular você como supervisor.'}
        </p>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {equipes.map((eq) => (
            <EquipeCard
              key={eq.id}
              equipe={eq}
              isGestor={isGestor}
              supervisores={supervisores}
              onChanged={carregar}
              estatisticaPorTecnico={estatisticaPorTecnico}
              todasOrdens={todasOrdens}
              navigate={navigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
