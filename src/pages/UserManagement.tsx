// @ts-nocheck
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, ShieldCheck, UserCog, MapPin, Wrench, Info, Check, X, Search, Users } from 'lucide-react';
import { supabase, ProfileRow, UserRole, SETOR_POR_ROLE } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/PageHeader';
import { cn } from '@/lib/utils';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

const TODOS_OS_CARGOS: UserRole[] = ['gestor', 'supervisor', 'tecnico_la', 'tecnico_manutencao'];

const ROLE_LABEL: Record<UserRole, string> = {
  gestor: 'Gestores',
  supervisor: 'Supervisores',
  tecnico_la: 'Técnicos LA',
  tecnico_manutencao: 'Técnicos Manutenção',
};

const ROLE_STYLE: Record<UserRole, string> = {
  gestor: 'bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-400',
  supervisor: 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400',
  tecnico_la: 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400',
  tecnico_manutencao: 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300',
};

const ROLE_ICON_BG: Record<UserRole, string> = {
  gestor: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
  supervisor: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  tecnico_la: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
  tecnico_manutencao: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

const ROLE_ICON: Record<UserRole, typeof MapPin> = {
  gestor: ShieldCheck,
  supervisor: UserCog,
  tecnico_la: MapPin,
  tecnico_manutencao: Wrench,
};

export default function UserManagement() {
  const { isGestor, profile: myProfile } = useAuth();
  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [filtroCargo, setFiltroCargo] = useState<UserRole | 'todos'>('todos');
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'ativo' | 'inativo'>('todos');
  // Cargo escolhido mas ainda não gravado — só aplica de verdade quando
  // confirmarRole() é chamado. Clicar no botão de cargo só avança essa
  // "prévia" localmente, sem tocar no banco.
  const [pendingRoles, setPendingRoles] = useState<Record<string, UserRole>>({});

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('profiles').select('*').order('nome');
    if (error) console.error('[UserManagement] Erro ao carregar usuários:', error);
    setUsers((data ?? []) as ProfileRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtrosAtivos = !!busca.trim() || filtroCargo !== 'todos' || filtroStatus !== 'todos';

  const limparFiltros = () => {
    setBusca('');
    setFiltroCargo('todos');
    setFiltroStatus('todos');
  };

  const usersFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return users.filter((u) => {
      if (q && !u.nome.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false;
      if (filtroCargo !== 'todos' && u.role !== filtroCargo) return false;
      if (filtroStatus === 'ativo' && !u.ativo) return false;
      if (filtroStatus === 'inativo' && u.ativo) return false;
      return true;
    });
  }, [users, busca, filtroCargo, filtroStatus]);

  // Contagem reflete o que os filtros deixaram visível — mesma lógica de
  // "resultado da busca" que o resto do app já usa (ex: listas de OS).
  const contagemPorCargo = useMemo(() => {
    const map: Record<UserRole, number> = { gestor: 0, supervisor: 0, tecnico_la: 0, tecnico_manutencao: 0 };
    usersFiltrados.forEach((u) => { map[u.role] = (map[u.role] ?? 0) + 1; });
    return map;
  }, [usersFiltrados]);

  if (!isGestor) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-6 space-y-6">
        <PageHeader title="Usuários" backTo="/" />
        <div className="flex items-center justify-center py-20 text-center">
          <div>
            <p className="font-bold text-slate-700 dark:text-slate-200">Acesso restrito</p>
            <p className="text-sm text-slate-400 mt-1">Somente gestores podem gerenciar usuários.</p>
          </div>
        </div>
      </div>
    );
  }

  const cancelarRole = (u: ProfileRow) => {
    setPendingRoles((prev) => {
      const next = { ...prev };
      delete next[u.id];
      return next;
    });
  };

  // Só define a "prévia" do cargo — nada é salvo até confirmarRole(). Antes
  // cada clique avançava pro próximo papel do ciclo (era preciso clicar até
  // 3x pra chegar no que você queria); agora a lista deixa escolher direto.
  const selecionarRole = (u: ProfileRow, role: UserRole) => {
    if (role === u.role) {
      cancelarRole(u);
      return;
    }
    setPendingRoles((prev) => ({ ...prev, [u.id]: role }));
  };

  // Setor é sempre derivado do cargo — trocar o papel já muda o setor junto,
  // não precisa (nem dá mais) editar isso separadamente.
  const confirmarRole = async (u: ProfileRow) => {
    const newRole = pendingRoles[u.id];
    if (!newRole) return;
    const newSetor = SETOR_POR_ROLE[newRole];
    setSavingId(u.id);
    const { error } = await supabase.from('profiles').update({ role: newRole, setor: newSetor }).eq('id', u.id);
    if (!error) setUsers((prev) => prev.map((p) => (p.id === u.id ? { ...p, role: newRole, setor: newSetor } : p)));
    setSavingId(null);
    cancelarRole(u);
  };

  const toggleAtivo = async (u: ProfileRow) => {
    setSavingId(u.id);
    const { error } = await supabase.from('profiles').update({ ativo: !u.ativo }).eq('id', u.id);
    if (!error) setUsers((prev) => prev.map((p) => (p.id === u.id ? { ...p, ativo: !u.ativo } : p)));
    setSavingId(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-6 space-y-5">
      <PageHeader title="Usuários" subtitle="Gerencie papéis e acessos da equipe" backTo="/" />

      <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 rounded-xl px-3 py-2.5 text-xs text-blue-700 dark:text-blue-300">
        <Info size={14} className="shrink-0 mt-0.5" />
        <span>
          Novos usuários se cadastram pela tela de login (aba "Criar conta"). Eles entram automaticamente
          como <strong>Técnico de Manutenção</strong> — reclassifique como <strong>Técnico LA</strong>,{' '}
          <strong>supervisor</strong> ou <strong>gestor</strong> aqui quando necessário.
        </span>
      </div>

      {/* Contagem — reflete os filtros aplicados abaixo, igual a um contador
          de resultado de busca (mesma lógica já usada nas listas de OS). */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Users size={16} />
          </div>
          <div>
            <p className="text-xl font-black text-slate-800 dark:text-slate-100 leading-none">{usersFiltrados.length}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mt-0.5">Total</p>
          </div>
        </div>
        {TODOS_OS_CARGOS.map((role) => {
          const RoleIcon = ROLE_ICON[role];
          return (
            <div key={role} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3">
              <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', ROLE_ICON_BG[role])}>
                <RoleIcon size={16} />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-black text-slate-800 dark:text-slate-100 leading-none">{contagemPorCargo[role]}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mt-0.5 truncate">{ROLE_LABEL[role]}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou e-mail..."
            className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={filtroCargo}
          onChange={(e) => setFiltroCargo(e.target.value as UserRole | 'todos')}
          className="px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
        >
          <option value="todos">Cargo (todos)</option>
          {TODOS_OS_CARGOS.map((role) => <option key={role} value={role}>{ROLE_LABEL[role]}</option>)}
        </select>
        <select
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value as 'todos' | 'ativo' | 'inativo')}
          className="px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
        >
          <option value="todos">Status (todos)</option>
          <option value="ativo">Ativos</option>
          <option value="inativo">Inativos</option>
        </select>
        {filtrosAtivos && (
          <button
            onClick={limparFiltros}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <X size={14} /> Limpar
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="animate-spin mr-2" size={18} /> Carregando...
        </div>
      ) : usersFiltrados.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-16">
          {busca.trim() ? `Nenhum usuário encontrado para "${busca}".` : 'Nenhum usuário corresponde aos filtros aplicados.'}
        </p>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
          {usersFiltrados.map((u) => {
            const pendente = pendingRoles[u.id];
            const papelExibido = pendente ?? u.role;
            const RoleIcon = ROLE_ICON[papelExibido];
            return (
            <div key={u.id} className="flex items-center gap-3 p-4">
              <div className={cn(
                'w-9 h-9 rounded-full flex items-center justify-center shrink-0',
                ROLE_ICON_BG[papelExibido],
                pendente && 'ring-2 ring-offset-2 ring-amber-400 dark:ring-offset-slate-900',
              )}>
                <RoleIcon size={16} />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                  {u.nome} {u.id === myProfile?.id && <span className="text-slate-400 font-medium">(você)</span>}
                </p>
                <p className="text-[11px] text-slate-400 truncate">{u.email} • {u.setor ?? SETOR_POR_ROLE[u.role]}</p>
              </div>

              {!u.ativo && (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400 shrink-0">
                  Inativo
                </span>
              )}

              {pendente ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        disabled={savingId === u.id}
                        title="Trocar cargo"
                        className={cn(
                          'text-[11px] font-bold px-3 py-1.5 rounded-lg border-2 border-dashed transition-colors disabled:opacity-50',
                          ROLE_STYLE[papelExibido],
                        )}
                      >
                        {ROLE_LABEL[papelExibido]}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {TODOS_OS_CARGOS.map((role) => (
                        <DropdownMenuItem key={role} onClick={() => selecionarRole(u, role)} className="flex items-center gap-2">
                          <span className="flex-1">{ROLE_LABEL[role]}</span>
                          {role === papelExibido && <Check size={14} className="text-amber-500" />}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <button
                    onClick={() => confirmarRole(u)}
                    disabled={savingId === u.id}
                    title="Confirmar novo cargo"
                    className="p-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
                  >
                    {savingId === u.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  </button>
                  <button
                    onClick={() => cancelarRole(u)}
                    disabled={savingId === u.id}
                    title="Cancelar"
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-50"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      disabled={u.id === myProfile?.id}
                      title="Trocar cargo"
                      className={cn(
                        'text-[11px] font-bold px-3 py-1.5 rounded-lg shrink-0 transition-colors disabled:opacity-50',
                        ROLE_STYLE[u.role],
                      )}
                    >
                      {ROLE_LABEL[u.role]}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {TODOS_OS_CARGOS.map((role) => (
                      <DropdownMenuItem key={role} onClick={() => selecionarRole(u, role)} className="flex items-center gap-2">
                        <span className="flex-1">{ROLE_LABEL[role]}</span>
                        {role === u.role && <Check size={14} className="text-amber-500" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              <button
                onClick={() => toggleAtivo(u)}
                disabled={savingId === u.id || u.id === myProfile?.id}
                className="text-[11px] font-bold px-3 py-1.5 rounded-lg shrink-0 border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                {u.ativo ? 'Desativar' : 'Ativar'}
              </button>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
