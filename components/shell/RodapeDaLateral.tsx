"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Popover from "@radix-ui/react-popover";
import { toast } from "sonner";
import {
  CircleArrowUp,
  Bell,
  Check,
  ChevronsRight,
  ChevronsUpDown,
  LogOut,
  Moon,
  Plus,
  Settings,
  ShieldCheck,
  Sun,
  User,
} from "lucide-react";

import { trocarIdioma } from "@/app/actions/settings/trocarIdioma";
import { AgentInboxList } from "@/app/app/ai/inbox/_components/AgentInboxList";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useAgentInbox } from "@/hooks/ai/useAgentInbox";
import { useT } from "@/hooks/i18n/useT";
import { useSystemVersion } from "@/hooks/system/useSystemVersion";
import { ROLE_RANK } from "@/lib/auth/types";
import { useAplicarIdioma, useIdioma } from "@/lib/i18n/IdiomaProvider";
import { type Idioma } from "@/lib/i18n/idiomas";
import { IDIOMAS_VISIVEIS, idiomaVisivelPorCodigo } from "@/lib/i18n/registro";
import { destinosDaInterface } from "@/lib/navigation/interface";
import { useTheme } from "@/lib/theme";

import { useTrocaDeOrganizacao } from "./useTrocaDeOrganizacao";

