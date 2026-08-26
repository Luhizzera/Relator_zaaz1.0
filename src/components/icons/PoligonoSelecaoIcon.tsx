interface PoligonoSelecaoIconProps {
  className?: string;
}

/**
 * Ícone da ferramenta de seleção por polígono.
 *
 * Desenhado à mão porque nenhum ícone do lucide-react representa o gesto: os
 * vértices precisam ser pontos cheios e destacados (é neles que o usuário
 * clica) e o contorno precisa ser tracejado, sinalizando uma área de seleção
 * em construção — não uma forma sólida qualquer.
 *
 * O quadrilátero é de propósito irregular: um quadrado perfeito leria como
 * "retângulo/marquee", que é outra ferramenta. A irregularidade comunica que
 * a área é definida clique a clique.
 *
 * Herda `currentColor` e não fixa tamanho em atributo — quem chama controla
 * pelas classes .icon-sm/.icon-md, que definem width/height via CSS.
 */
export function PoligonoSelecaoIcon({ className }: PoligonoSelecaoIconProps) {
  // Ocupa quase todo o viewBox de propósito: aresta curta não comporta o
  // tracejado, e a 16px (tamanho real no botão) as dashes se fundiam com os
  // vértices, fazendo o ícone ler como um quadrado sólido de cantos grossos.
  const vertices: [number, number][] = [
    [4.2, 6],
    [19.2, 3.6],
    [20.4, 17.6],
    [5.4, 20.6],
  ];
  const contorno = `${vertices.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ')} Z`;

  return (
    <svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={contorno}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        strokeDasharray="3 2.6"
      />
      {vertices.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="2" fill="currentColor" />
      ))}
    </svg>
  );
}
