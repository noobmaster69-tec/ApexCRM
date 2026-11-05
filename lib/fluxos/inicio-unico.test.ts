import { describe, expect, it } from "vitest";

import type { FlowGraph, FlowNode } from "@/lib/followup/graph-schema";

import { arrumarInicio, inicioPrincipal, recusaDoInicio } from "./inicio-unico";

const inicio = (id: string): FlowNode => ({ id, type: "trigger", label: "Início", position: { x: 0, y: 0 }, config: {} });
const fim = (id: string): FlowNode => ({
  id,
  type: "end",
  label: "Fim",
  position: { x: 0, y: 200 },
  config: { outcome: "custom" },
});
const seta = (source: string, target: string) => ({
  id: `${source}-${target}`,
  source,
  target,
  priority: 0,
  condition: { type: "always" as const },
});
const grafo = (nodes: FlowNode[], edges: ReturnType<typeof seta>[]): FlowGraph => ({ nodes, edges }) as FlowGraph;

describe("um Início por fluxo", () => {
  it("o principal é o primeiro Início com seta saindo; sem nenhum assim, o primeiro", () => {
    expect(inicioPrincipal(grafo([inicio("a"), inicio("b"), fim("f")], [seta("b", "f")]))?.id).toBe("b");
    expect(inicioPrincipal(grafo([inicio("a"), inicio("b"), fim("f")], []))?.id).toBe("a");
    expect(inicioPrincipal(grafo([fim("f")], []))).toBeNull();
  });

  it("tira o Início duplicado sem seta saindo, e as setas que chegavam nele", () => {
    const r = arrumarInicio(grafo([inicio("a"), inicio("b"), fim("f")], [seta("a", "f"), seta("f", "b")]));
    expect(r.removidos).toBe(1);
    expect(r.graph.nodes.map((n) => n.id)).toEqual(["a", "f"]);
    expect(r.graph.edges.map((e) => e.id)).toEqual(["a-f"]);
    expect(r.extrasComSaida).toEqual([]);
  });

  it("mantém o duplicado COM seta saindo — tirar apagaria um caminho desenhado", () => {
    const r = arrumarInicio(grafo([inicio("a"), inicio("b"), fim("f")], [seta("a", "f"), seta("b", "f")]));
    expect(r.removidos).toBe(0);
    expect(r.extrasComSaida).toEqual(["b"]);
    expect(r.graph.nodes).toHaveLength(3);
  });

  it("sem Início, ganha um em (0, 0) com id livre", () => {
    const r = arrumarInicio(grafo([{ ...fim("inicio") }], []));
    expect(r.criado).toBe(true);
    expect(r.graph.nodes[0]).toMatchObject({ id: "inicio-2", type: "trigger", position: { x: 0, y: 0 } });
  });

  it("é idempotente", () => {
    const uma = arrumarInicio(grafo([inicio("a"), inicio("b"), inicio("c"), fim("f")], [seta("c", "f")]));
    expect(uma.removidos).toBe(2);
    const duas = arrumarInicio(uma.graph);
    expect(duas.removidos).toBe(0);
    expect(duas.graph).toBe(uma.graph);
  });

  it("o servidor recusa ficar sem Início e ganhar Início a mais; o legado com vários segue salvável", () => {
    const um = grafo([inicio("a"), fim("f")], []);
    const dois = grafo([inicio("a"), inicio("b"), fim("f")], []);
    expect(recusaDoInicio(grafo([fim("f")], []), um)).toBe("sem_inicio");
    expect(recusaDoInicio(dois, um)).toBe("inicio_a_mais");
    expect(recusaDoInicio(dois, null)).toBe("inicio_a_mais");
    expect(recusaDoInicio(dois, dois)).toBeNull();
    expect(recusaDoInicio(um, dois)).toBeNull();
    expect(recusaDoInicio(um, null)).toBeNull();
  });
});
