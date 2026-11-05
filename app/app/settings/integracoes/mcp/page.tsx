import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { ConexoesMcpClient } from "./_components/ConexoesMcpClient";

export const dynamic = "force-dynamic";

/**
 * Configurações › Integrações › MCP (migration 9923): conectar o Claude, o
 * Cursor ou outra ferramenta de IA ao CRM com permissões limitadas. Só admin.
 */
export default async function ConexoesMcpPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg || ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }
  const idioma = user.idioma;

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{traduzir("Conexões MCP", idioma)}</h1>
        <p className="text-sm text-muted-foreground">
          {traduzir("Conecte o Claude, o Cursor ou outra ferramenta de IA ao CRM. Cada conexão só faz o que você liberar, e tudo fica registrado.", idioma)}
        </p>
      </header>
      <ConexoesMcpClient />
    </div>
  );
}
