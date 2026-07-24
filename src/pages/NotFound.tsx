import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { BackButton } from "@/components/BackButton";
import { ThemeToggle } from "@/components/ThemeToggle";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold">404</h1>
        <p className="text-xl text-muted-foreground">Página não encontrada</p>
        <div className="flex justify-center pt-1">
          <BackButton to="/" variant="ghost-light" label="Voltar para o início" />
        </div>
      </div>
    </div>
  );
};

export default NotFound;
