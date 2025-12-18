// ===== 1. Serviço de Processamento e Armazenamento =====
import Dexie, { Table } from 'dexie';

// Configuração do Banco de Dados Local (IndexedDB)
export interface PhotoData {
  id?: number;
  blob: Blob;
  description: string;
  timestamp: number;
}

class RelatoDB extends Dexie {
  photos!: Table<PhotoData>;
  constructor() {
    super('RelatoEngine');
    this.version(1).stores({ photos: '++id' });
  }
}

export const db = new RelatoDB();

// Pipeline de Compressão (Canvas API)
export const processImage = async (file: File): Promise<Blob> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1280;
        let scale = Math.min(1, MAX_WIDTH / img.width);
        
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        canvas.toBlob((blob) => {
          resolve(blob || file);
        }, 'image/jpeg', 0.8); // 80% de qualidade JPEG para o Word
      };
    };
  });
};