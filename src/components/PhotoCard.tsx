// src/components/PhotoCard.tsx

import { useState } from 'react';
import { X } from 'lucide-react';
import { Photo } from '@/types/report';
import { cn } from '@/lib/utils'; // O utilitário 'cn' será usado para aplicar as classes

interface PhotoCardProps {
  photo: Photo;
  onUpdateDescription: (description: string) => void;
  onRemove: () => void;
}

// 1. Definição das Opções Fixas
const CHECKLIST_OPTIONS = [
  'Instalado no cabo de fibra a Placa de Identificação',
  'Não temos ativo de rede de cabo de fibra óptica Zaaz nesse local',
  'Instalado no cabo de fibra a Placa de Identificação e executado adequações',
  'Este poste é de propriedade particular',
  'Obs. : Os cabos e equipamentos soltos existentes, são de terceiros',
];

// Funções auxiliares (inalteradas)
const serializeOptions = (selected: string[]): string => {
    return selected.join('||');
};

const deserializeOptions = (description: string): string[] => {
    return description ? description.split('||').filter(item => item.trim() !== '') : [];
};


export function PhotoCard({ photo, onUpdateDescription, onRemove }: PhotoCardProps) {
  const [selectedOptions, setSelectedOptions] = useState<string[]>(
    deserializeOptions(photo.description)
  );

  const handleToggleOption = (option: string) => {
    const isSelected = selectedOptions.includes(option);
    let newOptions: string[];

    if (isSelected) {
      newOptions = selectedOptions.filter(item => item !== option);
    } else {
      newOptions = [...selectedOptions, option];
    }

    setSelectedOptions(newOptions);
    onUpdateDescription(serializeOptions(newOptions));
  };

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {/* ... Bloco da Imagem inalterado ... */}
      <div className="relative aspect-video bg-muted">
        <img
          src={photo.src}
          alt={selectedOptions.join(', ') || 'Foto do relatório'} 
          className="w-full h-full object-cover"
        />
        <button
          onClick={onRemove}
          className="absolute top-2 right-2 p-1.5 bg-destructive text-destructive-foreground rounded-full hover:bg-destructive/90 transition-colors"
          aria-label="Remover foto"
        >
          <X size={16} />
        </button>
      </div>
      
      {/* CORREÇÃO DE LEGIBILIDADE NO MODO ESCURO */}
      <div className="p-3 space-y-2">
        {/* 1. Título do Checklist: Dark Mode usa text-gray-100 */}
        <p className={cn(
            "text-sm font-medium text-gray-700",
            "dark:text-gray-100" // Cor clara para o modo escuro
        )}>
            Selecione o Status da Foto (Obrigatório):
        </p>
        
        {CHECKLIST_OPTIONS.map((option, index) => (
          <div key={index} className="flex items-start space-x-2">
            <input
              type="checkbox"
              id={`option-${photo.id}-${index}`}
              checked={selectedOptions.includes(option)}
              onChange={() => handleToggleOption(option)}
              className="mt-1 h-4 w-4 text-ring border-gray-300 rounded focus:ring-ring"
            />
            {/* 2. Rótulos das Opções: Dark Mode usa text-gray-200 */}
            <label 
              htmlFor={`option-${photo.id}-${index}`} 
              className={cn(
                  "text-sm cursor-pointer select-none text-gray-800",
                  "dark:text-gray-200" // Cor clara para o modo escuro
              )}
            >
              {option}
            </label>
          </div>
        ))}
        
        {/* 3. Alerta de Obrigatório: Dark Mode usa text-red-400 (mais visível em fundo escuro) */}
        {selectedOptions.length === 0 && (
            <p className={cn(
                "text-xs text-red-600 pt-2",
                "dark:text-red-400"
            )}>
                Selecione pelo menos uma opção.
            </p>
        )}
      </div>
    </div>
  );
}