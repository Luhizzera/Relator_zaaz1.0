// @ts-nocheck
import React, { useState, useEffect, useCallback, memo } from 'react';
import { Trash2, Edit, MapPin, MapPinOff } from 'lucide-react';
import { Photo } from '@/types/report';
import { cn } from '@/lib/utils';
import { useReport, DEFAULT_CHECKLIST } from '@/contexts/OrdersContext';
import { Textarea } from './ui/textarea';

interface PhotoCardProps {
  photo: Photo;
  index: number;
  onUpdateDescription: (description: string) => void;
  onRemove: () => void;
}

const serializeOptions   = (selected: string[]): string => selected.join('||');
const deserializeOptions = (description: string): string[] =>
  description ? description.split('||').filter((item) => item.trim() !== '') : [];

export const PhotoCard = memo(function PhotoCard({
  photo,
  index,
  onUpdateDescription,
  onRemove,
}: PhotoCardProps) {
  const { updatePhotoObservacoes, config } = useReport();

  // Usa o checklist do preset ativo; cai para o padrão se não houver
  const checklistOptions: string[] =
    config.checklistOptions?.length ? config.checklistOptions : DEFAULT_CHECKLIST;

  const [observacoesLocal, setObservacoesLocal] = useState(photo.observacoes || '');
  const [selectedOptions, setSelectedOptions]   = useState<string[]>(
    deserializeOptions(photo.description),
  );
  const [customOption, setCustomOption] = useState('');
  const [showCustom, setShowCustom]     = useState(false);

  useEffect(() => {
    setObservacoesLocal(photo.observacoes || '');
    setSelectedOptions(deserializeOptions(photo.description));
  }, [photo.id]);

  const handleToggleOption = useCallback(
    (option: string) => {
      setSelectedOptions((prev) => {
        const next = prev.includes(option)
          ? prev.filter((i) => i !== option)
          : [...prev, option];
        onUpdateDescription(serializeOptions(next));
        return next;
      });
    },
    [onUpdateDescription],
  );

  const handleAddCustom = useCallback(() => {
    const trimmed = customOption.trim();
    if (!trimmed) return;
    setSelectedOptions((prev) => {
      if (prev.includes(trimmed)) return prev;
      const next = [...prev, trimmed];
      onUpdateDescription(serializeOptions(next));
      return next;
    });
    setCustomOption('');
    setShowCustom(false);
  }, [customOption, onUpdateDescription]);

  const handleRemoveCustom = useCallback(
    (option: string) => {
      setSelectedOptions((prev) => {
        const next = prev.filter((i) => i !== option);
        onUpdateDescription(serializeOptions(next));
        return next;
      });
    },
    [onUpdateDescription],
  );

  const handleObservacoesChange = useCallback(
    (text: string) => {
      setObservacoesLocal(text);
      updatePhotoObservacoes(photo.id, text);
    },
    [photo.id, updatePhotoObservacoes],
  );

  // Itens selecionados que são personalizados (não estão no checklist do preset)
  const customSelected = selectedOptions.filter((o) => !checklistOptions.includes(o));
  const markedCount    = selectedOptions.length;

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden shadow-sm hover:shadow-md transition-all">

      {/* Imagem */}
      <div className="relative aspect-video bg-muted">
        <img
          src={photo.src}
          alt={`Foto ${index + 1} do relatório`}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover"
        />
        <button
          onClick={onRemove}
          className="absolute top-2 right-2 p-1.5 bg-destructive text-destructive-foreground rounded-full hover:bg-destructive/90 transition-colors shadow-lg"
          aria-label="Remover foto"
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div className="p-3 space-y-3">

        {/* Badge de localização — mesmo termo (GPS) usado em toda a Localização
            da foto/OS; nunca foi UTM de verdade (é lat/long puro do
            navegador), então padronizamos o rótulo pra não confundir os dois
            sistemas de coordenadas. */}
        {photo.location ? (
          <div className="flex items-center gap-2 px-2.5 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-[#1A1AFF] dark:text-blue-400 rounded-md border border-blue-100 dark:border-blue-800/50 animate-in fade-in slide-in-from-top-1">
            <MapPin size={12} className="shrink-0" />
            <div className="flex flex-col">
              <span className="text-[9px] uppercase font-black tracking-tighter opacity-70">Coordenadas (GPS)</span>
              <span className="text-[10px] font-mono font-bold leading-none">{photo.location}</span>
            </div>
          </div>
        ) : photo.geoAttempted ? (
          <div className="flex items-center gap-2 px-2.5 py-1.5 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-md border border-amber-100 dark:border-amber-800/50">
            <MapPinOff size={12} className="shrink-0" />
            <span className="text-[10px] font-bold leading-none">GPS indisponível nesta foto</span>
          </div>
        ) : null}

        {/* Cabeçalho do checklist com contador */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-card-foreground flex items-center gap-2">
            <Edit size={14} /> Descrição da Foto:
          </h3>
          <span className={cn(
            'text-[10px] font-black px-1.5 py-0.5 rounded-full',
            markedCount === 0
              ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
              : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
          )}>
            {markedCount > 0 ? `${markedCount} marcado${markedCount > 1 ? 's' : ''}` : '* obrigatório'}
          </span>
        </div>

        {/* Checklist do preset ativo */}
        <div className="space-y-2 border-b border-border/50 pb-3">
          {checklistOptions.map((option, i) => (
            <div key={i} className="flex items-start space-x-2">
              <input
                type="checkbox"
                id={`option-${photo.id}-${i}`}
                checked={selectedOptions.includes(option)}
                onChange={() => handleToggleOption(option)}
                className="mt-1 h-3.5 w-3.5 text-[#1A1AFF] border-gray-300 rounded focus:ring-[#1A1AFF]"
              />
              <label
                htmlFor={`option-${photo.id}-${i}`}
                className="text-[13px] cursor-pointer select-none text-gray-800 dark:text-gray-200 leading-tight"
              >
                {option}
              </label>
            </div>
          ))}

          {/* Itens personalizados já adicionados */}
          {customSelected.map((option, i) => (
            <div key={`custom-${i}`} className="flex items-start space-x-2">
              <input
                type="checkbox"
                checked
                onChange={() => handleRemoveCustom(option)}
                className="mt-1 h-3.5 w-3.5 text-[#1A1AFF] border-gray-300 rounded focus:ring-[#1A1AFF]"
              />
              <label className="text-[13px] cursor-pointer select-none text-gray-800 dark:text-gray-200 leading-tight flex-1 italic">
                {option}
              </label>
            </div>
          ))}

          {/* Campo "Outro" */}
          {showCustom ? (
            <div className="flex gap-2 mt-1">
              <input
                autoFocus
                type="text"
                value={customOption}
                onChange={(e) => setCustomOption(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddCustom(); if (e.key === 'Escape') setShowCustom(false); }}
                placeholder="Digite o item..."
                className="flex-1 text-[12px] px-2 py-1.5 border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button onClick={handleAddCustom} className="text-[11px] font-bold px-2 py-1.5 bg-primary text-primary-foreground rounded-md">OK</button>
              <button onClick={() => setShowCustom(false)} className="text-[11px] font-bold px-2 py-1.5 border border-border rounded-md">✕</button>
            </div>
          ) : (
            <button
              onClick={() => setShowCustom(true)}
              className="text-[11px] text-muted-foreground hover:text-foreground font-bold flex items-center gap-1 mt-1 transition-colors"
            >
              + Outro (personalizado)
            </button>
          )}
        </div>

        {/* Observações */}
        <div className="flex flex-col space-y-2">
          <Textarea
            rows={2}
            value={observacoesLocal}
            onChange={(e) => handleObservacoesChange(e.target.value)}
            placeholder="Observações adicionais..."
            className="text-[13px] min-h-[60px] resize-none"
          />
        </div>
      </div>
    </div>
  );
});
