// ===== 1. Imports e Configurações (Mantidos) =====
import { useState, useCallback } from 'react'; 
import { useNavigate } from 'react-router-dom';
import { ChevronDown, FileText, Building2, MapPin, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReport } from '@/contexts/ReportContext';
import { toast } from '@/hooks/use-toast'; 

type AccordionSection = 'empresa' | 'relatorio' | 'localizacao' | null;

export default function Config() {
  const navigate = useNavigate();
  const { config, setConfig } = useReport();
  const [formData, setFormData] = useState(config);
  const [openSection, setOpenSection] = useState<AccordionSection>('empresa');
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const toggleSection = (section: AccordionSection) => {
    setOpenSection(openSection === section ? null : section);
  };

  const handleInputChange = useCallback((field: keyof typeof formData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const value = e.target.value;
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
  }, []); 

  const handleContinue = () => {
    const newErrors: { [key: string]: string } = {};
    let hasError = false;

    if (!formData.codigoReferencia || formData.codigoReferencia.trim() === '') {
      newErrors.codigoReferencia = 'O Código de Referência é obrigatório.';
      hasError = true;
    }
    
    if (!formData.local || formData.local.trim() === '') {
      newErrors.local = 'A Localização é obrigatória.';
      hasError = true;
    }

    setErrors(newErrors);

    if (hasError) {
      toast({
        title: 'Preenchimento obrigatório',
        description: 'Por favor, preencha todos os campos obrigatórios.',
        variant: 'destructive',
      });
      if (newErrors.codigoReferencia) setOpenSection('empresa');
      else if (newErrors.local) setOpenSection('localizacao');
      return;
    }

    setConfig(formData);
    navigate('/photos');
  };

  const inputClass = "w-full px-3 sm:px-4 py-2.5 sm:py-3 text-sm sm:text-base bg-muted border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring text-foreground";

  // ===== 2. Definição das Seções (Mantida) =====
  const sections = [
    {
      id: 'empresa' as const,
      title: '1. Dados da Empresa',
      icon: Building2,
      content: (
        <div className="space-y-4">
          <div>
            <label htmlFor="razaoSocial" className="block text-sm font-medium text-foreground mb-1">Razão Social</label>
            <input id="razaoSocial" type="text" value={formData.razaoSocial} onChange={handleInputChange('razaoSocial')} className={inputClass} />
          </div>
          <div>
            <label htmlFor="codigoReferencia" className={cn("block text-sm font-medium mb-1", errors.codigoReferencia ? "text-destructive" : "text-foreground")}>Código de Referência *</label>
            <input id="codigoReferencia" type="text" value={formData.codigoReferencia} onChange={handleInputChange('codigoReferencia')} className={cn(inputClass, errors.codigoReferencia && "border-destructive")} />
          </div>
        </div>
      ),
    },
    {
        id: 'relatorio' as const,
        title: '2. Informações do Relatório',
        icon: FileText,
        content: (
          <div className="space-y-4">
            <div>
              <label htmlFor="tituloRelatorio" className="block text-sm font-medium text-foreground mb-1">Título do Relatório</label>
              <input id="tituloRelatorio" type="text" value={formData.tituloRelatorio} onChange={handleInputChange('tituloRelatorio')} className={inputClass} />
            </div>
            <div>
              <label htmlFor="objetivo" className="block text-sm font-medium text-foreground mb-1">Objetivo</label>
              <textarea id="objetivo" value={formData.objetivo} onChange={handleInputChange('objetivo')} rows={2} className={cn(inputClass, "resize-none")} />
            </div>
          </div>
        ),
    },
    {
        id: 'localizacao' as const,
        title: '3. Localização',
        icon: MapPin,
        content: (
          <div className="space-y-4">
            <div>
              <label htmlFor="local" className={cn("block text-sm font-medium mb-1", errors.local ? "text-destructive" : "text-foreground")}>Local *</label>
              <input id="local" type="text" value={formData.local} onChange={handleInputChange('local')} className={cn(inputClass, errors.local && "border-destructive")} />
            </div>
          </div>
        ),
    },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="bg-primary text-primary-foreground py-4 sm:py-6 shadow-lg">
        <div className="container mx-auto px-4">
          <h1 className="text-xl sm:text-2xl font-bold text-center">O RELATOR DE PROJETOS</h1>
          <p className="text-center text-primary-foreground/50 mt-1 text-sm sm:text-base">
            Configure as informações do documento
          </p>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8 max-w-2xl flex-grow">
        <div className="space-y-3 sm:space-y-4">
          {sections.map((section) => {
            const Icon = section.icon;
            const isOpen = openSection === section.id;

            return (
              <div key={section.id} className="bg-card rounded-lg border border-border overflow-hidden shadow-sm">
                <button
                  onClick={() => toggleSection(section.id)}
                  className="w-full flex items-center justify-between p-3 sm:p-4 text-left hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2 sm:gap-3">
                    <Icon size={18} className="text-secondary sm:w-5 sm:h-5" />
                    <span className="font-medium text-card-foreground text-sm sm:text-base">{section.title}</span>
                  </div>
                  <ChevronDown size={18} className={cn("text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                </button>
                <div className={cn("overflow-hidden transition-all", isOpen ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0")}>
                  <div className="p-3 sm:p-4 pt-0 border-t border-border">{section.content}</div>
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={handleContinue}
          className="w-full mt-6 sm:mt-8 flex items-center justify-center gap-2 py-3 sm:py-4 bg-primary text-primary-foreground rounded-lg text-sm sm:text-base font-semibold hover:bg-primary/90 transition-colors shadow-md"
        >
          Continuar para Fotos
          <ArrowRight size={18} className="sm:w-5 sm:h-5" />
        </button>
      </main>

      {/* ===== FOOTER CENTRALIZADO COM ENGENHARIA & PROJETOS ===== */}
      <footer className="w-full py-12 sm:py-20 mt-auto border-t border-border/10">
        <div className="container mx-auto px-6 sm:px-12 flex flex-col items-center">
          
          <div className="relative group flex justify-center">
            {/* Camada de Vidro (Glassmorphism) - Ajustada para o centro */}
            <div className="absolute inset-0 bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.1)] opacity-0 group-hover:opacity-100 transition-all duration-700 -m-4"></div>
            
            {/* Brilho de Fundo Dinâmico */}
            <div className="absolute -inset-1 bg-gradient-to-r from-secondary/10 to-primary/10 rounded-full blur-2xl opacity-20 group-hover:opacity-40 transition duration-1000"></div>
            
            <img 
              src="/images/dep-eng.png" 
              alt="Engenharia Zaaz" 
              className="relative w-64 sm:w-[350px] h-auto object-contain opacity-100 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500 ease-in-out"
            />
          </div>

          <div className="mt-8 flex flex-col items-center gap-2">
            <p className="text-[10px] sm:text-xs font-black text-primary/70 tracking-[0.6em] uppercase italic text-center">
              Engenharia & Projetos
            </p>
            {/* Barra decorativa centralizada */}
            <div className="h-[3px] w-44 bg-gradient-to-r from-transparent via-primary/100 to-transparent rounded-full"></div>
          </div>
          
        </div>
      </footer>
    </div>
  );
}