/** As iniciais de um nome: até duas palavras ("Apex Company" → "AC"). */
export function iniciais(nome: string | null | undefined, reserva = "?"): string {
  const partes = (nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return reserva;
  return partes
    .slice(0, 2)
    .map((p) => [...p][0] ?? "")
    .join("")
    .toUpperCase();
}

/** "99+" acima de 99; o número cru abaixo. */
export function contagemCurta(n: number): string {
  return n > 99 ? "99+" : String(n);
}

/** Tooltip da lateral: à direita, 300ms (o `TooltipProvider` da lateral define o atraso). */
function Dica({ texto, children }: { texto: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{texto}</TooltipContent>
    </Tooltip>
  );
}

/**
 * O nome que o cartão mostra: o nome completo do cadastro; o e-mail só quando
 * não há nome nenhum.
 */
export function nomeParaMostrar(user: { full_name: string | null; email: string }): string {
  return user.full_name?.trim() || user.email;
}

/**
 * O rodapé da lateral (Etapa 7): quatro botões — Notificações, Idioma, Tema e
 * Configurações — e o cartão de perfil + organização. Tudo o que morava na
 * barra do topo e não é busca veio para cá.
 */
export function RodapeDaLateral({
  recolhida,
  configuracoes,
  onNavigate,
  onExpandir,
}: {
  recolhida: boolean;
  /** O hub de Configurações do registro, quando o papel o vê. */
  configuracoes: { href: string; label: string } | null;
  onNavigate?: () => void;
  /** Recolhida, o botão de expandir mora aqui, acima da coluna de ícones. */
  onExpandir?: () => void;
}) {
  const t = useT();
  return (
    <div className="sh-rodape" data-testid="rodape-da-lateral">
      {/* Recolhida, o » mora aqui, acima dos ícones — em TODA tela, inclusive
          no construtor de fluxo: lateral recolhida sem como reabrir não existe. */}
      {recolhida && onExpandir && (
        <div className="sh-rodape__expandir">
          <Dica texto={t("Expandir menu")}>
            <button
              type="button"
              className="sh-botao-recolher"
              onClick={onExpandir}
              aria-label={t("Expandir menu")}
              data-testid="expandir-lateral"
            >
              <ChevronsRight size={16} aria-hidden />
            </button>
          </Dica>
        </div>
      )}
      <div className="sh-icones">
        <BotaoDeNotificacoes />
        <BotaoDeIdioma />
        <BotaoDeTema />
        {configuracoes && <BotaoDeConfiguracoes {...configuracoes} onNavigate={onNavigate} />}
      </div>
      <CartaoDePerfil recolhida={recolhida} onNavigate={onNavigate} />
    </div>
  );
}

// ── 1. Notificações ──────────────────────────────────────────────────────────

function BotaoDeNotificacoes() {
  const { user, activeOrg } = useAuth();
  // O mesmo portão do sino antigo: só quem tem a Central de avisos na interface.
  const temCentral = destinosDaInterface(
    activeOrg?.interface_settings,
    user.is_platform_admin && !user.support,
    activeOrg?.role ?? null,
  ).some((d) => d.href === "/app/ai/inbox");
  if (!temCentral) return null;
  return <Notificacoes podeResolver={!!activeOrg && ROLE_RANK[activeOrg.role] >= ROLE_RANK.agent} />;
}

function Notificacoes({ podeResolver }: { podeResolver: boolean }) {
  const t = useT();
  const { data } = useAgentInbox("open");
  const abertos = data?.open_count ?? 0;
  const rotulo = abertos > 0 ? `${t("Notificações")} — ${abertos} ${t("em aberto")}` : t("Notificações");
  return (
    <Popover.Root>
      <Dica texto={t("Notificações")}>
        <Popover.Trigger asChild>
          <button type="button" className="sh-tile" aria-label={rotulo} data-testid="alerts-bell">
            <Bell size={16} aria-hidden />
            {abertos > 0 && (
              <span className="sh-tile__badge" data-testid="alerts-bell-count" aria-hidden>
                {contagemCurta(abertos)}
              </span>
            )}
          </button>
        </Popover.Trigger>
      </Dica>
      <Popover.Portal>
        {/* O painel de hoje — a lista da Central de avisos —, ancorado no botão. */}
        <Popover.Content
          side="right"
          align="end"
          sideOffset={12}
          collisionPadding={12}
          className="sh-menu sh-menu--notificacoes"
          data-testid="painel-de-notificacoes"
        >
          <div className="sh-menu__cabecalho">
            <span>{t("Central de avisos")}</span>
            <Popover.Close asChild>
              <Link href="/app/ai/inbox">{t("Abrir a central")}</Link>
            </Popover.Close>
          </div>
          <div className="sh-menu__corpo">
            <AgentInboxList canResolve={podeResolver} />
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

// ── 2. Idioma ────────────────────────────────────────────────────────────────

/**
 * Trocar de idioma em dois cliques, de qualquer tela — quem precisa disto é
 * justamente quem abriu o sistema num idioma que não lê e não acharia
 * Configurações. O rótulo é o código ("PT"), legível em qualquer idioma.
 */
function BotaoDeIdioma() {
  const t = useT();
  const idioma = useIdioma();
  const emVigor = idiomaVisivelPorCodigo(idioma);
  const aplicar = useAplicarIdioma();
  const [salvando, startTransition] = useTransition();

  const escolher = (novo: Idioma) => {
    if (novo === idioma) return;
    const anterior = idioma;
    // Pinta primeiro; se o servidor recusar, volta e diz.
    aplicar(novo);
    startTransition(async () => {
      const r = await trocarIdioma(novo);
      if (!r.ok) {
        aplicar(anterior);
        toast.error(t("Não foi possível trocar o idioma. Tente de novo."));
        return;
      }
      // Recarga inteira, e não `router.refresh()`: o Router Cache do cliente
      // guarda o layout de `/app` (quem monta o `IdiomaProvider`), e a primeira
      // navegação depois do refresh ainda vinha no idioma antigo (medido).
      window.location.reload();
    });
  };

  return (
    <DropdownMenu.Root>
      <Dica texto={t("Idioma")}>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="sh-tile"
            disabled={salvando}
            aria-label={`${t("Idioma")}: ${emVigor.nomeNativo}`}
            data-testid="seletor-de-idioma"
          >
            <span className="sh-tile__codigo">{emVigor.rotuloCurto}</span>
          </button>
        </DropdownMenu.Trigger>
      </Dica>
      <DropdownMenu.Portal>
        <DropdownMenu.Content side="right" align="end" sideOffset={12} collisionPadding={12} className="sh-menu">
          {IDIOMAS_VISIVEIS.map(({ codigo, nomeNativo, rotuloCurto }) => (
            <DropdownMenu.Item
              key={codigo}
              className="sh-menu__item"
              onSelect={() => escolher(codigo)}
              data-testid={`idioma-${codigo}`}
              aria-current={codigo === idioma}
            >
              <span className="sh-menu__codigo">{rotuloCurto}</span>
              <span className="sh-menu__nome">{nomeNativo}</span>
              {codigo === idioma && <Check size={15} className="sh-menu__check" aria-hidden />}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

// ── 3. Tema ──────────────────────────────────────────────────────────────────

function BotaoDeTema() {
  const t = useT();
  const { resolvedTheme, toggle } = useTheme();
  const escuro = resolvedTheme === "dark";
  const nome = escuro ? t("Tema escuro") : t("Tema claro");
  return (
    <Dica texto={nome}>
      <button
        type="button"
        className="sh-tile"
        onClick={toggle}
        aria-label={`${nome}. ${t("Alternar tema")}`}
        data-testid="alternar-tema"
        // O servidor não sabe o tema salvo no navegador: o primeiro render do
        // cliente corrige o ícone, e é o descompasso esperado de todo seletor.
        suppressHydrationWarning
      >
        {escuro ? <Moon size={16} aria-hidden /> : <Sun size={16} aria-hidden />}
      </button>
    </Dica>
  );
}

// ── 4. Configurações ─────────────────────────────────────────────────────────

/** `label` chega já traduzido: quem o lê do registro é a lateral. */
function BotaoDeConfiguracoes({ href, label, onNavigate }: { href: string; label: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  const ativa = pathname === href || pathname.startsWith(href + "/");
  return (
    <Dica texto={label}>
      <Link
        href={href}
        className="sh-tile"
        aria-label={label}
        aria-current={ativa ? "page" : undefined}
        data-ativo={ativa ? "true" : undefined}
        onClick={onNavigate}
      >
        <Settings size={16} aria-hidden />
      </Link>
    </Dica>
  );
}

// ── Cartão de perfil + organização ───────────────────────────────────────────

function CartaoDePerfil({ recolhida, onNavigate }: { recolhida: boolean; onNavigate?: () => void }) {
  const t = useT();
  const { user, activeOrg, signOut } = useAuth();
  const { trocar, trocando } = useTrocaDeOrganizacao();
  const [saindo, startSaida] = useTransition();
  const [aberto, setAberto] = useState(false);
  const nomeDaPessoa = nomeParaMostrar(user);
  const nomeDaOrg = activeOrg?.name ?? t("Selecionar org");
  const logoDaOrg = activeOrg?.marca?.logoUrl ?? null;
  const emSuporte = !!user.support;

  return (
    <DropdownMenu.Root open={aberto} onOpenChange={setAberto}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="sh-perfil"
          aria-label={`${t("Perfil e organização")}: ${nomeDaPessoa} — ${t("Organização")}: ${nomeDaOrg}`}
          data-testid="tenant-switcher"
          disabled={trocando}
        >
          <span className="sh-avatar" aria-hidden>
            <span className="sh-avatar__pessoa">
              {user.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatar_url} alt="" />
              ) : (
                iniciais(user.full_name, user.email.slice(0, 2).toUpperCase())
              )}
            </span>
            <span className="sh-avatar__org">
              {logoDaOrg ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoDaOrg} alt="" />
              ) : (
                iniciais(activeOrg?.name)
              )}
            </span>
          </span>
          {!recolhida && (
            <>
              <span className="sh-perfil__textos">
                <span className="sh-perfil__nome" title={user.email || undefined}>
                  {nomeDaPessoa}
                </span>
                <span className="sh-perfil__org">{nomeDaOrg}</span>
              </span>
              <ChevronsUpDown size={15} className="sh-perfil__seta" aria-hidden />
            </>
          )}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side={recolhida ? "right" : "top"}
          align={recolhida ? "end" : "start"}
          sideOffset={8}
          collisionPadding={12}
          className={recolhida ? "sh-menu" : "sh-menu sh-menu--perfil"}
          data-testid="menu-do-perfil"
        >
          <div className="sh-menu__pessoa" data-testid="menu-do-perfil-pessoa">
            <span className="sh-menu__pessoa-nome">{nomeDaPessoa}</span>
            {user.email && <span className="sh-menu__pessoa-email">{user.email}</span>}
          </div>
          <DropdownMenu.Separator className="sh-menu__divisoria" />
          <DropdownMenu.Label className="sh-menu__titulo">{t("Organização")}</DropdownMenu.Label>
          <div className="sh-menu__lista">
            {user.organizations.map((org) => {
              const ativa = org.organization_id === activeOrg?.orgId;
              return (
                <DropdownMenu.Item
                  key={org.organization_id}
                  className="sh-menu__item"
                  data-ativa={ativa ? "true" : undefined}
                  disabled={emSuporte && !ativa}
                  onSelect={() => void trocar(org.organization_id)}
                  data-testid={`tenant-switcher-item-${org.organization_id}`}
                >
                  <span className="sh-menu__quadrado" aria-hidden>
                    {ativa && logoDaOrg ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logoDaOrg} alt="" />
                    ) : (
                      iniciais(org.organization_name)
                    )}
                  </span>
                  <span className="sh-menu__nome">{org.organization_name}</span>
                  {ativa && <Check size={15} className="sh-menu__check" aria-label={t("Organização ativa")} />}
                </DropdownMenu.Item>
              );
            })}
          </div>
          {/* Criar organização existe hoje só para o dono do servidor, no painel da instalação. */}
          {user.is_platform_admin && !emSuporte && (
            <>
              <DropdownMenu.Item asChild className="sh-menu__item">
                <Link href="/admin/tenants/new" onClick={onNavigate}>
                  <span className="sh-menu__quadrado sh-menu__quadrado--novo" aria-hidden>
                    <Plus size={14} />
                  </span>
                  <span className="sh-menu__nome">{t("Nova organização")}</span>
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Item asChild className="sh-menu__item">
                <Link href="/admin/tenants" onClick={onNavigate}>
                  <span className="sh-menu__nome">{t("Gerenciar organizações")}</span>
                </Link>
              </DropdownMenu.Item>
            </>
          )}
          <DropdownMenu.Separator className="sh-menu__divisoria" />
          <DropdownMenu.Item asChild className="sh-menu__item">
            <Link href="/app/settings/profile" onClick={onNavigate}>
              <User size={16} aria-hidden />
              <span className="sh-menu__nome">{t("Meu perfil")}</span>
            </Link>
          </DropdownMenu.Item>
          {/*
            O que o menu do avatar da barra do topo tinha além de sair: a porta
            do Modo administrador (só o dono do servidor) e, do rodapé antigo da
            lateral, a versão instalada.
          */}
          {user.is_platform_admin && (
            <DropdownMenu.Item asChild className="sh-menu__item">
              <Link href="/admin" onClick={onNavigate} data-testid="porta-modo-administrador">
                <ShieldCheck size={16} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="sh-menu__nome block">{t("Modo administrador")}</span>
                  <span className="sh-menu__sub">{t("Configurar este servidor")}</span>
                </span>
              </Link>
            </DropdownMenu.Item>
          )}
          <ItemDaVersao onNavigate={onNavigate} />
          <DropdownMenu.Item
            className="sh-menu__item sh-menu__item--sair"
            disabled={saindo}
            onSelect={() =>
              startSaida(async () => {
                await signOut();
              })
            }
            data-testid="sair"
          >
            <LogOut size={16} aria-hidden />
            <span className="sh-menu__nome">{t("Sair")}</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/**
 * A versão instalada (era o rodapé da lateral). Vira aviso clicável só para
 * quem é dono do servidor E tem versão nova — quem não pode atualizar não é
 * alertado sobre algo que não pode resolver.
 */
function ItemDaVersao({ onNavigate }: { onNavigate?: () => void }) {
  const t = useT();
  const { data } = useSystemVersion();
  if (!data?.current_version) return null;
  const versao = data.current_version.replace(/^v/i, "");
  if (!(data.is_owner && data.update_available)) {
    return (
      <DropdownMenu.Item className="sh-menu__item" disabled data-testid="versao-instalada">
        <span className="sh-menu__sub">{`${t("versão")} ${versao}`}</span>
      </DropdownMenu.Item>
    );
  }
  const nova = data.latest_version?.replace(/^v/i, "") ?? "";
  return (
    <DropdownMenu.Item asChild className="sh-menu__item">
      <Link href="/app/settings/atualizacao" onClick={onNavigate} data-testid="versao-nova">
        <CircleArrowUp size={16} aria-hidden />
        <span className="sh-menu__nome">
          {t("Nova versão")}
          {nova ? ` · ${nova}` : ""}
        </span>
      </Link>
    </DropdownMenu.Item>
  );
}
