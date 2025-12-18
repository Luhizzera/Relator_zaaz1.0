// src/components/PhotoCard.tsx

import { useState, useEffect } from 'react';
import { X, Edit, Trash2 } from 'lucide-react';
import { Photo } from '@/types/report';
import { cn } from '@/lib/utils';
import { useReport } from '@/contexts/ReportContext'; 
import { Textarea } from './ui/textarea'; // Importado para uso nas Observações

interface PhotoCardProps {
  photo: Photo;
  onUpdateDescription: (description: string) => void;
  onRemove: () => void;
}

// Opções Fixas (Checklist)
const CHECKLIST_OPTIONS = [
  'Instalado no cabo de fibra a Placa de Identificação',
  'Não temos ativo de rede de cabo de fibra óptica Zaaz nesse local',
  'Instalado no cabo de fibra a Placa de Identificação e executado adequações',
  'Este poste é de propriedade particular',
  'Os cabos e equipamentos soltos existentes, são de terceiros',
];

// Funções auxiliares (Mantidas)
const serializeOptions = (selected: string[]): string => {
    return selected.join('||');
};

const deserializeOptions = (description: string): string[] => {
    return description ? description.split('||').filter(item => item.trim() !== '') : [];
};


export function PhotoCard({ photo, onUpdateDescription, onRemove }: PhotoCardProps) {
  // Chamada para o novo método
  const { updatePhotoObservacoes } = useReport();
  
  // Usar 'observacoes' para o campo de observações (que agora é fixo)
  const [observacoesLocal, setObservacoesLocal] = useState(photo.observacoes || '');
  
  // Estado para o checklist existente (description)
  const [selectedOptions, setSelectedOptions] = useState<string[]>(
    deserializeOptions(photo.description)
  );

  // Sincroniza estado interno com props externas
  useEffect(() => {
    setObservacoesLocal(photo.observacoes || '');
    setSelectedOptions(deserializeOptions(photo.description)); 
  }, [photo]);

  const handleToggleOption = (option: string) => {
    const isSelected = selectedOptions.includes(option);
    let newOptions: string[];

    if (isSelected) {
      newOptions = selectedOptions.filter(item => item !== option);
    } else {
      newOptions = [...selectedOptions, option];
    }

    setSelectedOptions(newOptions);
    onUpdateDescription(serializeOptions(newOptions)); // Atualiza o campo 'description'
  };
  
  // Handler para atualizar o texto de Observações
  const handleObservacoesChange = (text: string) => {
    setObservacoesLocal(text);
    updatePhotoObservacoes(photo.id, text); // Persiste no campo observacoes do Contexto
  };
  
  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {/* Imagem e Botão de Remover */}
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
          <Trash2 size={16} />
        </button>
      </div>
      
      <div className="p-3 space-y-3">
        
        <h3 className="text-sm sm:text-base font-semibold text-card-foreground flex items-center gap-2 mb-1">
          <Edit size={16} /> Descrição da Foto:
        </h3>

        {/* --- 1. CHECKLIST EXISTENTE (PRIMEIRO LUGAR) --- */}
        <div className="space-y-2 border-b border-border/50 pb-3">
          <p className={cn(
              "text-sm font-medium text-gray-700",
              "dark:text-gray-100" 
          )}>
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
              <label 
                htmlFor={`option-${photo.id}-${index}`} 
                className={cn(
                    "text-sm cursor-pointer select-none text-gray-800",
                    "dark:text-gray-200" 
                )}
              >
                {option}
              </label>
            </div>
          ))}
          
          {/* Alerta de Obrigatório */}
          {selectedOptions.length === 0 && (
              <p className={cn(
                  "text-xs text-red-600 pt-2",
                  "dark:text-red-400"
              )}>
                  Selecione pelo menos uma opção.
              </p>
          )}
        </div>
        
        {/* --- 2. CAMPO DE OBSERVAÇÕES FIXO (AGORA ABAIXO DO CHECKLIST) --- */}
        <div className="flex flex-col space-y-2 pt-2">
            
            <Textarea 
                rows={2}
                value={observacoesLocal}
                onChange={(e) => handleObservacoesChange(e.target.value)}
                placeholder="Observações" 
                className="flex min-h-[50px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none transition-colors"
            />
        </div>
        
      </div>
    </div>
  );
}