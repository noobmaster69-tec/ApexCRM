"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { escoposDaConexao } from "@/lib/mcp/v1/escopos";
import {
  ESCOLHA_INICIAL,
  EscolhaDePermissoesForm,
  listaDeIps,
  type EscolhaDePermissoes,
} from "../../_components/ConexoesMcpClient";

export function ConsentimentoMcp({ pedido, nomeDoCliente }: { pedido: Record<string, string>; nomeDoCliente: string }) {
  const t = useT();
  const [nome, setNome] = useState(nomeDoCliente.slice(0, 80));
  const [escolha, setEscolha] = useState<EscolhaDePermissoes>(ESCOLHA_INICIAL);
  const [enviando, setEnviando] = useState(false);
  const semEscopos = escoposDaConexao(escolha.profile, escolha.scopes, escolha.show_pii).length === 0;

  const decidir = async (decision: "allow" | "deny") => {
    setEnviando(true);
    try {
      const r = await apiClient.post<{ data: { redirect_to: string } }>("/api/v1/settings/mcp/oauth/autorizar", {
        decision,
        request: pedido,
        ...(decision === "allow"
          ? {
              connection: {
                name: nome.trim(),
                profile: escolha.profile,
                scopes: escolha.scopes,
                validity_days: escolha.validity_days,
                allowed_ips: listaDeIps(escolha.allowed_ips),
                show_pii: escolha.show_pii,
              },
            }
          : {}),
      });
      window.location.assign(r.data.redirect_to);
    } catch (err) {
      showApiError(err);
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="mcp-consent-nome">{t("Nome da conexão")}</Label>
        <Input id="mcp-consent-nome" value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} />
      </div>
      <EscolhaDePermissoesForm valor={escolha} onChange={setEscolha} />
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" disabled={enviando} onClick={() => void decidir("deny")}>
          {t("Recusar")}
        </Button>
        <Button
          type="button"
          disabled={enviando || semEscopos || nome.trim().length === 0}
          title={semEscopos ? t("Escolha ao menos uma permissão.") : undefined}
          onClick={() => void decidir("allow")}
        >
          {t("Permitir")}
        </Button>
      </div>
    </div>
  );
}
