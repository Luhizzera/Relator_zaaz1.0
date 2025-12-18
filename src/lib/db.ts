// ===== 1. Configuração do Banco de Dados Local =====
import Dexie, { Table } from 'dexie';

export interface PhotoEntry {
  id?: number;
  src: string; // Base64 otimizado
  description: string;
  observacoes: string;
}

export class RelatoDatabase extends Dexie {
  photos!: Table<PhotoEntry>;

  constructor() {
    super('RelatoDB');
    this.version(1).stores({
      photos: '++id' // Primary key auto-incrementada
    });
  }
}

export const db = new RelatoDatabase();