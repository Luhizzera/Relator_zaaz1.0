import { useEffect, useState } from 'react';
import { X, User, Loader2 } from 'lucide-react';
import { supabase, ProfileRow } from '@/lib/supabaseClient';
import { listEquipesDoSupervisor } from '@/lib/manutencaoService';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

interface DelegarTecnicoModalProps {
  isOpen: boolean;
  ordemNumero: string;
  onClose: () => void;
  onConfirm: (tecnicoId: string, tecnicoNome: string) => void;
}

/**
 * Lista só os Técnicos de MANUTENÇÃO ativos (quem executa o reparo — o
 * Técnico LA identifica o problema e abre a OS, mas não entra aqui) vindos
 * de `profiles` (fonte real — mesma tabela que UserManagement.tsx usa), e
 * devolve o ID escolhido pro caller persistir na OS (assignTecnico grava
 * tecnico_id, uuid real — não mais o nome).
 *
 * Supervisor só vê os técnicos da(s) equipe(s) que ele mesmo administra
 * (ver MinhaEquipe.tsx); gestor vê todos, sem filtro de equipe.
 */
export function DelegarTecnicoModal({ isOpen, ordemNumero, onClose, onConfirm }: DelegarTecnicoModalProps) {
  const { isSupervisor, profile } = useAuth();
  const [tecnicos, setTecnicos] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ProfileRow | null>(null);
  const [semEquipe, setSemEquipe] = useState(false);
  // Trava o botão assim que confirma — sem isso, um duplo clique dispara
  // onConfirm duas vezes antes do caller fechar o modal (o fechamento só
  // acontece depois do assignTecnico() resolver lá no componente pai),
  // gerando delegação e linha de histórico repetidas.
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setSelected(null);
    setSemEquipe(false);
    setConfirmando(false);

    (async () => {
      try {
        let query = supabase
          .from('profiles')
          .select('*')
          .eq('role', 'tecnico_manutencao')
          .eq('ativo', true)
          .order('nome');

        if (isSupervisor && profile) {
          const equipes = await listEquipesDoSupervisor(profile.id);
          if (equipes.length === 0) {
            setTecnicos([]);
            setSemEquipe(true);
            setLoading(false);
            return;
          }
          query = query.in('equipe_id', equipes.map((e) => e.id));
        }

        const { data, error } = await query;
        if (error) throw error;
        setTecnicos((data ?? []) as ProfileRow[]);
      } catch (err) {
        console.error('[Delegar] Erro ao carregar técnicos:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [isOpen, isSupervisor, profile]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-black text-slate-800 dark:text-slate-100">Delegar OS</h2>
            <p className="text-xs text-slate-400">{ordemNumero}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-2 max-h-80 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-slate-400">
              <Loader2 className="animate-spin mr-2" size={16} /> Carregando técnicos...
            </div>
          ) : semEquipe ? (
            <p className="text-xs text-slate-400 text-center py-8">
              Você ainda não administra nenhuma equipe. Crie uma em &quot;Minha Equipe&quot; e adicione técnicos antes de delegar.
            </p>
          ) : tecnicos.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8">
              Nenhum técnico de manutenção ativo na sua equipe. Cadastre em &quot;Usuários&quot; ou adicione em &quot;Minha Equipe&quot;.
            </p>
          ) : (
            tecnicos.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelected(t)}
                className={cn(
                  'w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors',
                  selected?.id === t.id
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
            onClick={() => {
              if (!selected || confirmando) return;
              setConfirmando(true);
              onConfirm(selected.id, selected.nome);
            }}
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
