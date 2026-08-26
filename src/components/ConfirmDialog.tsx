// @ts-nocheck
import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'default';
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // Trava o botão assim que confirma, até o onConfirm (que costuma ser uma
  // exclusão async) terminar — sem isso, um duplo clique disparava a ação
  // destrutiva duas vezes antes do caller fechar o diálogo. Reseta sempre
  // que o diálogo reabre, já que o componente fica montado (retornando
  // null) entre um uso e outro, não perde esse estado sozinho.
  const [confirmando, setConfirmando] = useState(false);
  useEffect(() => { if (isOpen) setConfirmando(false); }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (confirmando) return;
    setConfirmando(true);
    try {
      await onConfirm();
    } finally {
      setConfirmando(false);
    }
  };

  const confirmColors = {
    danger:  'bg-red-600 hover:bg-red-700 text-white',
    warning: 'bg-amber-500 hover:bg-amber-600 text-white',
    default: 'bg-primary hover:bg-primary/90 text-primary-foreground',
  };

  const iconColors = {
    danger:  'text-red-500',
    warning: 'text-amber-500',
    default: 'text-primary',
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
      onClick={onCancel}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Dialog */}
      <div
        className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={cn(
              'flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center',
              variant === 'danger'  && 'bg-red-100 dark:bg-red-900/30',
              variant === 'warning' && 'bg-amber-100 dark:bg-amber-900/30',
              variant === 'default' && 'bg-primary/10',
            )}>
              <AlertTriangle className={cn('icon-md', iconColors[variant])} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {title}
              </h3>
              {description && (
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                  {description}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onCancel}
            disabled={confirmando}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors active:scale-[0.98] disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={confirmando}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors active:scale-[0.98] disabled:opacity-60',
              confirmColors[variant],
            )}
          >
            {confirmando && <Loader2 className="icon-sm animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
