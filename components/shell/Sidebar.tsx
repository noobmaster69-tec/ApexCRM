"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ComponentType } from "react";
import {
  Bot,
  Cable,
  ChevronsLeft,
  Gauge,
  Inbox,
  KeyRound,
  ListChecks,
  Megaphone,
  Plug,
  SquareKanban,
  Users,
  Webhook,
  Zap,
} from "lucide-react";
import { useT } from "@/hooks/i18n/useT";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { ConnectionHealthDot } from "@/components/connections/ConnectionHealthDot";
import { ContadorDeCasos } from "@/components/shell/ContadorDeCasos";
import { ContadorDaFila } from "@/components/shell/ContadorDaFila";
import { RodapeDaLateral } from "@/components/shell/RodapeDaLateral";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LogotipoDoProduto, SimboloDoProduto } from "@/components/branding/MarcaDoProduto";
import { marcaEhADoProduto } from "@/lib/branding";
import { useMarcaDaInstalacao } from "@/lib/branding/contexto";
import { GRUPO_NO_RODAPE, sidebarGroups, type NavDestination } from "@/lib/navigation/registry";
import { aplicarMenuOculto, chaveDoMenuOculto, lerMenuOculto } from "@/lib/navigation/menu-pessoal";
import "./shell.css";
import { usePrefetchPorIntencao } from "@/hooks/navigation/prefetchPorIntencao";

/**
 * A ordem e os ícones da lateral (Etapa 7). Quem decide QUAIS telas aparecem
 * continua sendo o registro (`sidebarGroups`: papel, módulo, interface do
 * vínculo, preferência de menu); aqui só se ordena dentro de cada seção e se
 * troca o ícone. Tela que não está nesta lista segue no fim da sua seção, com
 * o ícone do registro.
 */
const ORDEM_DA_LATERAL = [
  "/app/inbox",
  "/app/crms",
  "/app/contacts",
  "/app/fluxos",
  "/app/listas",
  "/app/campaigns",
  "/app/ai/agents",
  "/app/ai/credentials",
  "/app/ai/providers",
  "/app/ai/usage",
  "/app/connections",
  "/app/webhooks",
] as const;

const ICONE_DA_LATERAL: Record<string, ComponentType<{ size?: number; "aria-hidden"?: boolean }>> = {
  "/app/inbox": Inbox,
  "/app/crms": SquareKanban,
  "/app/contacts": Users,
  "/app/fluxos": Zap,
  "/app/listas": ListChecks,
  "/app/campaigns": Megaphone,
  "/app/ai/agents": Bot,
  "/app/ai/credentials": KeyRound,
  "/app/ai/providers": Plug,
  "/app/ai/usage": Gauge,
  "/app/connections": Cable,
  "/app/webhooks": Webhook,
};

export function ordenarDaLateral(items: readonly NavDestination[]): NavDestination[] {
  const posicao = (href: string) => {
    const i = (ORDEM_DA_LATERAL as readonly string[]).indexOf(href);
    return i < 0 ? ORDEM_DA_LATERAL.length : i;
  };
  // `sort` é estável: o que não está na lista mantém a ordem do registro.
  return [...items].sort((a, b) => posicao(a.href) - posicao(b.href));
}

interface SidebarContentProps {
  collapsed: boolean;
  showCollapseControl?: boolean;
  onNavigate?: () => void;
  /** Recolher/expandir. Ausente, o botão não aparece (gaveta, construtor). */
  onToggle?: () => void;
}

/**
 * Cabeçalho (marca + recolher), navegação (só ela rola) e rodapé fixo (ícones
 * + cartão de perfil). Desenha o que `sidebarGroups()` resolveu — não decide
 * quem vê o quê.
 */
