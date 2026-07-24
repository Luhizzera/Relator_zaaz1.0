import { useEffect, useState } from 'react';
import { Users, Plus, X, Loader2, UserPlus } from 'lucide-react';
import { supabase, ProfileRow, EquipeRow } from '@/lib/supabaseClient';
import {
  listEquipes, listEquipesDoSupervisor, criarEquipe, definirSupervisorDaEquipe,
  listTecnicosDaEquipe, listTecnicosSemEquipe, adicionarTecnicoAEquipe, removerTecnicoDaEquipe,
} from '@/lib/manutencaoService';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/PageHeader';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type ProfileLite = Pick<ProfileRow, 'id' | 'nome' | 'email' | 'ativo' | 'equipe_id'>;

function EquipeCard({
  equipe,
  isGestor,
  supervisores,
  onChanged,
}: {
  equipe: EquipeRow;
  isGestor: boolean;
  supervisores: ProfileRow[];
  onChanged: () => void;
}) {
  const [membros, setMembros] = useState<ProfileLite[]>([]);
  const [candidatos, setCandidatos] = useState<ProfileLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [adicionando, setAdicionando] = useState(false);
  const [processandoId, setProcessandoId] = useState<string | null>(null);

  const carregar = () => {
    setLoading(true);
    Promise.all([listTecnicosDaEquipe(equipe.id), listTecnicosSemEquipe()])
      .then(([m, c]) => { setMembros(m); setCandidatos(c); })
      .catch((err) => console.error('[MinhaEquipe] Erro ao carregar membros:', err))
      .finally(() => setLoading(false));
  };

  useEffect(carregar, [equipe.id]);

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

  const handleRemover = async (tecnicoId: string) => {
    setProcessandoId(tecnicoId);
    try {
      await removerTecnicoDaEquipe(tecnicoId);
      toast({ title: 'Técnico removido da equipe' });
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
            <option value="">Sem supervisor</option>
            {supervisores.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
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
          {membros.map((m) => (
            <div key={m.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{m.nome}</p>
                <p className="text-[11px] text-slate-400 truncate">{m.email}</p>
              </div>
              <button
                onClick={() => handleRemover(m.id)}
                disabled={processandoId === m.id}
                className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg transition-colors disabled:opacity-40"
                aria-label="Remover da equipe"
              >
                {processandoId === m.id ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
              </button>
            </div>
          ))}
        </div>
      )}

      {adicionando ? (
        <div className="space-y-2">
          {candidatos.length === 0 ? (
            <p className="text-xs text-slate-400">Nenhum técnico de manutenção sem equipe no momento.</p>
          ) : (
            candidatos.map((c) => (
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
          <button onClick={() => setAdicionando(false)} className="text-xs font-bold text-slate-400 hover:text-slate-600">
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
    </div>
  );
}

export default function MinhaEquipe() {
  const { isGestor, isSupervisor, canManageOrders, profile } = useAuth();
  const [equipes, setEquipes] = useState<EquipeRow[]>([]);
  const [supervisores, setSupervisores] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [novoNome, setNovoNome] = useState('');
  const [criando, setCriando] = useState(false);

  const carregar = () => {
    if (!profile) return;
    setLoading(true);
    const equipesPromise = isGestor ? listEquipes() : listEquipesDoSupervisor(profile.id);
    const supervisoresPromise = isGestor
      ? supabase.from('profiles').select('*').eq('role', 'supervisor').eq('ativo', true).order('nome')
        .then(({ data }) => (data ?? []) as ProfileRow[])
      : Promise.resolve([]);

    Promise.all([equipesPromise, supervisoresPromise])
      .then(([e, s]) => { setEquipes(e); setSupervisores(s); })
      .catch((err) => console.error('[MinhaEquipe] Erro ao carregar equipes:', err))
      .finally(() => setLoading(false));
  };

  useEffect(carregar, [isGestor, profile?.id]);

  const handleCriarEquipe = async () => {
    if (!novoNome.trim() || !profile) return;
    setCriando(true);
    try {
      await criarEquipe(novoNome.trim(), isSupervisor ? profile.id : undefined);
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
        subtitle={isGestor ? 'Todas as equipes de manutenção da empresa' : 'Técnicos de manutenção que você administra'}
        backTo="/manutencao"
      />

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-wrap items-center gap-3">
        <input
          value={novoNome}
          onChange={(e) => setNovoNome(e.target.value)}
          placeholder="Nome da nova equipe"
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

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="animate-spin mr-2" size={18} /> Carregando...
        </div>
      ) : equipes.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-16">
          {isGestor ? 'Nenhuma equipe cadastrada ainda.' : 'Você ainda não administra nenhuma equipe — crie uma acima.'}
        </p>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {equipes.map((eq) => (
            <EquipeCard key={eq.id} equipe={eq} isGestor={isGestor} supervisores={supervisores} onChanged={carregar} />
          ))}
        </div>
      )}
    </div>
  );
}
