// @ts-nocheck
import React, { useState } from 'react';
import { FileText, FileDown, X, Loader2 } from 'lucide-react';
import { useReport } from '@/contexts/ReportContext';
import { generateZAAZReport } from '@/lib/docxGenerator';
// 💡 Alterado: Importamos apenas a função do novo motor consolidado
import { runConsolidatedPDF } from '@/lib/pdfEngine'; 
import { toast } from '@/hooks/use-toast';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose }) => {
  const { photos, config } = useReport();
  const [loadingType, setLoadingType] = useState<'pdf' | 'docx' | null>(null);

  if (!isOpen) return null;

  // ===== 1. Handler de Exportação Corrigido =====
  const handleExport = async (type: 'pdf' | 'docx') => {
    if (!photos || photos.length === 0) {
      toast({ title: "Atenção", description: "Adicione fotos primeiro.", variant: "destructive" });
      return;
    }

    try {
      setLoadingType(type);
      
      if (type === 'docx') {
        // Motor DOCX (Existente)
        await generateZAAZReport({ config, photos });
      } else {
        // 💡 CRÍTICO: Agora chamamos a função runConsolidatedPDF que criamos no pdfEngine.ts
        // Esta é a função que contém o cabeçalho fiel à foto meta.
        await runConsolidatedPDF({ config, photos });
      }

      toast({ title: "Sucesso!", description: `Relatório ${type.toUpperCase()} gerado.` });
      onClose();
    } catch (error) {
      console.error("Erro Exportação:", error);
      toast({ title: "Erro", description: "Falha ao gerar arquivo.", variant: "destructive" });
    } finally {
      setLoadingType(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[999] p-4 text-slate-900">
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl border border-white/20 overflow-hidden animate-in zoom-in duration-200">
        
        {/* Header */}
        <div className="p-5 border-b flex justify-between items-center bg-slate-50">
          <h2 className="text-lg font-bold">Imprimir Relatório</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        {/* Opções de Download */}
        <div className="p-5 space-y-3">
          {/* Botão Word */}
          <button
            onClick={() => handleExport('docx')}
            disabled={loadingType !== null}
            className="w-full flex items-center gap-4 p-4 rounded-xl border border-blue-100 bg-blue-50 hover:bg-blue-100 transition-colors group"
          >
            <div className="bg-blue-600 p-2.5 rounded-lg text-white group-hover:scale-105 transition-transform">
              {loadingType === 'docx' ? <Loader2 className="animate-spin" /> : <FileDown size={24} />}
            </div>
            <div className="text-left">
              <span className="block font-bold text-blue-900">Word (.docx)</span>
              <span className="text-xs text-blue-600/70">Editável • Escala 2x</span>
            </div>
          </button>

          {/* Botão PDF (Agora vinculado ao motor consolidado) */}
          <button
            onClick={() => handleExport('pdf')}
            disabled={loadingType !== null}
            className="w-full flex items-center gap-4 p-4 rounded-xl border border-red-100 bg-red-50 hover:bg-red-100 transition-colors group"
          >
            <div className="bg-red-600 p-2.5 rounded-lg text-white group-hover:scale-105 transition-transform">
              {loadingType === 'pdf' ? <Loader2 className="animate-spin" /> : <FileText size={24} />}
            </div>
            <div className="text-left">
              <span className="block font-bold text-red-900">PDF (.pdf)</span>
              <span className="text-xs text-red-600/70">Modelo Consolidado ZAAZ</span>
            </div>
          </button>
        </div>

        {/* Rodapé Interno */}
        <div className="py-2 bg-slate-100 text-center">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">ZAAZ SYSTEM • V4.0</span>
        </div>
      </div>
    </div>
  );
};