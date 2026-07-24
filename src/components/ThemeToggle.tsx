import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";
import { iconChipButtonClass } from "./BackButton";

interface ThemeToggleProps {
  className?: string;
  /**
   * chip       → botão "quadrado" com borda, usado em headers estilo cartão
   *              (Dashboard, PageHeader, telas de listagem...).
   * ghost-dark → ícone sem fundo próprio, para headers com cor sólida ou
   *              escura (Config, Photos, Login), onde um "chip" branco
   *              destoaria do resto do header.
   */
  variant?: "chip" | "ghost-dark";
}

export function ThemeToggle({ className, variant = "chip" }: ThemeToggleProps) {
  const { isDark, toggleTheme } = useTheme();
  const label = isDark ? "Mudar para modo claro" : "Mudar para modo escuro";

  if (variant === "ghost-dark") {
    return (
      <button
        onClick={toggleTheme}
        aria-label={label}
        title={label}
        className={cn(
          "flex items-center justify-center w-8 h-8 rounded-lg",
          "text-white/70 hover:text-white hover:bg-white/10",
          "transition-colors duration-150 shrink-0",
          className,
        )}
      >
        {isDark ? <Sun size={16} /> : <Moon size={16} />}
      </button>
    );
  }

  return (
    <button
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className={cn(iconChipButtonClass, className)}
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
