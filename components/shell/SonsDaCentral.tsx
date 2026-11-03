"use client";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useAgentInbox } from "@/hooks/ai/useAgentInbox";
import { useSonsDaCentral } from "@/hooks/notifications/useSonsDaCentral";
import { destinosDaInterface } from "@/lib/navigation/interface";

/**
 * O som da Central de avisos (a etapa que avisa e o pedido de pessoa). Morava
 * no sino da barra do topo; com o sino no rodapé da lateral — que existe duas
 * vezes quando a gaveta abre —, ele mora na casca, montado uma vez só. Mesmo
 * portão do botão de Notificações: só quem tem a Central na interface.
 */
export function SonsDaCentral() {
  const { user, activeOrg } = useAuth();
  const temCentral = destinosDaInterface(
    activeOrg?.interface_settings,
    user.is_platform_admin && !user.support,
    activeOrg?.role ?? null,
  ).some((d) => d.href === "/app/ai/inbox");
  return temCentral ? <Sons /> : null;
}

function Sons() {
  const { data } = useAgentInbox("open");
  useSonsDaCentral(data?.items);
  return null;
}
