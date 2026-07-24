import { useEffect } from 'react';
import { X, LayoutDashboard, ClipboardList, Wrench, ListChecks, Users, Users2, LogOut } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

interface AppSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Menu lateral (drawer) com navegação principal e logout.
 * Acionado a partir do botão de menu no header do Dashboard.
 */
export function AppSidebar({ isOpen, onClose }: AppSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, isGestor, canManageOrders, signOut } = useAuth();

  // Fecha com a tecla Esc
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const links = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/ordens', label: 'Relatórios', icon: ClipboardList },
    { to: '/manutencao', label: 'Manutenção', icon: Wrench },
    { to: '/manutencao/ordens', label: 'Ordens de Manutenção', icon: ListChecks },
    ...(canManageOrders ? [{ to: '/manutencao/equipe', label: isGestor ? 'Equipes' : 'Minha Equipe', icon: Users2 }] : []),
    ...(isGestor ? [{ to: '/usuarios', label: 'Usuários', icon: Users }] : []),
  ];

  const handleNavigate = (to: string) => {
    onClose();
    navigate(to);
  };

  const handleLogout = async () => {
    onClose();
    await signOut();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 bg-black/50 backdrop-blur-sm z-[1100] transition-opacity duration-200',
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside
        className={cn(
          'fixed top-0 left-0 h-full w-72 max-w-[85vw] bg-white dark:bg-slate-900 z-[1101] shadow-2xl',
          'flex flex-col transition-transform duration-300 ease-out',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Menu de navegação"
      >
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/images/logo-zaaz.jpeg"
              alt="ZAAZ"
              className="w-10 h-10 rounded-lg object-cover shrink-0"
            />
            <div className="min-w-0">
              <p className="text-sm font-black text-slate-800 dark:text-slate-100 truncate">
                {profile?.nome ?? 'Usuário'}
              </p>
              <p className="text-[11px] text-slate-400 truncate">{profile?.email}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0"
            aria-label="Fechar menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {links.map((link) => {
            const Icon = link.icon;
            const active = location.pathname === link.to;
            return (
              <button
                key={link.to}
                onClick={() => handleNavigate(link.to)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-colors text-left',
                  active
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800',
                )}
              >
                <Icon size={17} /> {link.label}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <LogOut size={17} /> Sair da conta
          </button>
        </div>
      </aside>
    </>
  );
}
