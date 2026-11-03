import type { FlowGraph, FlowNode } from "@/lib/followup/graph-schema";

/**
 * Um fluxo tem UM Início. O editor não oferece mais o bloco na paleta, mas há
 * fluxos legados (de antes desta regra) com vários — esta é a régua única de
 * qual deles vale e do que fazer com os outros, usada pelo editor, pelo
 * validador de publicação e pelo disparo.
 */

/** O Início que vale: o primeiro que tem seta saindo; sem nenhum assim, o primeiro. */
export function inicioPrincipal(graph: Pick<FlowGraph, "nodes" | "edges">): FlowNode | null {
  const inicios = graph.nodes.filter((n) => n.type === "trigger");
  if (inicios.length === 0) return null;
  const comSaida = new Set(graph.edges.map((e) => e.source));
  return inicios.find((n) => comSaida.has(n.id)) ?? inicios[0]!;
}

export interface ArrumacaoDoInicio {
  graph: FlowGraph;
  /** Quantos Inícios duplicados SEM seta saindo foram tirados. */
  removidos: number;
  /** Inícios duplicados COM seta saindo: ficam, com contorno de alerta, e a pessoa decide. */
  extrasComSaida: string[];
  /** `true` quando o grafo não tinha Início e ganhou um em (0, 0). */
  criado: boolean;
}

/** O Início com que todo fluxo nasce, no centro do primeiro enquadramento. */
export function novoInicio(idsEmUso: ReadonlySet<string>): FlowNode {
  let id = "inicio";
  for (let i = 2; idsEmUso.has(id); i++) id = `inicio-${i}`;
  return { id, type: "trigger", label: "Início", position: { x: 0, y: 0 }, config: {} };
}

/**
 * Deixa o grafo com exatamente um Início que a pessoa enxerga como tal:
 *  - sem Início nenhum, ganha um em (0, 0);
 *  - extras SEM seta saindo são tirados (não fazem nada, só confundem) junto
 *    com as setas que chegavam neles;
 *  - extras COM seta saindo ficam — tirar apagaria um caminho que a pessoa
 *    desenhou; o editor os marca e a publicação avisa.
 * Idempotente: aplicar duas vezes dá o mesmo grafo.
 */
export function arrumarInicio(graph: FlowGraph): ArrumacaoDoInicio {
  const principal = inicioPrincipal(graph);
  if (!principal) {
    const inicio = novoInicio(new Set(graph.nodes.map((n) => n.id)));
    return { graph: { ...graph, nodes: [inicio, ...graph.nodes] }, removidos: 0, extrasComSaida: [], criado: true };
  }
  const comSaida = new Set(graph.edges.map((e) => e.source));
  const extras = graph.nodes.filter((n) => n.type === "trigger" && n.id !== principal.id);
  const tirar = new Set(extras.filter((n) => !comSaida.has(n.id)).map((n) => n.id));
  const extrasComSaida = extras.filter((n) => comSaida.has(n.id)).map((n) => n.id);
  if (tirar.size === 0) return { graph, removidos: 0, extrasComSaida, criado: false };
  return {
    graph: {
      ...graph,
      nodes: graph.nodes.filter((n) => !tirar.has(n.id)),
      edges: graph.edges.filter((e) => !tirar.has(e.source) && !tirar.has(e.target)),
    },
    removidos: tirar.size,
    extrasComSaida,
    criado: false,
  };
}

export type RecusaDoInicio = "sem_inicio" | "inicio_a_mais";

/**
 * O que o servidor recusa ao salvar um rascunho de fluxo: ficar sem Início, ou
 * ganhar um Início a mais do que já tinha. O legado com vários continua
 * salvável (a pessoa precisa poder abrir, arrumar e guardar), só não piora.
 */
export function recusaDoInicio(
  novo: Pick<FlowGraph, "nodes">,
  anterior: Pick<FlowGraph, "nodes"> | null,
): RecusaDoInicio | null {
  const contar = (g: Pick<FlowGraph, "nodes">) => g.nodes.filter((n) => n.type === "trigger").length;
  const agora = contar(novo);
  if (agora === 0) return "sem_inicio";
  if (agora > Math.max(1, anterior ? contar(anterior) : 1)) return "inicio_a_mais";
  return null;
}
