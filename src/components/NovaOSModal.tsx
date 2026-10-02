import React from 'react';
import { FileText, Wrench } from 'lucide-react';
import { Modal } from '@/components/Modal';

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
    <Modal title="O que você quer criar?" onClose={onClose} sheet={false}>

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
    </Modal>
  );
}
