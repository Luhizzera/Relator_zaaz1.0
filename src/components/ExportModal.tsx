// @ts-nocheck
import React, { useState } from 'react';
import { FileText, FileDown, X, Loader2, Share2, ImageIcon, MapPin, AlertCircle } from 'lucide-react';
import { saveAs } from 'file-saver';
import { useOrders } from '@/contexts/OrdersContext';
import { generateZAAZReport } from '@/lib/docxGenerator';
import { runConsolidatedPDF } from '@/lib/pdfEngine';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose }) => {
  const { photos, config, marcarRelatorioExportado } = useOrders();
  const [loadingType, setLoadingType] = useState<'pdf' | 'docx' | null>(null);

  if (!isOpen) return null;

  // Estatísticas do relatório para o preview
  const totalPhotos     = photos.length;
  const totalPages      = Math.ceil(totalPhotos / 4) || 1;
  const withGeo         = photos.filter((p) => p.location).length;
  const withoutDesc     = photos.filter((p) => !p.description || p.description.trim() === '').length;
  const cleanRef        = config?.codigoReferencia || '—';
  const cleanLocal      = config?.local || '—';
  const canShare        = typeof navigator !== 'undefined' && !!navigator.share;

  const handleExport = async (type: 'pdf' | 'docx') => {
    if (!photos || photos.length === 0) {
      toast({ title: 'Atenção', description: 'Adicione fotos primeiro.', variant: 'destructive' });
      return;
    }

    try {
      setLoadingType(type);

      const fileName = `RESP.NOT-${cleanRef}.${type}`;
      const blob: Blob | void = type === 'docx'
        ? await generateZAAZReport({ config, photos, returnBlob: true })
        : await runConsolidatedPDF({ config, photos, returnBlob: true });

      if (!blob) throw new Error('Falha ao gerar o arquivo.');

      // Baixa localmente...
      saveAs(blob, fileName);

      // ...e guarda a mesma versão na OS (substitui a anterior — só uma versão
      // é mantida), marcando a OS como 'exportada'.
      try {
        await marcarRelatorioExportado(blob, type);
      } catch (persistErr) {
        console.error('[Export] Erro ao salvar relatório na OS:', persistErr);
        toast({
          title: 'Arquivo baixado, mas não guardado na OS',
          description: 'O download funcionou, mas não deu pra salvar a versão no sistema. Tente novamente.',
          variant: 'destructive',
        });
      }

      toast({ title: 'Sucesso!', description: `Relatório ${type.toUpperCase()} gerado.` });

      // Web Share API — só disponível em mobile/contextos seguros
      if (canShare) {
        try {
          const file = new File([blob], fileName, { type: blob.type });
          if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], title: `Relatório ${cleanRef}` });
          }
        } catch (shareErr) {
          // Usuário cancelou o share — não é erro
          if (shareErr?.name !== 'AbortError') {
            console.warn('[Share]', shareErr);
          }
        }
      }

      onClose();
    } catch (error) {
      console.error('Erro Exportação:', error);
      toast({ title: 'Erro', description: 'Falha ao gerar arquivo.', variant: 'destructive' });
    } finally {
      setLoadingType(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[999] p-4 text-slate-900 dark:text-slate-100">
      <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl border border-white/20 dark:border-slate-700 overflow-hidden animate-in zoom-in duration-200">

        {/* Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/60">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Imprimir Relatório</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300">
            <X size={20} />
          </button>
        </div>

        {/* Preview do relatório */}
        <div className="px-5 pt-4 pb-3 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3">Resumo</p>

          <div className="grid grid-cols-3 gap-2">
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 text-center">
              <p className="text-xl font-black text-slate-800 dark:text-slate-100">{totalPhotos}</p>
              <p className="text-[9px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider mt-0.5">Fotos</p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 text-center">
              <p className="text-xl font-black text-slate-800 dark:text-slate-100">{totalPages}</p>
              <p className="text-[9px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider mt-0.5">Páginas</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 text-center">
              <p className="text-xl font-black text-blue-700 dark:text-blue-400">{withGeo}</p>
              <p className="text-[9px] text-blue-500 dark:text-blue-400/80 uppercase font-bold tracking-wider mt-0.5 flex items-center justify-center gap-0.5">
                <MapPin size={8} />GPS
              </p>
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl px-3 py-2.5 space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Referência</span>
              <span className="font-bold text-slate-800 dark:text-slate-100">{cleanRef}</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Local</span>
              <span className="font-bold text-slate-800 dark:text-slate-100 text-right max-w-[60%] truncate">{cleanLocal}</span>
            </div>
          </div>

          {/* Alerta de fotos sem descrição */}
          {withoutDesc > 0 && (
            <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-xl px-3 py-2.5">
              <AlertCircle size={14} className="text-amber-500 shrink-0" />
              <p className="text-[11px] text-amber-700 dark:text-amber-400 font-bold">
                {withoutDesc} foto{withoutDesc > 1 ? 's' : ''} sem descrição marcada
              </p>
            </div>
          )}

          {/* Badge de Web Share disponível */}
          {canShare && (
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500 font-medium px-1">
              <Share2 size={10} />
              <span>Compartilhamento direto disponível após gerar</span>
            </div>
          )}
        </div>

        {/* Botões de exportação */}
        <div className="px-5 pb-5 space-y-3">
          <button
            onClick={() => handleExport('docx')}
            disabled={loadingType !== null}
            className="w-full flex items-center gap-4 p-4 rounded-xl border border-blue-100 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-900/10 hover:bg-blue-100 dark:hover:bg-blue-900/20 transition-colors group disabled:opacity-60"
          >
            <div className="bg-blue-600 p-2.5 rounded-lg text-white group-hover:scale-105 transition-transform">
              {loadingType === 'docx' ? <Loader2 className="animate-spin" size={24} /> : <FileDown size={24} />}
            </div>
            <div className="text-left">
              <span className="block font-bold text-blue-900 dark:text-blue-300">Word (.docx)</span>
              <span className="text-xs text-blue-600/70 dark:text-blue-400/70">Editável • Escala 2x</span>
            </div>
          </button>

          <button
            onClick={() => handleExport('pdf')}
            disabled={loadingType !== null}
            className="w-full flex items-center gap-4 p-4 rounded-xl border border-red-100 dark:border-red-900/40 bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors group disabled:opacity-60"
          >
            <div className="bg-red-600 p-2.5 rounded-lg text-white group-hover:scale-105 transition-transform">
              {loadingType === 'pdf' ? <Loader2 className="animate-spin" size={24} /> : <FileText size={24} />}
            </div>
            <div className="text-left">
              <span className="block font-bold text-red-900 dark:text-red-300">PDF (.pdf)</span>
              <span className="text-xs text-red-600/70 dark:text-red-400/70">Modelo Consolidado ZAAZ</span>
            </div>
          </button>
        </div>

        <div className="py-2 bg-slate-100 dark:bg-slate-800/60 text-center">
          <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter">ZAAZ SYSTEM • V5.0</span>
        </div>
      </div>
    </div>
  );
};
