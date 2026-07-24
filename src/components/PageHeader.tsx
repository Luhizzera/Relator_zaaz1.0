import { ReactNode } from 'react';
import { Menu } from 'lucide-react';
import { BackButton, iconChipButtonClass } from './BackButton';
import { ThemeToggle } from './ThemeToggle';
import { useAuth } from '@/contexts/AuthContext';
import { useSidebar } from '@/contexts/SidebarContext';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  /** Rota explícita para onde voltar. Se omitido, usa navigate(-1). */
  backTo?: string;
  /** Permite ocultar o botão voltar (ex: telas raiz). Padrão: true. */
  showBack?: boolean;
  /** Conteúdo à direita do header (ex: botão "Nova OS"). */
  rightContent?: ReactNode;
  /** Permite ocultar o botão de tema, caso a tela já tenha o seu próprio. Padrão: true. */
  showThemeToggle?: boolean;
  className?: string;
}

/**
 * Header padrão usado nas telas de TOPO do app (Dashboard, Ordens, Usuários,
 * Manutenção...) — não nas de detalhe (dentro de uma OS específica, que
 * usam BackButton direto porque ali "voltar" é uma ação contextual).
 *
 * Gestor/supervisor veem um botão ☰ que abre a sidebar global em vez do
 * "voltar" — faz mais sentido pra quem navega entre várias seções de topo o
 * dia todo. Técnico continua vendo o "voltar" normal.
 */
export function PageHeader({
  title,
  subtitle,
  backTo,
  showBack = true,
  rightContent,
  showThemeToggle = true,
  className,
}: PageHeaderProps) {
  const { canManageOrders } = useAuth();
  const { open: openSidebar } = useSidebar();

  return (
    <div className={cn('flex items-center justify-between gap-3 flex-wrap', className)}>
      <div className="flex items-center gap-3 min-w-0">
        {showBack && (
          canManageOrders
            ? (
              <button
                onClick={openSidebar}
                aria-label="Abrir menu"
                title="Menu"
                className={iconChipButtonClass}
              >
                <Menu size={18} />
              </button>
            )
            : <BackButton to={backTo} />
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-black text-slate-800 dark:text-slate-100 truncate">{title}</h1>
          {subtitle && <div className="text-sm text-slate-500">{subtitle}</div>}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {rightContent}
        {showThemeToggle && <ThemeToggle />}
      </div>
    </div>
  );
}
