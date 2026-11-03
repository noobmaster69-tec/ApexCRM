"use client";

import { useT } from "@/hooks/i18n/useT";
import { useCases } from "@/hooks/ai/useCases";

/**
 * Quantos casos esperam uma PESSOA — o número ao lado de "Casos" no menu.
 *
 * Conta só `awaiting_human`: é o estado em que a IA parou de avançar naquele
 * assunto e está esperando a equipe ("Aguardando você" na tela). Caso
 * esperando o cliente não pede nada de quem opera, e contá-lo ensinaria a
 * ignorar o número. Reusa a MESMA consulta da tela de Casos (a chave do React
 * Query é a mesma), então abrir a tela e olhar o menu não dobram a leitura.
 */
export function ContadorDeCasos({ compacto }: { compacto: boolean }) {
  const t = useT();
  const { data } = useCases("open");
  const pendentes = (data?.cases ?? []).filter((c) => c.status === "awaiting_human").length;
  if (pendentes === 0) return null;
  const rotulo = pendentes === 1 ? t("1 caso esperando você") : `${pendentes} ${t("casos esperando você")}`;
  return (
    <span
      data-testid="contador-de-casos"
      aria-label={rotulo}
      title={rotulo}
      // O badge da lateral (Etapa 7): `--badge-danger`, "99+" acima de 99. Com a
      // lateral recolhida ele fica no canto do ícone (`shell.css`), com o número.
      className="sh-badge"
      data-compacto={compacto ? "true" : undefined}
    >
      {pendentes > 99 ? "99+" : pendentes}
    </span>
  );
}
