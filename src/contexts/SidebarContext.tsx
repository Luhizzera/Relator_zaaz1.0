import React, { createContext, useContext, useState, ReactNode } from 'react';

interface SidebarContextType {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

/**
 * Estado compartilhado do drawer de navegação (AppSidebar.tsx). Antes vivia
 * só dentro de Dashboard.tsx — promovido pra cá porque agora o botão ☰
 * substitui o "voltar" em qualquer tela de topo do gestor/supervisor (ver
 * PageHeader.tsx), não só no Dashboard.
 */
export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <SidebarContext.Provider value={{ isOpen, open: () => setIsOpen(true), close: () => setIsOpen(false) }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) throw new Error('useSidebar must be used within SidebarProvider');
  return context;
}
