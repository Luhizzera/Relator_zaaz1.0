import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
} from 'react';
import { ReportConfig, Photo, ReportData } from '@/types/report';

const REPORT_CONFIG_STORAGE_KEY = 'reportConfig';

// Checklist padrão (Rede Óptica) — usado quando nenhum preset está ativo
export const DEFAULT_CHECKLIST: string[] = [
  'Instalado no cabo de fibra a Placa de Identificação',
  'Não temos ativo de rede de cabo de fibra óptica Zaaz nesse local',
  'Instalado no cabo de fibra a Placa de Identificação e executado adequações',
  'Este poste é de propriedade particular',
  'Os cabos e equipamentos soltos existentes, são de terceiros',
];

const defaultConfig: ReportConfig = {
  documentName: '',
  razaoSocial: 'ZAAZ PROVEDOR DE INTERNET E TELECOMUNICAÇÕES',
  tituloRelatorio: 'RESPOSTAS DE NOTIFICAÇÃO',
  objetivo: 'TAREFA DE REGULARIZAÇÃO DE REDE ÓPTICA',
  codigoReferencia: '',
  local: '',
  header: '',
  footer: '',
  presetId: 'rede-optica',
  checklistOptions: DEFAULT_CHECKLIST,
};

const initializeConfig = (): ReportConfig => {
  try {
    const saved = localStorage.getItem(REPORT_CONFIG_STORAGE_KEY);
    if (saved) {
      const loaded = JSON.parse(saved);
      return {
        ...defaultConfig,
        ...loaded,
        // garante que sempre há um checklist válido
        checklistOptions: loaded.checklistOptions?.length
          ? loaded.checklistOptions
          : DEFAULT_CHECKLIST,
      };
    }
  } catch (e) {
    console.error('Erro ao carregar config:', e);
  }
  return defaultConfig;
};

interface ReportContextType {
  config: ReportConfig;
  setConfig: (config: ReportConfig) => void;
  photos: Photo[];
  addPhoto: (photo: Photo) => void;
  updatePhotoDescription: (id: string, description: string) => void;
  updatePhotoObservacoes: (id: string, observacoes: string) => void;
  removePhoto: (id: string) => void;
  clearAllPhotos: () => void;
  reorderPhotos: (reordered: Photo[]) => void;
  getReportData: () => ReportData;
  resetReport: () => void;
}

const ReportContext = createContext<ReportContextType | undefined>(undefined);

export function ReportProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<ReportConfig>(initializeConfig);
  const [photos, setPhotos] = useState<Photo[]>([]);

  useEffect(() => {
    localStorage.setItem(REPORT_CONFIG_STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  const addPhoto = (newPhoto: Photo) => {
    setPhotos((prev) => [
      ...prev,
      {
        ...newPhoto,
        description:  newPhoto.description  || '',
        observacoes:  newPhoto.observacoes   || '',
        geoAttempted: newPhoto.geoAttempted  ?? false,
      },
    ]);
  };

  const updatePhotoDescription = (id: string, description: string) => {
    setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, description } : p)));
  };

  const updatePhotoObservacoes = (id: string, observacoes: string) => {
    setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, observacoes } : p)));
  };

  const removePhoto = (id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  };

  const clearAllPhotos = () => setPhotos([]);

  const reorderPhotos = (reordered: Photo[]) => setPhotos(reordered);

  const getReportData = (): ReportData => ({ config, photos });

  const resetReport = () => {
    setConfig(defaultConfig);
    setPhotos([]);
  };

  return (
    <ReportContext.Provider
      value={{
        config,
        setConfig,
        photos,
        addPhoto,
        updatePhotoDescription,
        updatePhotoObservacoes,
        removePhoto,
        clearAllPhotos,
        reorderPhotos,
        getReportData,
        resetReport,
      }}
    >
      {children}
    </ReportContext.Provider>
  );
}

export function useReport() {
  const context = useContext(ReportContext);
  if (!context) throw new Error('useReport must be used within ReportProvider');
  return context;
}
