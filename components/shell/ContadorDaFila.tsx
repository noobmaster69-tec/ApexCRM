"use client";

import { useAuth } from "@/hooks/auth/AuthProvider";
import { useConversationCounts } from "@/hooks/inbox/useConversationCounts";
import { useT } from "@/hooks/i18n/useT";

/**
 * Quantas conversas esperam uma PESSOA — o número ao lado de "Inbox" no menu.
 *
 * É a aba Fila: conversa sem dono em que o automático saiu de campo — a IA
 * passou a conversa para a equipe (cliente irritado, pedido de atendente,
 * reclamação) ou alguém a devolveu à fila. Medido numa loja (26/09/2026): a IA
 * passou duas conversas numa manhã e o dono só soube abrindo o Inbox e
 * procurando; pediu para "ver as transferências no menu". Reusa a MESMA
 * contagem das abas do Inbox (sem filtros, a chave do React Query é a mesma).
 */
export function ContadorDaFila({ compacto }: { compacto: boolean }) {
  const t = useT();
  const { activeOrg } = useAuth();
  const { data } = useConversationCounts(activeOrg?.orgId ?? null);
  const esperando = data?.fila ?? data?.unassigned ?? 0;
  if (!esperando) return null;
  const rotulo =
    esperando === 1 ? t("1 conversa esperando uma pessoa") : `${esperando} ${t("conversas esperando uma pessoa")}`;
  return (
    <span
      data-testid="contador-da-fila"
      aria-label={rotulo}
      title={rotulo}
      // O badge da lateral (Etapa 7): `--badge-danger`, "99+" acima de 99. Com a
      // lateral recolhida ele fica no canto do ícone (`shell.css`), com o número.
      className="sh-badge"
      data-compacto={compacto ? "true" : undefined}
    >
      {esperando > 99 ? "99+" : esperando}
    </span>
  );
}
