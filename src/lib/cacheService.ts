// @ts-nocheck
// ===== 1. Gerenciador de Persistência em Cache (Modelo LFPZ) =====

const CACHE_NAME = 'zaaz-photos-recovery-v1';

export const CacheService = {
  // Salva o estado atual das fotos no Cache do Navegador
  async persistPhotos(photos: any[]) {
    try {
      const cache = await caches.open(CACHE_NAME);
      const dataResponse = new Response(JSON.stringify(photos), {
        headers: { 'Content-Type': 'application/json' }
      });
      await cache.put('last-session-photos', dataResponse);
    } catch (e) {
      console.error("Falha ao persistir em cache:", e);
    }
  },

  // Recupera as fotos da última sessão
  async recoverPhotos() {
    try {
      const cache = await caches.open(CACHE_NAME);
      const response = await cache.match('last-session-photos');
      if (response) {
        return await response.json();
      }
      return null;
    } catch (e) {
      return null;
    }
  },

  // Limpa o cache após a geração bem-sucedida do relatório
  async clearCache() {
    await caches.delete(CACHE_NAME);
  }
};