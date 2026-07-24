// @ts-nocheck

/**
 * ZAAZ StorageService — Offline-First
 *
 * Responsabilidades:
 *  - Online  → persiste diretamente na Cache API (sessão de trabalho rápida)
 *  - Offline → persiste no IndexedDB via Dexie (fila durável)
 *  - Sync    → quando a rede volta, PERGUNTA ao usuário antes de migrar IDB → Cache
 *  - Discard → permite ao usuário descartar dados offline sem sincronizar
 *  - Debounce → expõe helper para evitar gravação a cada keystroke
 */

import Dexie, { type Table } from 'dexie';

// ─────────────────────────────────────────────
// 1. BANCO OFFLINE (IndexedDB via Dexie)
// ─────────────────────────────────────────────

interface OfflinePhotoEntry {
  id?: number;       // PK auto-incrementada pelo Dexie
  payload: string;   // JSON.stringify(Photo[]) — snapshot completo
  savedAt: number;   // timestamp para debug / ordenação
}

class OfflineQueueDB extends Dexie {
  queue!: Table<OfflinePhotoEntry>;

  constructor() {
    super('zaaz-offline-queue-v1');
    this.version(1).stores({
      queue: '++id, savedAt',
    });
  }
}

// Instância singleton — só abre o banco uma vez
const offlineDB = new OfflineQueueDB();

// ─────────────────────────────────────────────
// 2. CONSTANTES
// ─────────────────────────────────────────────

const CACHE_NAME = 'zaaz-photos-recovery-v1';
const CACHE_KEY  = 'last-session-photos';

// ─────────────────────────────────────────────
// 3. HELPERS INTERNOS
// ─────────────────────────────────────────────

/** Verifica se o browser reporta conexão ativa. */
function isOnline(): boolean {
  return navigator.onLine;
}

/** Grava o snapshot de fotos na Cache API. */
async function writeToCache(photos: any[]): Promise<void> {
  const cache = await caches.open(CACHE_NAME);
  const response = new Response(JSON.stringify(photos), {
    headers: { 'Content-Type': 'application/json' },
  });
  await cache.put(CACHE_KEY, response);
}

/** Grava o snapshot de fotos no IndexedDB (substitui entradas anteriores). */
async function writeToIndexedDB(photos: any[]): Promise<void> {
  // Mantemos apenas UMA entrada — o estado mais recente.
  await offlineDB.queue.clear();
  await offlineDB.queue.add({
    payload: JSON.stringify(photos),
    savedAt: Date.now(),
  });
}

// ─────────────────────────────────────────────
// 4. API PÚBLICA
// ─────────────────────────────────────────────

export const StorageService = {

  /**
   * Persiste o estado atual das fotos.
   * Decide automaticamente entre Cache API (online) e IndexedDB (offline).
   */
  async persist(photos: any[]): Promise<void> {
    try {
      if (isOnline()) {
        await writeToCache(photos);
      } else {
        await writeToIndexedDB(photos);
        console.info('[StorageService] Offline — fotos salvas no IndexedDB.');
      }
    } catch (err) {
      console.error('[StorageService] Falha ao persistir:', err);
    }
  },

  /**
   * Recupera as fotos da sessão anterior.
   * Tenta Cache API primeiro; se vazia, tenta IndexedDB.
   */
  async recover(): Promise<any[] | null> {
    // 1. Tenta Cache API
    try {
      const cache    = await caches.open(CACHE_NAME);
      const response = await cache.match(CACHE_KEY);
      if (response) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          console.info('[StorageService] Recuperado da Cache API.');
          return data;
        }
      }
    } catch (err) {
      console.warn('[StorageService] Cache API indisponível:', err);
    }

    // 2. Fallback: IndexedDB
    try {
      const entry = await offlineDB.queue.orderBy('savedAt').last();
      if (entry) {
        const data = JSON.parse(entry.payload);
        if (Array.isArray(data) && data.length > 0) {
          console.info('[StorageService] Recuperado do IndexedDB (estava offline).');
          return data;
        }
      }
    } catch (err) {
      console.warn('[StorageService] IndexedDB indisponível:', err);
    }

    return null;
  },

  /**
   * Migra dados pendentes do IndexedDB para a Cache API.
   * Chamado APENAS quando o usuário confirmar a sincronização no banner.
   * Retorna true se havia dados para migrar.
   */
  async syncOfflineQueue(): Promise<boolean> {
    try {
      const count = await offlineDB.queue.count();
      if (count === 0) return false;

      const entry = await offlineDB.queue.orderBy('savedAt').last();
      if (!entry) return false;

      const photos = JSON.parse(entry.payload);
      await writeToCache(photos);
      await offlineDB.queue.clear();

      console.info('[StorageService] Sync concluído — IDB migrado para Cache API.');
      return true;
    } catch (err) {
      console.error('[StorageService] Falha no sync:', err);
      return false;
    }
  },

  /**
   * Descarta os dados do IndexedDB sem migrar para a Cache API.
   * Chamado quando o usuário recusa a sincronização no banner.
   */
  async discardOfflineQueue(): Promise<void> {
    try {
      await offlineDB.queue.clear();
      console.info('[StorageService] Fila offline descartada pelo usuário.');
    } catch (err) {
      console.error('[StorageService] Falha ao descartar fila offline:', err);
    }
  },

  /**
   * Verifica se há dados pendentes no IndexedDB.
   * Usado para exibir o banner de confirmação de sincronização na UI.
   */
  async hasPendingOfflineData(): Promise<boolean> {
    try {
      const count = await offlineDB.queue.count();
      return count > 0;
    } catch {
      return false;
    }
  },

  /**
   * Limpa tudo (Cache API + IndexedDB).
   * Chamado ao clicar em "Limpar Galeria" — garante que
   * nenhuma camada de storage ressuscite as fotos no próximo reload.
   */
  async clearAll(): Promise<void> {
    try {
      await caches.delete(CACHE_NAME);
      await offlineDB.queue.clear();
      console.info('[StorageService] Tudo limpo — Cache API e IndexedDB.');
    } catch (err) {
      console.error('[StorageService] Falha ao limpar:', err);
    }
  },
};

// ─────────────────────────────────────────────
// 5. DEBOUNCE HELPER
// ─────────────────────────────────────────────

/**
 * Cria uma versão "debounced" de qualquer função assíncrona.
 * Uso: const debouncedPersist = createDebounced(StorageService.persist, 1500)
 */
export function createDebounced<T extends (...args: any[]) => any>(
  fn: T,
  delayMs: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn(...args);
      timer = null;
    }, delayMs);
  };
}
