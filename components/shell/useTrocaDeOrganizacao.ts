"use client";
import { useState } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";

import { setActiveOrg } from "@/app/actions/shell/setActiveOrg";
import { useActiveOrg } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";

import { useOrganizationTransition } from "./OrganizationTransitionProvider";

/**
 * Trocar de organização: a MESMA ação em todo lugar que oferece a troca (o
 * cartão de perfil da lateral e o seletor do onboarding). Mostra a transição,
 * grava a organização ativa no servidor e abre um documento novo — o que
 * elimina QueryClient, assinaturas e respostas em voo da organização anterior.
 */
export function useTrocaDeOrganizacao(): { trocar: (orgId: string) => Promise<void>; trocando: boolean } {
  const t = useT();
  const active = useActiveOrg();
  const transition = useOrganizationTransition();
  const [trocando, setTrocando] = useState(false);
  const trocar = async (orgId: string) => {
    if (orgId === active?.orgId) return;
    flushSync(() => {
      setTrocando(true);
      transition.begin(t("Carregando organização…"));
    });
    try {
      const result = await setActiveOrg(orgId);
      if (!result.ok) throw new Error(result.error);
      window.location.assign("/app/inbox");
    } catch {
      transition.cancel();
      setTrocando(false);
      toast.error(t("Não foi possível trocar de organização. Seu acesso pode ter mudado. Tente novamente."));
    }
  };
  return { trocar, trocando };
}
