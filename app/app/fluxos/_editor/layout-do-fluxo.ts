/**
 * A "etapa N" de cada bloco (subtítulo do modal): a ordem em que o caminho a
 * partir do Início o alcança, em largura. Bloco solto fica depois de todos, na
 * ordem do canvas.
 */
export function etapasDoFluxo(
  nodes: ReadonlyArray<{ id: string; type?: string }>,
  edges: ReadonlyArray<{ source: string; target: string }>,
): Map<string, number> {
  const saidas = new Map<string, string[]>();
  for (const e of edges) (saidas.get(e.source) ?? saidas.set(e.source, []).get(e.source)!).push(e.target);
  const ordem: string[] = [];
  const visto = new Set<string>();
  const fila = nodes.filter((n) => n.type === "trigger").map((n) => n.id);
  for (const id of fila) visto.add(id);
  while (fila.length > 0) {
    const id = fila.shift()!;
    ordem.push(id);
    for (const prox of saidas.get(id) ?? []) {
      if (visto.has(prox)) continue;
      visto.add(prox);
      fila.push(prox);
    }
  }
  for (const n of nodes) if (!visto.has(n.id)) ordem.push(n.id);
  return new Map(ordem.map((id, i) => [id, i + 1]));
}
