import { useParams } from 'react-router-dom';
import { useEffect } from 'react';
import { useOrders } from '@/contexts/OrdersContext';
import { RelatorioFinalizadoView } from '@/components/RelatorioFinalizadoView';
import Photos from './Photos';

/**
 * Wrapper de rota para a etapa de fotos de uma ordem específica.
 * Espelha o padrão do OrdemEditor (que faz o mesmo para a etapa de Config):
 * garante que a ordem certa esteja carregada no OrdersContext antes de
 * renderizar a tela, usando o :id da URL como fonte da verdade.
 *
 * Depois que o relatório é exportado (PDF/Word — ver ExportModal), a OS
 * fica com status 'exportada' e a tela de coleta de dados dá lugar à visão
 * somente-leitura do relatório finalizado.
 */
export default function OrdemFotos() {
  const { id } = useParams();
  const { openOrder, activeOrderId, activeOrderStatus } = useOrders();

  // Evita recarregar a ordem se o usuário já estava navegando dentro dela
  // (ex: veio da tela de Config da mesma OS, que já chamou openOrder).
  useEffect(() => {
    if (id && id !== activeOrderId) openOrder(id);
  }, [id]);

  if (activeOrderId === id && activeOrderStatus === 'exportada') {
    return <RelatorioFinalizadoView />;
  }

  return <Photos />;
}
