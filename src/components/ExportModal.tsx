import { useState } from 'react';
import { X, FileText, File, Download, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReport } from '@/contexts/ReportContext';
import { generatePDF } from '@/lib/exportPdf';
import { generateDOCX } from '@/lib/exportDocx';
import { toast } from '@/hooks/use-toast';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ExportFormat = 'pdf' | 'docx';

export function ExportModal({ isOpen, onClose }: ExportModalProps) {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('pdf');
  const [isExporting, setIsExporting] = useState(false);
  const { getReportData } = useReport();

  if (!isOpen) return null;

  const handleExport = async () => {
    setIsExporting(true);
    const data = getReportData();

    try {
      if (selectedFormat === 'pdf') {
        await generatePDF(data);
        toast({
          title: 'PDF exportado com sucesso!',
          description: 'O download foi iniciado automaticamente.',
        });
      } else {
        await generateDOCX(data);
        toast({
          title: 'DOCX exportado com sucesso!',
          description: 'O download foi iniciado automaticamente.',
        });
      }
      onClose();
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: 'Erro ao exportar',
        description: 'Ocorreu um erro ao gerar o arquivo. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        className="bg-card rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-card-foreground">
            Exportar Relatório
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-muted transition-colors"
            aria-label="Fechar modal"
          >
            <X size={20} className="text-muted-foreground" />
          </button>
        </div>

        <div className="p-6">
          <p className="text-sm text-muted-foreground mb-4">
            Selecione o formato desejado para exportar seu relatório:
          </p>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <button
              onClick={() => setSelectedFormat('pdf')}
              className={cn(
                "flex flex-col items-center gap-3 p-6 rounded-lg border-2 transition-all",
                selectedFormat === 'pdf'
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground/50"
              )}
            >
              <FileText 
                size={40} 
                className={cn(
                  selectedFormat === 'pdf' ? "text-primary" : "text-muted-foreground"
                )} 
              />
              <span className={cn(
                "font-medium",
                selectedFormat === 'pdf' ? "text-primary" : "text-foreground"
              )}>
                PDF
              </span>
            </button>

            <button
              onClick={() => setSelectedFormat('docx')}
              className={cn(
                "flex flex-col items-center gap-3 p-6 rounded-lg border-2 transition-all",
                selectedFormat === 'docx'
                  ? "border-secondary bg-secondary/5"
                  : "border-border hover:border-muted-foreground/50"
              )}
            >
              <File 
                size={40} 
                className={cn(
                  selectedFormat === 'docx' ? "text-secondary" : "text-muted-foreground"
                )} 
              />
              <span className={cn(
                "font-medium",
                selectedFormat === 'docx' ? "text-secondary" : "text-foreground"
              )}>
                DOCX
              </span>
            </button>
          </div>

          <button
            onClick={handleExport}
            disabled={isExporting}
            className={cn(
              "w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-medium text-primary-foreground transition-all",
              selectedFormat === 'pdf' 
                ? "bg-primary hover:bg-primary/90" 
                : "bg-secondary hover:bg-secondary/90",
              isExporting && "opacity-70 cursor-not-allowed"
            )}
          >
            {isExporting ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                Exportando...
              </>
            ) : (
              <>
                <Download size={20} />
                Exportar Relatório em {selectedFormat.toUpperCase()}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
