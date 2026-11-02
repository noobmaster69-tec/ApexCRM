/** Espaço que sobra entre um cartão e o que foi empurrado para baixo dele. */
export const FOLGA_ENTRE_CARTOES = 24;

export interface CaixaDoCartao {
  id: string;
  position: { x: number; y: number };
  /** O que o React Flow mediu no DOM. Sem medida, o cartão não entra na conta. */
  measured?: { width?: number; height?: number };
}

function caixa(n: CaixaDoCartao, posicoes: Map<string, { x: number; y: number }>) {
  const p = posicoes.get(n.id) ?? n.position;
  const w = n.measured?.width;
  const h = n.measured?.height;
  if (w === undefined || h === undefined) return null;
  return { x: p.x, y: p.y, w, h };
}

/**
 * Cartão que CRESCEU não cobre o vizinho (rodada 1, item 2): a prévia da
 * Mensagem mostra tudo, e um fluxo montado com cartões menores ficaria com um
 * bloco por cima do outro. Quem está abaixo de um cartão que cresceu e passou a
 * ser coberto por ele desce até a borda de baixo + a folga — e, se descendo
 * cobrir outro, esse desce também. Nada sobe, nada anda para o lado, e só se
 * mexe em quem está coberto: o resto do desenho da pessoa fica onde estava.
 *
 * Devolve só as posições que mudaram.
 */
export function afastarSobrepostos(
  nos: readonly CaixaDoCartao[],
  cresceram: ReadonlySet<string>,
  folga = FOLGA_ENTRE_CARTOES,
): Map<string, { x: number; y: number }> {
  const posicoes = new Map<string, { x: number; y: number }>();
  const fila = [...cresceram];
  // Teto de voltas: cada empurrão desce estritamente, mas um grafo patológico
  // não pode prender a tela num laço.
  let voltas = nos.length * nos.length + fila.length;
  while (fila.length > 0 && voltas-- > 0) {
    const id = fila.shift()!;
    const no = nos.find((n) => n.id === id);
    const a = no ? caixa(no, posicoes) : null;
    if (!a) continue;
    for (const outro of nos) {
      if (outro.id === id) continue;
      const b = caixa(outro, posicoes);
      if (!b) continue;
      const ladoALado = a.x < b.x + b.w && b.x < a.x + a.w;
      const cobre = a.y < b.y + b.h && b.y < a.y + a.h;
      // Só quem começa ABAIXO do topo do que cresceu desce.
      if (!ladoALado || !cobre || b.y < a.y || (b.y === a.y && outro.id < id)) continue;
      posicoes.set(outro.id, { x: b.x, y: a.y + a.h + folga });
      fila.push(outro.id);
    }
  }
  return posicoes;
}
