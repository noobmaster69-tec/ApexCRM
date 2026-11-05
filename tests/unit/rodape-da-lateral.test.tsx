/**
 * O RODAPÉ DA LATERAL (Etapa 7): o que morava na barra do topo — sino, idioma,
 * tema, avatar e seletor de organização — e o "Configurações" que estava
 * sozinho embaixo, agora numa barra de quatro botões e num cartão de perfil.
 *
 * O que se mede aqui é a superfície: badge com "99+", botão de Configurações
 * ativo nas sub-rotas, o tema que o ícone mostra, e o menu do perfil com as
 * organizações, "Meu perfil" e "Sair" (a mesma ação de antes). A medida de
 * pixel (larguras, contraste computado) é a prova pela tela.
 */
import { readFileSync } from "node:fs";

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ReactNode } from "react";

const estado = vi.hoisted(() => ({
  pathname: "/app/settings/profile",
  abertos: 120,
  tema: "dark" as "dark" | "light",
}));
const toggle = vi.hoisted(() => vi.fn());
const signOut = vi.hoisted(() => vi.fn(async () => {}));
const trocar = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("next/navigation", () => ({ usePathname: () => estado.pathname }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children: ReactNode }) => (
    <a href={href} {...resto}>
      {children}
    </a>
  ),
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: {
      id: "u1",
      email: "jo@exemplo.test",
      full_name: "Jonatas Oliveira",
      avatar_url: null,
      is_platform_admin: false,
      support: null,
      organizations: [
        { organization_id: "a", organization_name: "Apex Company" },
        { organization_id: "b", organization_name: "Outra Loja" },
      ],
    },
    activeOrg: { orgId: "a", name: "Apex Company", role: "admin" },
    signOut,
  }),
}));
vi.mock("@/lib/navigation/interface", () => ({ destinosDaInterface: () => [{ href: "/app/ai/inbox" }] }));
vi.mock("@/hooks/ai/useAgentInbox", () => ({
  useAgentInbox: () => ({ data: { open_count: estado.abertos, items: [] } }),
}));
vi.mock("@/hooks/system/useSystemVersion", () => ({ useSystemVersion: () => ({ data: { current_version: "v1.2.3" } }) }));
vi.mock("@/app/app/ai/inbox/_components/AgentInboxList", () => ({ AgentInboxList: () => null }));
vi.mock("@/lib/i18n/IdiomaProvider", () => ({ useIdioma: () => "pt-BR", useAplicarIdioma: () => () => {} }));
vi.mock("@/app/actions/settings/trocarIdioma", () => ({ trocarIdioma: vi.fn() }));
vi.mock("@/lib/theme", () => ({ useTheme: () => ({ resolvedTheme: estado.tema, toggle }) }));
vi.mock("@/components/shell/useTrocaDeOrganizacao", () => ({ useTrocaDeOrganizacao: () => ({ trocar, trocando: false }) }));

import { TooltipProvider } from "@/components/ui/tooltip";
import { RodapeDaLateral, contagemCurta, iniciais, nomeParaMostrar } from "@/components/shell/RodapeDaLateral";
import { ordenarDaLateral } from "@/components/shell/Sidebar";
import { atalhoDaLateralVale, ehConstrutorDeFluxo } from "@/components/shell/lateral-forcada";
import {
  CHAVE_DA_LATERAL,
  CHAVE_DA_LATERAL_DO_CONSTRUTOR,
  lerLateralDoConstrutor,
  lerPreferenciaDaLateral,
} from "@/components/shell/estado-da-lateral";
import type { NavDestination } from "@/lib/navigation/registry";

function montar(recolhida = false, onExpandir?: () => void) {
  return render(
    <TooltipProvider>
      <RodapeDaLateral
        recolhida={recolhida}
        configuracoes={{ href: "/app/settings", label: "Configurações" }}
        onExpandir={onExpandir}
      />
    </TooltipProvider>,
  );
}

/** Radix abre o menu no `pointerdown`, não no `click`. */
function abrir(el: HTMLElement) {
  fireEvent.pointerDown(el, { button: 0, ctrlKey: false, pointerId: 1 });
}

afterEach(() => {
  estado.pathname = "/app/settings/profile";
  estado.abertos = 120;
  estado.tema = "dark";
  vi.clearAllMocks();
});

