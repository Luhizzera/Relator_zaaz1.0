import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
} from 'react';
import { ReportConfig, Photo, ReportData } from '@/types/report';

const REPORT_CONFIG_STORAGE_KEY = 'reportConfig';

const defaultConfig: ReportConfig = {
  documentName: '',
  razaoSocial: 'ZAAZ PROVEDOR DE INTERNET E TELECOMUNICAÇÕES',
  tituloRelatorio: 'RESPOSTAS DE NOTIFICAÇÃO',
  objetivo: 'TAREFA DE REGULARIZAÇÃO DE REDE ÓPTICA',
  codigoReferencia: '',
  local: '',
  header: '',
  footer: '',
};

const initializeConfig = (): ReportConfig => {
  try {
    const saved = localStorage.getItem(REPORT_CONFIG_STORAGE_KEY);
    if (saved) {
      const loadedConfig = JSON.parse(saved);
      // Garante que o objeto retornado tenha todos os campos padrão, caso o localStorage seja antigo
      return { ...defaultConfig, ...loadedConfig }; 
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
  getReportData: () => ReportData;
  resetReport: () => void;
}

const ReportContext = createContext<ReportContextType | undefined>(undefined);

export function ReportProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<ReportConfig>(initializeConfig);
  const [photos, setPhotos] = useState<Photo[]>([]);


  
  useEffect(() => {
    localStorage.setItem(
      REPORT_CONFIG_STORAGE_KEY,
      JSON.stringify(config)
    );
  }, [config]);

  const addPhoto = (newPhoto: Photo) => {
    setPhotos((prev) => [
      ...prev, 
      { 
        ...newPhoto,
        description: newPhoto.description || '',
        observacoes: newPhoto.observacoes || '', // Inicialização
      }
    ]);
  };

  const updatePhotoDescription = (id: string, description: string) => {
    setPhotos((prev) =>
      prev.map((p) => (p.id === id ? { ...p, description } : p))
    );
  };
  
  const updatePhotoObservacoes = (id: string, observacoes: string) => {
    setPhotos((prev) =>
      prev.map((p) => (p.id === id ? { ...p, observacoes } : p))
    );
  };

  const removePhoto = (id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  };

  const clearAllPhotos = () => {
    setPhotos([]);
  };

  const getReportData = (): ReportData => ({
    config,
    photos,
  });

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
  if (!context) {
    throw new Error('useReport must be used within ReportProvider');
  }
  return context;
}