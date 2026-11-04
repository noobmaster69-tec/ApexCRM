"use client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useT } from "@/hooks/i18n/useT";
import { motivoDoVeto } from "@/lib/agent-engine/agent/sugestao-de-resposta";
import type { SugestaoDoAgente } from "./useSugestaoDoAgente";

/**
 * O cartão de REVISÃO da sugestão do agente. Antes era uma caixa fixa
 * "Assistência do agente" com um botão só, ocupando o rodapé da conversa o
 * tempo todo; agora (fork jhoow, composer compacto) só aparece quando há uma
 * sugestão para revisar ou um aviso do que aconteceu com ela. O gatilho
 * "Sugerir resposta" é a pílula da linha de ações rápidas.
 */
export function ReplyReviewPanel({ sugestao, disabled }: { sugestao: SugestaoDoAgente; disabled?: boolean }) {
  const t = useT();
  const { draft, body, busy, decide, edits, setEdits, feedback, setFeedback, notice, statuses } = sugestao;
  const avisoVisivel =
    notice &&
    (!draft ||
      (notice.draftId === draft.id &&
        (notice.kind === "error" || ["approved", "sending", "sent", "dismissed"].includes(draft.status))));
  // A causa do veto, em linguagem de quem opera (1.99, #2975), e o aviso de que
  // uma versão anterior foi barrada pela prévia (doc de decisão 234).
  const motivo = draft ? motivoDoVeto(draft.error_code) : null;
  const barrada = draft?.status === "pending" && draft.original_body?.trim() ? motivo : null;
  if (!draft && !avisoVisivel) return null;
  return (
    <section
      aria-label={t("Assistência do agente")}
      className="space-y-2 rounded-md border bg-muted/30 p-3"
      data-testid="sugestao-do-agente-area"
    >
      {draft && (
        <div className="space-y-2" data-testid="sugestao-do-agente">
          <p className="text-sm font-medium">{t(statuses[draft.status] ?? "Sugestão do agente")}</p>
          <p className="text-xs text-muted-foreground">
            {t(
              "Aprovar envia somente este texto. Não altera dados, agenda ou a autonomia do agente.",
            )}
          </p>
          {barrada?.causa && (
            <p className="text-xs text-muted-foreground">
              {t("Uma versão anterior desta sugestão foi barrada: {causa}. Confira antes de enviar.").replace(
                "{causa}",
                t(barrada.causa),
              )}
            </p>
          )}
          {body && (
            <Textarea
              aria-label={t("Resposta sugerida")}
              value={body}
              onChange={(e) => setEdits({ ...edits, [draft.id]: e.target.value })}
              disabled={disabled || busy || draft.status !== "pending"}
              rows={3}
            />
          )}
          {draft.proposals.length > 0 && (
            <details className="text-xs">
              <summary>{t("Ações propostas: precisam de autorização separada")}</summary>
              <p>{t("Abra a ação correspondente no CRM ou na agenda para confirmar.")}</p>
              <ul>
                {draft.proposals.map((p, i) => (
                  <li key={i}>{p.tool}</li>
                ))}
              </ul>
            </details>
          )}
          {draft.status === "pending" && (
            <>
              <Input
                aria-label={t("Feedback para a próxima sugestão")}
                placeholder={t("Feedback para a próxima sugestão")}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                maxLength={1000}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={disabled || busy || !body.trim()}
                  onClick={() => decide("approve")}
                >
                  {t("Aprovar e enviar")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled || busy}
                  onClick={() => decide("reject")}
                >
                  {t("Rejeitar")}
                </Button>
              </div>
            </>
          )}
          {draft.status === "failed" && (
            <p className="text-xs">
              {motivo
                ? t(motivo.texto)
                : t("Confira a configuração do agente e tente gerar novamente.")}
            </p>
          )}
        </div>
      )}
      {/*
        O aviso de ERRO continua inline, amarrado ao rascunho que ele explica:
        "sua edição foi preservada" só faz sentido ao lado do texto preservado —
        como toast, ele chegaria depois, sem o bloco à vista para conferir.

        A confirmação de sucesso NÃO passa por aqui: ela é toast (ver `decide`),
        porque quando a sugestão sai da tela (enviada ou descartada) este bloco
        sai junto, e o aviso inline sairia com ele.
      */}
      {avisoVisivel && notice && (
        <p role="status" className="text-xs">
          {notice.message}
        </p>
      )}
    </section>
  );
}
