import { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModalProps {
  title: string;
  /** Linha de apoio sob o título (ex: número da OS, o que a tela faz). */
  subtitle?: ReactNode;
  onClose: () => void;
  /** `md` para formulários; `sm` para diálogos curtos (delegar, confirmar). */
  size?: 'sm' | 'md';
  /** No celular sobe de baixo como uma folha. Desligue para diálogos curtos, que ficam centralizados. */
  sheet?: boolean;
  /** Só para um modal que abre por cima de outro. */
  zClass?: string;
  /** O corpo traz o próprio espaçamento (`p-5`), porque cada tela organiza as seções de um jeito. */
  children: ReactNode;
}

/**
 * Casca dos modais do app.
 *
 * Clicar fora NÃO fecha, e isso é de propósito: estes modais são formulários
 * (nova OS, nova certificação, registrar pendência), e um toque fora do cartão
 * apagava tudo que a pessoa tinha digitado — sem aviso e sem como desfazer.
 * No celular, onde o cartão ocupa quase a tela toda, esbarrar na borda é fácil.
 * Sair é sempre por um botão explícito: o X do cabeçalho, que fica preso no
 * topo mesmo com o conteúdo rolando, ou o "Cancelar" do rodapé quando a tela
 * tem um.
 *
 * Esc também não fecha, pelo mesmo motivo — e porque com um <select> aberto o
 * Esc é tecla de uso normal, que a pessoa não espera que feche o formulário.
 *
 * Isto vale para modal com conteúdo a perder. Visualizador de foto e vídeo
 * continua fechando no clique fora: ali não há nada a perder e o gesto é o
 * que se espera.
 */
export function Modal({
  title,
  subtitle,
  onClose,
  size = 'md',
  sheet = true,
  zClass = 'z-[1000]',
  children,
}: ModalProps) {
  return (
    <div
      className={cn(
        'fixed inset-0 flex justify-center',
        zClass,
        sheet ? 'items-end sm:items-center p-0 sm:p-4' : 'items-center p-4',
      )}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      <div
        className={cn(
          'relative bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-700 w-full',
          size === 'md' ? 'max-w-md' : 'max-w-sm',
          sheet
            ? 'rounded-t-2xl sm:rounded-2xl max-h-[85vh] overflow-y-auto'
            : 'rounded-2xl overflow-hidden animate-in zoom-in-95 duration-200',
        )}
      >
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-3 sticky top-0 bg-white dark:bg-slate-900 z-10">
          <div className="min-w-0">
            <h2 className="text-base font-black text-slate-800 dark:text-slate-100 truncate">{title}</h2>
            {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0"
            aria-label="Fechar"
          >
            <X className="icon-md" />
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}
