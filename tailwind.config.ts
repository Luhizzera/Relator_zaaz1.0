import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    screens: {
      xs: "475px",
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1536px",
    },
    extend: {
      colors: {
        /* Reskin dos tons vívidos padrão do Tailwind para a paleta neutra
           derivada do logo — cobre toda a UI da Manutenção/LA, que usa
           amber-* (dourado, ação principal) e blue-* (índigo, domínio
           Relatório) diretamente em vez de tokens semânticos. Mesmos
           degraus 50–900 do Tailwind, mesma matiz do logo, saturação bem
           mais baixa. */
        amber: {
          50: "hsl(41 45% 96%)",
          100: "hsl(41 42% 92%)",
          200: "hsl(41 40% 84%)",
          300: "hsl(41 40% 72%)",
          400: "hsl(41 38% 60%)",
          500: "hsl(41 38% 50%)",
          600: "hsl(41 38% 42%)",
          700: "hsl(41 40% 34%)",
          800: "hsl(41 38% 26%)",
          900: "hsl(41 34% 18%)",
        },
        blue: {
          50: "hsl(234 35% 97%)",
          100: "hsl(234 30% 93%)",
          200: "hsl(234 28% 85%)",
          300: "hsl(234 26% 73%)",
          400: "hsl(234 24% 60%)",
          500: "hsl(234 23% 48%)",
          600: "hsl(234 22% 34%)",
          700: "hsl(234 24% 26%)",
          800: "hsl(234 22% 19%)",
          900: "hsl(234 20% 13%)",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;