describe("barra de ícones", () => {
  it("Notificações mostra o badge com 99+ acima de 99, e o número no nome acessível", () => {
    montar();
    expect(screen.getByTestId("alerts-bell-count").textContent).toBe("99+");
    expect(screen.getByTestId("alerts-bell")).toHaveAttribute("aria-label", "Notificações — 120 em aberto");
  });

  it("sem aviso aberto, o badge some", () => {
    estado.abertos = 0;
    montar();
    expect(screen.queryByTestId("alerts-bell-count")).toBeNull();
  });

  it("Configurações leva à rota atual e fica ativa nas sub-rotas", () => {
    montar();
    const config = screen.getByRole("link", { name: "Configurações" });
    expect(config).toHaveAttribute("href", "/app/settings");
    expect(config).toHaveAttribute("aria-current", "page");
    expect(config).toHaveAttribute("data-ativo", "true");
  });

  it("fora de Configurações, o botão não fica ativo", () => {
    estado.pathname = "/app/inbox";
    montar();
    expect(screen.getByRole("link", { name: "Configurações" })).not.toHaveAttribute("aria-current");
  });

  it("o tema mostra o que está valendo e alterna no clique", () => {
    montar();
    const tema = screen.getByTestId("alternar-tema");
    expect(tema.getAttribute("aria-label")).toMatch(/^Tema escuro/);
    fireEvent.click(tema);
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it("o idioma mostra só o código do que está em vigor", () => {
    montar();
    expect(screen.getByTestId("seletor-de-idioma").textContent).toBe("PT");
  });
});

describe("cartão de perfil", () => {
  it("mostra a pessoa, a organização e as iniciais dos dois", () => {
    montar();
    const cartao = screen.getByTestId("tenant-switcher");
    expect(cartao.textContent).toContain("Jonatas Oliveira");
    expect(cartao.textContent).toContain("Apex Company");
    expect(cartao.textContent).toContain("JO");
    expect(cartao.textContent).toContain("AC");
  });

  it("recolhida, sobra só o avatar composto", () => {
    montar(true);
    const cartao = screen.getByTestId("tenant-switcher");
    expect(cartao.textContent).not.toContain("Jonatas Oliveira");
    expect(cartao.getAttribute("aria-label")).toContain("Apex Company");
  });

  it("o menu lista as organizações, troca com a mesma ação, e tem Meu perfil e Sair", async () => {
    montar();
    abrir(screen.getByTestId("tenant-switcher"));
    const menu = await screen.findByTestId("menu-do-perfil");
    expect(menu.textContent).toContain("Organização");
    expect(screen.getByTestId("tenant-switcher-item-a")).toHaveAttribute("data-ativa", "true");
    expect(screen.getByRole("menuitem", { name: /Meu perfil/ })).toHaveAttribute("href", "/app/settings/profile");
    fireEvent.click(screen.getByTestId("tenant-switcher-item-b"));
    expect(trocar).toHaveBeenCalledWith("b");
  });

  it("Sair chama o mesmo logout de antes", async () => {
    montar();
    abrir(screen.getByTestId("tenant-switcher"));
    fireEvent.click(await screen.findByTestId("sair"));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});

describe("regras puras da casca", () => {
  it("iniciais e contagem curta", () => {
    expect(iniciais("Apex Company")).toBe("AC");
    expect(iniciais("  ana  ")).toBe("A");
    expect(iniciais("", "?")).toBe("?");
    expect(contagemCurta(99)).toBe("99");
    expect(contagemCurta(100)).toBe("99+");
  });

  it("o construtor de fluxo tem preferência própria; a lista de fluxos usa a geral", () => {
    expect(ehConstrutorDeFluxo("/app/fluxos/8f0c")).toBe(true);
    expect(ehConstrutorDeFluxo("/app/fluxos")).toBe(false);
    expect(ehConstrutorDeFluxo("/app/inbox")).toBe(false);
  });

  it("a lateral segue a ordem do pedido dentro da seção, e o resto vai para o fim", () => {
    const d = (href: string) => ({ href }) as NavDestination;
    const ordem = ordenarDaLateral([d("/app/campaigns"), d("/app/tasks"), d("/app/fluxos"), d("/app/listas")]);
    expect(ordem.map((x) => x.href)).toEqual(["/app/fluxos", "/app/listas", "/app/campaigns", "/app/tasks"]);
  });
});

describe("contraste do badge (medido, não estimado)", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const luminancia = (hex: string) => {
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255);
    const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
  };
  const contraste = (a: string, b: string) => {
    const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
    return (x! + 0.05) / (y! + 0.05);
  };

  it("--badge-danger passa de 4.5:1 com texto branco, nos dois temas", () => {
    const valores = [...css.matchAll(/--badge-danger:\s*(#[0-9a-fA-F]{6})/g)].map((m) => m[1]!);
    // :root, claro e escuro — os três blocos de tema declaram o token.
    expect(valores).toHaveLength(3);
    for (const v of valores) expect(contraste(v, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("CONTROLE: o vermelho de referência (#e5484d) não passaria — por isso o badge não o usa", () => {
    expect(contraste("#e5484d", "#ffffff")).toBeLessThan(4.5);
  });
});

describe("Etapa 1 — lateral recolhida sempre tem como abrir de novo", () => {
  afterEach(() => window.localStorage.clear());

  it("recolhida, o » aparece no rodapé com o nome acessível e expande no clique", () => {
    const expandir = vi.fn();
    montar(true, expandir);
    const botao = screen.getByTestId("expandir-lateral");
    expect(botao).toHaveAttribute("aria-label", "Expandir menu");
    fireEvent.click(botao);
    expect(expandir).toHaveBeenCalledTimes(1);
  });

  it("aberta, o » não aparece (o « está no cabeçalho)", () => {
    montar(false, vi.fn());
    expect(screen.queryByTestId("expandir-lateral")).toBeNull();
  });

  it("o construtor nasce recolhido e guarda a escolha numa chave SÓ dele", () => {
    expect(lerLateralDoConstrutor()).toBe(true);
    window.localStorage.setItem(CHAVE_DA_LATERAL_DO_CONSTRUTOR, "false");
    expect(lerLateralDoConstrutor()).toBe(false);
    // A preferência geral não foi tocada.
    expect(lerPreferenciaDaLateral()).toBeNull();
    window.localStorage.setItem(CHAVE_DA_LATERAL, "recolhida");
    expect(lerLateralDoConstrutor()).toBe(false);
    expect(CHAVE_DA_LATERAL).not.toBe(CHAVE_DA_LATERAL_DO_CONSTRUTOR);
  });

  it("⌘B/Ctrl+B não dispara num campo, num editor nem com modal aberto", () => {
    const corpo = document.createElement("div");
    corpo.innerHTML = '<input id="c" /><div id="e" contenteditable="true"><span id="dentro"></span></div><button id="b"></button>';
    document.body.appendChild(corpo);
    expect(atalhoDaLateralVale(document.getElementById("b"), document)).toBe(true);
    expect(atalhoDaLateralVale(document.getElementById("c"), document)).toBe(false);
    expect(atalhoDaLateralVale(document.getElementById("dentro"), document)).toBe(false);
    const modal = document.createElement("div");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("data-state", "open");
    document.body.appendChild(modal);
    expect(atalhoDaLateralVale(document.getElementById("b"), document)).toBe(false);
    modal.remove();
    corpo.remove();
  });
});

describe("Etapa 1 — nome no cartão de perfil", () => {
  it("mostra o nome completo; o e-mail só quando não há nome", () => {
    expect(nomeParaMostrar({ full_name: "Jonatas Oliveira", email: "jo@exemplo.test" })).toBe("Jonatas Oliveira");
    expect(nomeParaMostrar({ full_name: "  ", email: "jo@exemplo.test" })).toBe("jo@exemplo.test");
    expect(nomeParaMostrar({ full_name: null, email: "jo@exemplo.test" })).toBe("jo@exemplo.test");
  });

  it("o e-mail completo aparece como dica sobre o nome e no topo do menu", async () => {
    montar();
    const cartao = screen.getByTestId("tenant-switcher");
    expect(cartao.querySelector(".sh-perfil__nome")).toHaveAttribute("title", "jo@exemplo.test");
    abrir(cartao);
    const pessoa = await screen.findByTestId("menu-do-perfil-pessoa");
    expect(pessoa.textContent).toContain("Jonatas Oliveira");
    expect(pessoa.textContent).toContain("jo@exemplo.test");
  });
});
