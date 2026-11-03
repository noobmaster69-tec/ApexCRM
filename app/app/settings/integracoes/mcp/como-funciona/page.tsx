import Link from "next/link";

import { requireAuth } from "@/lib/auth/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { FRASE_DO_RESUMO, PROIBICOES_FIXAS } from "@/lib/mcp/v1/escopos";
import { ESCRITAS_POR_DIA, POR_DIA, POR_MINUTO } from "@/lib/mcp/v1/limites";

export const dynamic = "force-dynamic";

/** Ajuda das conexões MCP — o mesmo conteúdo de `docs/mcp-seguro.md`, para quem opera. */
export default async function ComoFuncionaMcpPage() {
  const user = await requireAuth();
  const t = (texto: string) => traduzir(texto, user.idioma);
  const numero = (v: number) => v.toLocaleString(user.idioma);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-6 text-sm">
      <h1 className="text-2xl font-semibold tracking-tight">{t("Como funcionam as conexões MCP")}</h1>
      <p>
        {t("MCP é o jeito padrão de uma ferramenta de IA (Claude Code, Claude Desktop, Cursor) usar um sistema. Uma conexão deixa a ferramenta ler e, se você liberar, editar partes do CRM — sempre em nome de quem criou a conexão.")}
      </p>
      <h2 className="text-lg font-semibold">{t("O que protege a sua organização")}</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>{t("Nada funciona enquanto \"Permitir conexões MCP\" estiver desligado.")}</li>
        <li>{t("Cada conexão tem permissões fechadas, e nunca passa do papel atual de quem a criou: se essa pessoa sair ou perder papel, a conexão perde junto.")}</li>
        <li>{t("Telefone e e-mail saem mascarados, a menos que você ligue o acesso a dados pessoais.")}</li>
        <li>{t("Limites por conexão: {a} chamadas por minuto, {b} por dia e {c} alterações por dia.")
            .replace("{a}", numero(POR_MINUTO))
            .replace("{b}", numero(POR_DIA))
            .replace("{c}", numero(ESCRITAS_POR_DIA))}</li>
        <li>{t("Toda chamada fica registrada. Muitas recusas seguidas suspendem a conexão e avisam os admins na Central.")}</li>
        <li>{t("O token aparece uma vez só. No banco fica apenas uma impressão digital dele, e você pode revogar ou renovar quando quiser.")}</li>
      </ul>
      <h2 className="text-lg font-semibold">{t("O que nenhuma conexão faz")}</h2>
      <ul className="list-disc space-y-1 pl-5">
        {PROIBICOES_FIXAS.map((k) => (
          <li key={k}>{t(FRASE_DO_RESUMO[k])}</li>
        ))}
      </ul>
      <p>
        <Link href="/app/settings/integracoes/mcp" className="underline underline-offset-2">
          {t("Voltar para Conexões MCP")}
        </Link>
      </p>
    </div>
  );
}
