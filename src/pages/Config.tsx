// @ts-nocheck
import { useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronDown, FileText, Building2, MapPin, ArrowRight, BookmarkPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReport, DEFAULT_CHECKLIST } from '@/contexts/OrdersContext';
import { ThemeToggle } from '@/components/ThemeToggle';
import { BackButton } from '@/components/BackButton';
import { toast } from '@/hooks/use-toast';

type AccordionSection = 'empresa' | 'relatorio' | 'localizacao' | null;

const USER_PRESETS_KEY = 'zaaz-user-presets-v1';

// Seleção de presets desativada na tela — Rede Óptica é o único preset (e o
// padrão fixo do App, já aplicado em toda ordem nova via defaultConfig em
// OrdersContext.tsx). "Salvar atual" continua funcionando (grava em
// localStorage) para uso futuro, só não tem mais grade de cards pra reaplicar.

// ─────────────────────────────────────────────
// Helpers de presets do usuário
// ─────────────────────────────────────────────
function loadUserPresets(): any[] {
  try {
    const raw = localStorage.getItem(USER_PRESETS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveUserPresets(presets: any[]): void {
  localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(presets));
}

// ─────────────────────────────────────────────
// COMPONENTE
// ─────────────────────────────────────────────
export default function Config() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { config, setConfig, saveActiveOrder } = useReport();

  const [formData, setFormData]           = useState(config);
  const [openSection, setOpenSection]     = useState<AccordionSection>('empresa');
  const [errors, setErrors]               = useState<{ [key: string]: string }>({});
  const [userPresets, setUserPresets]     = useState<any[]>(loadUserPresets);
  const [savingPreset, setSavingPreset]   = useState(false);
  const [newPresetName, setNewPresetName] = useState('');

  const toggleSection = (section: AccordionSection) =>
    setOpenSection(openSection === section ? null : section);

  const handleInputChange = useCallback(
    (field: keyof typeof formData) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setFormData((prev) => ({ ...prev, [field]: e.target.value }));
        setErrors((prev) => ({ ...prev, [field]: '' }));
      },
    [],
  );

  // ── Salvar preset do usuário ──────────────────────────────────────
  const handleSavePreset = () => {
    const name = newPresetName.trim();
    if (!name) return;

    // O preset do usuário captura também o checklist corrente
    const currentChecklist = formData.checklistOptions ?? DEFAULT_CHECKLIST;

    const newPreset = {
      id:       `user-${Date.now()}`,
      label:    name,
      tag:      'Meu Preset',
      tagColor: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
      data: {
        razaoSocial:      formData.razaoSocial,
        tituloRelatorio:  formData.tituloRelatorio,
        objetivo:         formData.objetivo,
        checklistOptions: currentChecklist,
      },
    };

    const updated = [...userPresets, newPreset];
    setUserPresets(updated);
    saveUserPresets(updated);
    setNewPresetName('');
    setSavingPreset(false);
    toast({ title: 'Preset salvo!', description: `"${name}" adicionado aos seus presets.` });
  };

  // ── Continuar para fotos ──────────────────────────────────────────
  const handleContinue = async () => {
    const newErrors: { [key: string]: string } = {};
    if (!formData.codigoReferencia?.trim())
      newErrors.codigoReferencia = 'O Código de Referência é obrigatório.';
    if (!formData.local?.trim())
      newErrors.local = 'A Localização é obrigatória.';

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) {
      if (newErrors.codigoReferencia) setOpenSection('empresa');
      else if (newErrors.local)       setOpenSection('localizacao');
      return;
    }

    // Garante que o checklist vai junto no config
    const checklist = formData.checklistOptions ?? DEFAULT_CHECKLIST;

    const newConfig = { ...formData, checklistOptions: checklist };
    setConfig(newConfig);
    try {
      // Passa o config novo direto — setConfig ainda não refletiu no
      // fechamento de saveActiveOrder neste mesmo tick (setState é assíncrono).
      await saveActiveOrder(newConfig);
    } catch (err) {
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar os dados da OS. Tente novamente.',
        variant: 'destructive',
      });
      return;
    }
    // Navega para a etapa de fotos DESTA ordem. Sem :id (ex: acesso direto
    // fora do fluxo /ordens/:id), volta para a lista em vez de uma rota inválida.
    navigate(id ? `/ordens/${id}/fotos` : '/ordens');
  };

  const inputClass =
    'w-full px-3 sm:px-4 py-2.5 sm:py-3 text-sm sm:text-base bg-muted border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring text-foreground transition-colors';

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
            <label htmlFor="codigoReferencia" className={cn('block text-sm font-medium mb-1', errors.codigoReferencia ? 'text-destructive' : 'text-foreground')}>
              Código de Referência *
            </label>
            <input id="codigoReferencia" type="text" value={formData.codigoReferencia} onChange={handleInputChange('codigoReferencia')} className={cn(inputClass, errors.codigoReferencia && 'border-destructive')} />
            {errors.codigoReferencia && <p className="text-xs text-destructive mt-1">{errors.codigoReferencia}</p>}
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
            <textarea id="objetivo" value={formData.objetivo} onChange={handleInputChange('objetivo')} rows={2} className={cn(inputClass, 'resize-none')} />
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
            <label htmlFor="local" className={cn('block text-sm font-medium mb-1', errors.local ? 'text-destructive' : 'text-foreground')}>
              Local *
            </label>
            <input id="local" type="text" value={formData.local} onChange={handleInputChange('local')} className={cn(inputClass, errors.local && 'border-destructive')} />
            {errors.local && <p className="text-xs text-destructive mt-1">{errors.local}</p>}
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">

      <header className="bg-primary text-primary-foreground py-4 sm:py-5 shadow-lg">
        <div className="container mx-auto px-4 flex items-center justify-between gap-2">
          <BackButton to="/ordens" variant="ghost-dark" />
          <div className="text-center flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold leading-tight">O RELATOR DE PROJETOS</h1>
            <p className="text-primary-foreground/50 text-xs sm:text-sm mt-0.5">Configure as informações do documento</p>
          </div>
          <ThemeToggle variant="ghost-dark" />
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8 max-w-2xl flex-grow">

        {/* Preset único (Rede Óptica, já aplicado por padrão) — sem grade de seleção */}
        <div className="mb-5 sm:mb-6">
          <div className="flex items-center justify-end mb-3">
            <button
              onClick={() => setSavingPreset(!savingPreset)}
              className="flex items-center gap-1 text-[11px] font-bold text-primary hover:text-primary/80 transition-colors"
            >
              <BookmarkPlus size={13} /> Salvar atual
            </button>
          </div>

          {savingPreset && (
            <div className="flex gap-2 mb-3 animate-in slide-in-from-top-1 duration-200">
              <input
                autoFocus
                type="text"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSavePreset(); if (e.key === 'Escape') setSavingPreset(false); }}
                placeholder="Nome do preset..."
                className="flex-1 px-3 py-2 text-sm bg-muted border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring text-foreground"
              />
              <button onClick={handleSavePreset} className="px-3 py-2 bg-primary text-primary-foreground text-sm font-bold rounded-lg hover:bg-primary/90 transition-colors">Salvar</button>
              <button onClick={() => setSavingPreset(false)} className="px-3 py-2 border border-border text-sm font-bold rounded-lg hover:bg-muted transition-colors">✕</button>
            </div>
          )}

        </div>

        {/* ACORDEÃO */}
        <div className="space-y-3 sm:space-y-4">
          {sections.map((section) => {
            const Icon   = section.icon;
            const isOpen = openSection === section.id;
            return (
              <div key={section.id} className="bg-card rounded-lg border border-border overflow-hidden shadow-sm">
                <button
                  onClick={() => toggleSection(section.id)}
                  className="w-full flex items-center justify-between p-3 sm:p-4 text-left hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2 sm:gap-3">
                    <Icon size={18} className="text-secondary" />
                    <span className="font-medium text-card-foreground text-sm sm:text-base">{section.title}</span>
                  </div>
                  <ChevronDown size={18} className={cn('text-muted-foreground transition-transform duration-200', isOpen && 'rotate-180')} />
                </button>
                <div className={cn('overflow-hidden transition-all duration-200', isOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0')}>
                  <div className="p-3 sm:p-4 pt-0 border-t border-border">{section.content}</div>
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={handleContinue}
          className="w-full mt-6 sm:mt-8 flex items-center justify-center gap-2 py-3 sm:py-4 bg-primary text-primary-foreground rounded-lg text-sm sm:text-base font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all shadow-md"
        >
          Continuar para Fotos <ArrowRight size={18} />
        </button>
      </main>

      <footer className="w-full py-12 sm:py-20 mt-auto border-t border-border/10">
        <div className="container mx-auto px-6 sm:px-12 flex flex-col items-center">
          <div className="relative group flex justify-center">
            <div className="absolute inset-0 bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 opacity-0 group-hover:opacity-100 transition-all duration-700 -m-4" />
            <img src="/images/dep-eng.png" alt="Engenharia Zaaz" className="relative w-64 sm:w-[350px] h-auto object-contain group-hover:scale-105 transition-all duration-500 ease-in-out" />
          </div>
          <div className="mt-8 flex flex-col items-center gap-2">
            <p className="text-[10px] sm:text-xs font-black text-primary/70 tracking-[0.6em] uppercase italic text-center">Engenharia & Projetos</p>
            <div className="h-[3px] w-44 bg-gradient-to-r from-transparent via-primary/100 to-transparent rounded-full" />
          </div>
        </div>
      </footer>
    </div>
  );
}
