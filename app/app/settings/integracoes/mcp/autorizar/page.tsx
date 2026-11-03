import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { lerInterruptor } from "@/lib/mcp/v1/conexoes";
import { conferirPedido } from "@/lib/mcp/v1/oauth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ConsentimentoMcp } from "./_components/ConsentimentoMcp";

export const dynamic = "force-dynamic";

/**
 * A TELA DE CONSENTIMENTO OAuth do MCP. O Claude Desktop / claude.ai manda o
 * admin para cá com `client_id`, `redirect_uri` e o desafio PKCE; o admin
 * logado escolhe o perfil e aprova — e nasce uma conexão como as outras.
 *
 * Pedido inválido (cliente desconhecido, redirect não registrado, sem PKCE)
 * mostra o erro AQUI e não redireciona: redirecionar para um endereço não
 * conferido faria desta página um redirecionador aberto.
 */
export default async function AutorizarMcpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireAuth();
  const idioma = user.idioma;
  const t = (texto: string) => traduzir(texto, idioma);
  const bruto = await searchParams;
  const pedido = Object.fromEntries(
    Object.entries(bruto).flatMap(([k, v]) => (typeof v === "string" ? [[k, v.slice(0, 2000)]] : [])),
  ) as Record<string, string>;

  const activeOrg = await resolveActiveOrg(user);
  const db = createAdminClient();
  const conferido = await conferirPedido(db, pedido);

  let aviso: string | null = null;
  if (!conferido.ok) aviso = t(conferido.erro);
  else if (!activeOrg || ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    aviso = t("Só um admin da organização pode autorizar uma conexão MCP.");
  } else if (!(await lerInterruptor(db, activeOrg.orgId))) {
    aviso = t("Esta organização não permite conexões MCP. Um admin precisa ligar \"Permitir conexões MCP\" em Configurações › Integrações › MCP.");
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("Autorizar conexão MCP")}</h1>
        {conferido.ok ? (
          <p className="text-sm text-muted-foreground">
            <strong>{conferido.cliente.client_name}</strong> {t("pede acesso ao CRM de")} <strong>{activeOrg?.name ?? "—"}</strong>.
          </p>
        ) : null}
      </header>
      {aviso || !conferido.ok ? (
        <p className="rounded-md border border-destructive p-4 text-sm" role="alert">
          {aviso}
        </p>
      ) : (
        <ConsentimentoMcp pedido={pedido} nomeDoCliente={conferido.cliente.client_name} />
      )}
    </div>
  );
}
