export interface ReportConfig {
  documentName: string;
  razaoSocial: string;
  tituloRelatorio: string;
  objetivo: string;
  codigoReferencia: string;
  local: string;
  header: string;
  footer: string;
}

export interface Photo {
  id: string;
  src: string;
  description: string;
}

export interface ReportData {
  config: ReportConfig;
  photos: Photo[];
}
