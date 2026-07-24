import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

/**
 * Classe compartilhada do "chip" de ícone usado pelo botão voltar padrão
 * e por outros botões de ação de header (ex: menu da sidebar no Dashboard),
 * garantindo consistência visual entre eles.
 */
export const iconChipButtonClass = cn(
  'flex items-center justify-center w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-800',
  'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-300',
  'hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-100',
  'transition-colors shrink-0',
);

interface BackButtonProps {
  /** Rota explícita para onde voltar. Se omitido, usa navigate(-1) (histórico do navegador). */
  to?: string;
  /** Handler customizado (ex: voltar um passo dentro de um wizard). Tem prioridade sobre `to`. */
  onClick?: () => void;
  /** Texto acessível/visível do botão. */
  label?: string;
  /**
   * default    → botão "chip" com ícone, usado em headers estilo cartão (Dashboard, Listagens, etc).
   * ghost-dark → texto/ícone claro, para uso sobre headers com fundo escuro ou colorido (Config, Photos).
   * ghost-light→ texto discreto, para uso sobre headers claros sem "chip" (ex: cartões de detalhe).
   */
  variant?: 'default' | 'ghost-dark' | 'ghost-light';
  className?: string;
}

export function BackButton({ to, onClick, label = 'Voltar', variant = 'default', className }: BackButtonProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    if (onClick) { onClick(); return; }
    if (to) navigate(to);
    else navigate(-1);
  };

  if (variant === 'ghost-dark') {
    return (
      <button
        onClick={handleClick}
        aria-label={label}
        className={cn(
          'flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-white/80 hover:text-white transition-colors shrink-0',
          className,
        )}
      >
        <ArrowLeft size={16} />
        <span className="hidden xs:inline">{label}</span>
      </button>
    );
  }

  if (variant === 'ghost-light') {
    return (
      <button
        onClick={handleClick}
        aria-label={label}
        className={cn(
          'flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors shrink-0',
          className,
        )}
      >
        <ArrowLeft size={16} /> {label}
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      aria-label={label}
      title={label}
      className={cn(iconChipButtonClass, className)}
    >
      <ArrowLeft size={18} />
    </button>
  );
}
