import React from 'react';
import { FileText, Wrench, X } from 'lucide-react';

interface NovaOSModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectRelatorio: () => void;
  onSelectManutencao: () => void;
}

export function NovaOSModal({
  isOpen,
  onClose,
  onSelectRelatorio,
  onSelectManutencao,
}: NovaOSModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      <div
        className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-base font-black text-slate-800 dark:text-slate-100">
            O que você quer criar?
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            aria-label="Fechar"
          >
            <X className="icon-md" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
            Escolha o tipo de ordem que deseja criar:
          </p>

          <button
            onClick={onSelectRelatorio}
            className="w-full flex items-center gap-4 p-4 rounded-xl border border-blue-100 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-900/10 hover:bg-blue-100 dark:hover:bg-blue-900/20 transition-colors text-left group"
          >
            <div className="bg-blue-600 p-2.5 rounded-lg text-white group-hover:scale-105 transition-transform shrink-0">
              <FileText className="icon-lg" />
            </div>
            <div>
              <span className="block font-bold text-blue-900 dark:text-blue-300">
                Relatório Fotográfico
              </span>
              <span className="text-xs text-blue-600/70 dark:text-blue-400/70">
                Relatório fotográfico com checklist e exportação PDF/Word
              </span>
            </div>
          </button>

          <button
            onClick={onSelectManutencao}
            className="w-full flex items-center gap-4 p-4 rounded-xl border border-amber-100 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/10 hover:bg-amber-100 dark:hover:bg-amber-900/20 transition-colors text-left group"
          >
            <div className="bg-amber-500 p-2.5 rounded-lg text-white group-hover:scale-105 transition-transform shrink-0">
              <Wrench className="icon-lg" />
            </div>
            <div>
              <span className="block font-bold text-amber-900 dark:text-amber-300">
                Manutenção
              </span>
              <span className="text-xs text-amber-600/70 dark:text-amber-400/70">
                OS de campo — execução, ocorrências, materiais e aprovação
              </span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
