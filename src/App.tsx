// @ts-nocheck
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ReportProvider } from "@/contexts/ReportContext";
import { ThemeToggle } from "@/components/ThemeToggle"; // 💡 Importação essencial
import Index from "./pages/Index";
import Photos from './pages/Photos';
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      {/* 💡 O ReportProvider deve envolver o conteúdo para que as fotos acessem o contexto */}
      <ReportProvider>
        <BrowserRouter>
          {/* 💡 ThemeToggle posicionado para flutuar sobre as páginas ou ser fixo */}
          <ThemeToggle /> 
          
          <Toaster />
          <Sonner />
          
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/photos" element={<Photos />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </ReportProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;