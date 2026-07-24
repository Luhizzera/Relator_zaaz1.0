import { useParams } from 'react-router-dom';
import { useEffect } from 'react';
import { useOrders } from '@/contexts/OrdersContext';
import { RelatorioFinalizadoView } from '@/components/RelatorioFinalizadoView';
import Config from './Config';

// Mesma trava de OrdemFotos.tsx: uma OS 'exportada' é somente-leitura, então
// acessar /ordens/:id direto (sem passar pela lista) também precisa
// respeitar isso, e não só a rota /fotos.
export default function OrdemEditor() {
  const { id } = useParams();
  const { openOrder, activeOrderId, activeOrderStatus } = useOrders();
  useEffect(() => { if (id) openOrder(id); }, [id]);

  if (activeOrderId === id && activeOrderStatus === 'exportada') {
    return <RelatorioFinalizadoView />;
  }

  return <Config />;
}