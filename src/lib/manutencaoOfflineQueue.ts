// src/lib/manutencaoOfflineQueue.ts
import Dexie, { type Table } from 'dexie';
import { addFotoManutencao, addVideoManutencao } from '@/lib/manutencaoService';
import type { CategoriaFotoOS } from '@/types/manutencao';

/**
 * Fila de ENVIO PENDENTE para fotos/vídeos da execução mobile — diferente do
 * `cacheService.ts` do domínio de relatório fotográfico, que é uma
 * recuperação de rascunho (snapshot pra não perder o que já foi capturado
 * se a página recarregar). Aqui o item já é uma captura "concluída" pelo
 * técnico que só não conseguiu subir pro servidor ainda.
 *
 * Escopo deliberadamente pequeno (ver plano): só fotos/vídeos ficam
 * offline. Mudança de status e formulários (ocorrência/material/checklist)
 * continuam exigindo conexão — são ações rápidas e o técnico normalmente
 * só abre a tela de execução já com algum sinal.
 */

interface PendenteFoto {
  id?: number;
  ordemId: string;
  tipo: 'foto';
  dataUrl: string;
  categoria: CategoriaFotoOS;
  createdAt: number;
}

interface PendenteVideo {
  id?: number;
  ordemId: string;
  tipo: 'video';
  blob: Blob;
  contentType: string;
  createdAt: number;
}

type Pendente = PendenteFoto | PendenteVideo;

class ManutencaoOfflineDB extends Dexie {
  pendentes!: Table<Pendente>;

  constructor() {
    super('zaaz-manutencao-offline-v1');
    this.version(1).stores({
      pendentes: '++id, ordemId, createdAt',
    });
  }
}

const db = new ManutencaoOfflineDB();

export async function enqueueFoto(ordemId: string, dataUrl: string, categoria: CategoriaFotoOS): Promise<void> {
  await db.pendentes.add({ ordemId, tipo: 'foto', dataUrl, categoria, createdAt: Date.now() });
}

export async function enqueueVideo(ordemId: string, blob: Blob, contentType: string): Promise<void> {
  await db.pendentes.add({ ordemId, tipo: 'video', blob, contentType, createdAt: Date.now() });
}

export async function countPendentes(ordemId: string): Promise<number> {
  return db.pendentes.where('ordemId').equals(ordemId).count();
}

/**
 * Tenta enviar cada item pendente da OS pro Supabase. Item que falhar
 * (ex: ainda sem conexão de verdade) permanece na fila para a próxima
 * tentativa — não lança erro, só retorna quantos itens sincronizaram.
 */
export async function flushPendentes(ordemId: string): Promise<number> {
  const itens = await db.pendentes.where('ordemId').equals(ordemId).sortBy('createdAt');
  let sincronizados = 0;

  for (const item of itens) {
    try {
      if (item.tipo === 'foto') {
        await addFotoManutencao(item.ordemId, item.dataUrl, item.categoria);
      } else {
        await addVideoManutencao(item.ordemId, item.blob, item.contentType);
      }
      if (item.id != null) await db.pendentes.delete(item.id);
      sincronizados += 1;
    } catch (err) {
      console.warn('[ManutencaoOffline] Falha ao sincronizar item pendente — tenta de novo depois:', err);
    }
  }

  return sincronizados;
}
