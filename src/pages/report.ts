export interface ReportConfig {
  documentName: string;
  razaoSocial: string;
  tituloRelatorio: string;
  objetivo: string;
  codigoReferencia: string;
  local: string;
  header: string;
  footer: string;
  presetId?: string;               // qual preset está ativo
  checklistOptions?: string[];     // opções do checklist vindas do preset
}

export interface Photo {
  id: string;
  src: string;
  description: string;
  observacoes: string;
  location?: string | null;
  geoAttempted?: boolean;
}

export interface ReportData {
  config: ReportConfig;
  photos: Photo[];
}
