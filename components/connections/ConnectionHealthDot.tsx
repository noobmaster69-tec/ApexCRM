"use client";
import { cn } from "@/lib/utils";
import {
  useChannelSessions,
  deriveOverallHealth,
  type ConnectionHealth,
} from "@/hooks/channels/useChannelSessions";
import { useT } from "@/hooks/i18n/useT";

const DOT_COLOR: Record<ConnectionHealth, string> = {
  connected: "bg-success",
  connecting: "bg-warning",
  down: "bg-error",
  none: "bg-muted-foreground/40",
  unknown: "bg-muted-foreground/40",
};

const DOT_LABEL: Record<ConnectionHealth, string> = {
  connected: "Todas as conexões ativas",
  connecting: "Conectando…",
  down: "Uma conexão caiu",
  none: "Nenhuma conexão",
  unknown: "Não foi possível verificar as conexões",
};

/**
 * Bolinha de saúde exibida ao lado do item "Conexões" na sidebar. Poll leve
 * (30s) para o usuário ver de relance quando um número cai — sem precisar abrir nada.
 */
export function ConnectionHealthDot({
  className,
  variante,
}: {
  className?: string;
  /**
   * `lateral` (Etapa 7): o ponto de 7px da navegação (`.sh-ponto` em
   * `components/shell/shell.css`), com o estado também em texto para leitor de
   * tela — dentro do link, ele entra no nome acessível de "Conexões".
   */
  variante?: "lateral";
}) {
  const t = useT();
  const { data, isError } = useChannelSessions({ refetchInterval: 30_000 });
  // Listagem que falhou não vira "Nenhuma conexão": a bolinha é o único sinal
  // ambiente de canal caído, e dizer "nenhuma" a quem tem número ligado é o
  // mesmo engano da Central de Conexões — o operador conclui que perdeu tudo.
  const health = isError ? "unknown" : deriveOverallHealth(data);
  if (variante === "lateral") {
    return (
      <>
        <span aria-hidden className={cn("sh-ponto", className)} data-saude={health} title={t(DOT_LABEL[health])} />
        <span className="sr-only">{`, ${t(DOT_LABEL[health])}`}</span>
      </>
    );
  }
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 shrink-0 rounded-full",
        DOT_COLOR[health],
        health === "down" && "animate-pulse",
        className,
      )}
      title={t(DOT_LABEL[health])}
      aria-label={t(DOT_LABEL[health])}
    />
  );
}
