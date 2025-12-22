// @ts-nocheck
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Camera, FileDown, ArrowLeft, 
  ImagePlus, Trash2, Plus, Layout
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReport } from '@/contexts/ReportContext';
import { PhotoCard } from '@/components/PhotoCard';
import { ExportModal } from '@/components/ExportModal';
import { ThemeToggle } from '@/components/ThemeToggle';
import { CacheService } from '../lib/cacheService';
import { toast } from '@/hooks/use-toast';

export default function Photos() {
  const navigate = useNavigate();
  const { photos, addPhoto, updatePhotoDescription, removePhoto, config, clearAllPhotos } = useReport();
  
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isConfirmDeleteAllOpen, setIsConfirmDeleteAllOpen] = useState(false); // 🚀 Reativado
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  // ===== 1. Persistência e Recuperação =====
  useEffect(() => {
    const recovery = async () => {
      if (photos.length === 0) {
        const saved = await CacheService.recoverPhotos();
        if (saved) saved.forEach(p => addPhoto(p));
      }
    };
    recovery();
  }, []);

  useEffect(() => { CacheService.persistPhotos(photos); }, [photos]);

  // ===== 2. Lógica de Limpeza Total =====
  const handleClearAll = async () => {
    try {
      clearAllPhotos(); // Limpa o Contexto (Memória)
      await CacheService.clearCache(); // Limpa o Cache (Disco)
      setIsConfirmDeleteAllOpen(false);
      toast({
        title: "Galeria Limpa",
        description: "Todas as fotos e o cache foram removidos com sucesso.",
      });
    } catch (error) {
      console.error("Erro ao limpar:", error);
    }
  };

  const handleFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    for (const file of fileArray) {
      if (!file.type.startsWith('image/')) continue;
      const reader = new FileReader();
      reader.onload = (e) => {
        addPhoto({
          id: `p-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          src: e.target?.result as string,
          description: ''
        });
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col transition-colors duration-300">
      
      {/* HEADER */}
      <header className="bg-[#1A1AFF] dark:bg-slate-900 text-white py-4 px-6 flex items-center justify-between shadow-lg sticky top-0 z-50">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 text-sm font-medium hover:bg-white/10 p-2 rounded-lg transition-all">
          <ArrowLeft size={18} /> <span className="hidden md:inline">Voltar</span>
        </button>
        <h1 className="text-lg font-bold truncate px-4">{config.documentName || 'Relatório Fotográfico'}</h1>
        <div className="bg-white/10 dark:bg-slate-800/50 rounded-full border border-white/10"><ThemeToggle /></div>
      </header>

      <main className="container mx-auto p-4 sm:p-6 flex flex-col lg:flex-row gap-8">
        
        {/* ASIDE */}
        <aside className="lg:w-80 space-y-4">
          {/* Card Resumo */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] uppercase font-black text-slate-400 tracking-widest">Resumo</span>
              <Layout size={14} className="text-slate-300" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="border-r border-slate-100 dark:border-slate-800">
                <p className="text-2xl font-black text-slate-700 dark:text-white">{photos.length}</p>
                <p className="text-[9px] text-slate-400 font-bold uppercase">Imagens</p>
              </div>
              <div className="pl-2">
                <p className="text-2xl font-black text-[#1A1AFF] dark:text-blue-400">{Math.ceil(photos.length / 4)}</p>
                <p className="text-[9px] text-slate-400 font-bold uppercase">Páginas Doc</p>
              </div>
            </div>
          </div>

          {/* Aba de Ações */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-200 dark:border-slate-800 space-y-3">
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center gap-3 p-3 bg-[#1A1AFF] dark:bg-blue-600 text-white rounded-xl hover:shadow-lg transition-all"
            >
              <Plus size={18} />
              <span className="text-sm font-bold">Importar Fotos</span>
            </button>

            <button onClick={() => setIsExportModalOpen(true)} className="w-full flex items-center justify-center gap-2 py-3 text-[#1A1AFF] dark:text-blue-400 border border-slate-200 dark:border-slate-800 rounded-xl font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">
              <FileDown size={18} /> Gerar Relatório
            </button>

            {/* 🚀 BOTÃO RESTAURADO */}
            <button 
              onClick={() => photos.length > 0 && setIsConfirmDeleteAllOpen(true)} 
              className="w-full py-2 text-slate-400 hover:text-red-500 text-[11px] font-bold transition-colors cursor-pointer"
              
            >
              Limpar todas as Fotos
            </button>
          </div>
        </aside>

        {/* GALERIA */}
        <section className="flex-1">
          <div className={cn(
            "bg-white dark:bg-slate-900 rounded-3xl border-2 border-dashed min-h-[500px] flex flex-col transition-all",
            isDragging ? "border-[#1A1AFF] bg-blue-50 dark:bg-blue-900/10" : "border-slate-100 dark:border-slate-800/50",
            photos.length > 0 ? "p-6" : "justify-center items-center"
          )}>
            {photos.length === 0 ? (
              <div className="flex flex-col items-center opacity-40 cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <Camera size={60} strokeWidth={1} />
                <p className="mt-4 font-medium">Nenhuma foto adicionada</p>
              </div>
            ) : (
              <div className="w-full grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {photos.map((p, i) => (
                  <div key={p.id} className="relative group">
                    {/* Contador Discreto */}
                    <div className="absolute top-3 left-3 z-10 px-2 py-1 bg-black/10 dark:bg-white/5 backdrop-blur-md rounded-md border border-white/20 dark:border-white/10 opacity-60 group-hover:opacity-100 transition-opacity">
                      <span className="text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300">
                        #{String(i + 1).padStart(2, '0')}
                      </span>
                    </div>
                    <PhotoCard photo={p} index={i} onRemove={() => removePhoto(p.id)} onUpdateDescription={(d) => updatePhotoDescription(p.id, d)} />
                  </div>
                ))}
                <button onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-3xl flex flex-col items-center justify-center min-h-[200px] text-slate-300 hover:text-[#1A1AFF] transition-all">
                  <ImagePlus size={30} />
                </button>
              </div>
            )}
          </div>
        </section>
      </main>

      <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={(e) => handleFiles(e.target.files!)} className="hidden" />
      <ExportModal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} />

      {/* 🚀 MODAL DE CONFIRMAÇÃO RESTAURADO */}
      {isConfirmDeleteAllOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[1000] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-2xl w-full max-w-sm border border-slate-200 dark:border-slate-800 animate-in zoom-in duration-200">
            <h3 className="text-xl font-bold text-red-600 dark:text-red-400 mb-2 flex items-center gap-2"><Trash2 size={20}/> Limpar Tudo?</h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">Esta ação irá remover todas as fotos do relatório e limpar o cache de recuperação.</p>
            <div className="flex gap-3">
              <button onClick={() => setIsConfirmDeleteAllOpen(false)} className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-xl">Cancelar</button>
              <button onClick={handleClearAll} className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl shadow-lg">Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}