export function SidebarContent({
  collapsed,
  showCollapseControl = true,
  onNavigate,
  onToggle,
}: SidebarContentProps) {
  // A barra lateral aparece em TODA tela — traduzi-la aqui é o que faz a
  // escolha de idioma virar algo visível no primeiro clique.
  const t = useT();
  const pathname = usePathname();
  const { user, activeOrg } = useAuth();
  const todos = sidebarGroups(
    user.is_platform_admin && !user.support,
    activeOrg?.role ?? null,
    activeOrg?.interface_settings,
    activeOrg?.modulos_ligados ?? [],
    activeOrg?.capacidades_ligadas ?? [],
  );
  // A preferência PESSOAL de menu (fork jhoow, P6) é a última camada e só
  // esconde. Vem do servidor junto com a organização ativa; o espelho no
  // navegador só entra se o servidor não a trouxe (lido depois de montar, para
  // servidor e navegador pintarem o mesmo menu).
  const [ocultoDoNavegador, setOcultoDoNavegador] = useState<string[] | null>(null);
  const ocultoDoServidor = activeOrg?.menu_oculto;
  useEffect(() => {
    if (ocultoDoServidor !== undefined) return;
    try {
      const bruto = window.localStorage.getItem(chaveDoMenuOculto(user.id, activeOrg?.orgId ?? null));
      if (bruto) setOcultoDoNavegador(lerMenuOculto(JSON.parse(bruto)));
    } catch {
      // Storage bloqueado ou valor estragado: o menu fica inteiro.
    }
  }, [ocultoDoServidor, user.id, activeOrg?.orgId]);
  const grupos = aplicarMenuOculto(
    todos.filter((g) => g.group.id !== GRUPO_NO_RODAPE),
    ocultoDoServidor ?? ocultoDoNavegador ?? [],
  );
  // Configurações sai da área que rola e vira o 4º botão do rodapé.
  const grupoDoRodape = todos.find((g) => g.group.id === GRUPO_NO_RODAPE);
  const rodape = grupoDoRodape?.group.hub ?? null;
  // "Ajuda" (1.99, #3567) chega pelo registro, com o mesmo filtro de papel e de
  // módulo do resto do menu — nunca como link escrito à mão aqui.
  const ajuda = grupoDoRodape?.items.find((d) => d.href === "/app/ajuda") ?? null;

  const brand = useMarcaDaInstalacao();
  /**
   * O CONSUMIDOR do nome por organização.
   *
   * Sem ele, `settings.branding.app_name` seria campo decorativo: medido, o nome
   * da org não aparece em lugar nenhum da casca para o cliente típico de um
   * revendedor — o único leitor é o `TenantSwitcher`, e ele devolve `null` com
   * uma organização só.
   *
   * A marca da INSTALAÇÃO continua embaixo: a organização que não definiu nome
   * vê exatamente o que via antes. O que mudou é POR ONDE ela chega — era
   * `branding()`, que no navegador lê `window.__PUBLIC_ENV__` e no servidor lê
   * `process.env`, e essas duas fontes passaram a divergir quando o layout raiz
   * começou a injetar a marca do BANCO. Divergência entre SSR e cliente aqui não
   * é detalhe: com logo no banco e `APP_LOGO_URL` vazio, o servidor desenhava o
   * `<span>` de baixo e o cliente desenhava o `<img>` — React #418 em toda tela.
   * Hoje a marca vem por PROP do servidor (`useMarcaDaInstalacao`), pela mesma
   * rota de `activeOrg`, e os dois lados leem o mesmo objeto por construção.
   */
  const nome = activeOrg?.marca?.nome ?? brand.name;
  /**
   * O mesmo desenho para o LOGO — e é este par de linhas que fecha o caminho do
   * `logo_url` gravado até a tela.
   *
   * `||` e não `??`: vazio é AUSÊNCIA de logo, não "logo em branco". É a regra
   * que `resolveBranding` e `primeiroDefinido` já aplicam nas camadas de baixo, e
   * com `??` um `""` vindo de cima apagaria o logo do revendedor em vez de
   * descer para ele — que é o contrário do que a precedência por campo promete.
   */
  const logo = activeOrg?.marca?.logoUrl || brand.logoUrl;
  const logoEscuro =
    activeOrg?.marca?.logoDarkUrl !== undefined
      ? activeOrg.marca.logoDarkUrl
      : activeOrg?.marca?.logoUrl
        ? null
        : brand.logoDarkUrl;
  // Só quando NINGUÉM — nem a instalação, nem a organização — pôs marca própria:
  // é a condição de `lib/branding.ts`, avaliada sobre o que a barra vai mostrar.
  const marcaDoProduto = marcaEhADoProduto({ name: nome, logoUrl: logo ?? null });

  const podeRecolher = showCollapseControl && onToggle !== undefined;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="sh-cab">
        <div className={collapsed ? "sh-cab__simbolo" : "sh-cab__marca"}>
          {(logo || logoEscuro) && !collapsed ? (
            // Sem arte própria para o escuro, preserva a proteção de contraste.
            <div
              className={cn(
                "rounded-md",
                !logoEscuro && "dark:bg-white dark:px-2 dark:py-0.5 dark:shadow-sm",
              )}
            >
              {/* <img> em vez de next/image de propósito: a URL vem de quem hospeda
                (banco ou .env), e next/image exige allowlist de domínios fechada em
                build — a imagem pré-buildada rejeitaria o domínio do self-hoster.
                Altura fixa e largura livre porque a arte enviada tem proporção
                desconhecida; forçar as duas distorceria o logo de quem configurou. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {logo ? (
                <img
                  src={logo}
                  alt={nome}
                  className={cn("h-6 w-auto max-w-[10rem] object-contain", logoEscuro && "dark:hidden")}
                />
              ) : (
                <span className="dark:hidden">{nome}</span>
              )}
              {logoEscuro ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoEscuro} alt={nome} className="hidden h-6 w-auto max-w-[10rem] object-contain dark:block" />
              ) : null}
            </div>
          ) : marcaDoProduto ? (
            // O desenho do produto, inline (ver `components/branding/MarcaDoProduto.tsx`):
            // logotipo com a barra aberta, só o símbolo (34×34) com ela recolhida.
            collapsed ? (
              <SimboloDoProduto nome={nome} className="h-[34px] w-[34px]" />
            ) : (
              <LogotipoDoProduto nome={nome} className="h-6 w-auto" />
            )
          ) : (
            <span className={cn("truncate font-semibold tracking-tight", collapsed && "sr-only")}>{nome}</span>
          )}
          {collapsed && !marcaDoProduto && (
            <span aria-hidden className="text-lg font-bold text-primary">
              {/* Spread e não `[0]`: nome começando com emoji ou acento composto
                  quebraria no meio do code point. A inicial acompanha o nome que
                  a barra mostra, senão recolher o menu troca a marca. */}
              {[...nome][0]?.toUpperCase() ?? brand.initial}
            </span>
          )}
        </div>
        {/* Aberta, o « fica no cabeçalho; recolhida, o » vai para o rodapé. */}
        {!collapsed && podeRecolher && (
          <button type="button" className="sh-botao-recolher sh-cab__recolher" onClick={onToggle} aria-label={t("Recolher menu")}>
            <ChevronsLeft size={16} aria-hidden />
          </button>
        )}
        {/* Issue #2722 — o controle de recolher mora no ALTO, como no
            mercado: na linha da logo, à direita, quando a barra está aberta. */}
        {showCollapseControl && !collapsed && (
          // `shrink-0`: sem isso o botão é o primeiro a ser espremido quando a
          // marca é larga — e ele é o controle, não sobra.
          <div className="ml-auto shrink-0 pl-2">
            <BotaoDeRecolher
              collapsed={false}
              isPending={isPending}
              soIcone
              onClick={() => startTransition(() => toggleSidebar(collapsed))}
            />
          </div>
        )}
      </div>
      <nav className="sh-nav" aria-label={t("Navegação principal")}>
        {grupos.map(({ group, items }, i) => {
          const tituloId = `nav-grupo-${group.id}`;
          return (
            <div key={group.id} className="sh-grupo">
              {/* Recolhida, o título da seção vira uma divisória de 1px. */}
              {collapsed ? (
                i > 0 ? <div aria-hidden className="sh-divisoria" /> : null
              ) : (
                <h2 id={tituloId} className="sh-secao">
                  {t(group.label)}
                </h2>
              )}
              <ul
                aria-labelledby={collapsed ? undefined : tituloId}
                aria-label={collapsed ? t(group.label) : undefined}
                className="sh-grupo"
              >
                {ordenarDaLateral(items).map((item) => (
                  <li key={item.href}>
                    <ItemDaLateral item={item} ativo={pathname === item.href || pathname.startsWith(item.href + "/")} recolhida={collapsed} onNavigate={onNavigate} />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>
      <RodapeDaLateral
        recolhida={collapsed}
        configuracoes={rodape && { href: rodape.href, label: t(rodape.label) }}
        ajuda={ajuda && { href: ajuda.href, label: t(ajuda.label) }}
        onNavigate={onNavigate}
        onExpandir={podeRecolher ? onToggle : undefined}
      />
    </TooltipProvider>
  );
}

function ItemDaLateral({
  item,
  ativo,
  recolhida,
  onNavigate,
}: {
  item: NavDestination;
  ativo: boolean;
  recolhida: boolean;
  onNavigate?: () => void;
}) {
  const t = useT();
  /**
   * O menu não prefetcha sozinho (#3170): um render RSC por link do menu (19
   * destinos × as duas instâncias, lateral e móvel), e eles disputam o servidor
   * com o render que o clique pediu. O prefetch passa a ser
   * por intenção (ponteiro/foco) — ver `hooks/navigation/prefetchPorIntencao.ts`.
   */
  const intencao = usePrefetchPorIntencao();
  const IconeLucide = ICONE_DA_LATERAL[item.href];
  const IconeDoRegistro = item.icon;
  const link = (
    <Link
      href={item.href}
      {...intencao(item.href)}
      aria-current={ativo ? "page" : undefined}
      onClick={onNavigate}
      className="sh-item"
    >
      <span className="sh-item__icone">
        {IconeLucide ? <IconeLucide size={17} aria-hidden /> : <IconeDoRegistro size={17} weight={ativo ? "fill" : "regular"} aria-hidden />}
      </span>
      <span className={recolhida ? "sr-only" : "sh-item__rotulo"}>{t(item.label)}</span>
      {item.healthDot && <ConnectionHealthDot variante="lateral" />}
      {item.contador === "casos" && <ContadorDeCasos compacto={recolhida} />}
      {item.contador === "fila" && <ContadorDaFila compacto={recolhida} />}
    </Link>
  );
  if (!recolhida) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{t(item.label)}</TooltipContent>
    </Tooltip>
  );
}

export function Sidebar({
  collapsed,
  automatica = false,
  pronta = false,
  onToggle,
}: {
  collapsed: boolean;
  /** Sem escolha salva: a largura da janela decide (ver `shell.css`). */
  automatica?: boolean;
  /** Montada no cliente: a partir daqui a troca de largura anima. */
  pronta?: boolean;
  onToggle?: () => void;
}) {
  return (
    <aside
      // ⚠️ `sticky top-0`, e NUNCA `fixed`: com `fixed` a barra sai do fluxo e
      // alguém precisa afastar o conteúdo com uma segunda medida — no dia em que
      // as duas discordaram, a barra passou por cima da lista de conversas. Na
      // casca de altura fixa (`.sh-app`, 100vh) ela não rola de qualquer jeito;
      // o `sticky` fica como garantia caso a casca volte a rolar.
      className="sh-side sh-side--fixa sticky top-0 h-screen shrink-0"
      data-recolhida={collapsed ? "true" : undefined}
      data-automatica={automatica ? "true" : undefined}
      data-pronta={pronta ? "true" : undefined}
      data-testid="lateral"
    >
      <SidebarContent collapsed={collapsed} onToggle={onToggle} />
    </aside>
  );
}
