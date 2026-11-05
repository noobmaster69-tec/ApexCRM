"use client";
/**
 * Peças pequenas da lista de Campanhas: o chip de situação, o quadrado do tipo
 * de conteúdo, a pill da taxa e os formatadores. Tabelas de rótulo no topo do
 * módulo — o `t()` acha o espanhol de cada valor no dicionário.
 */
import {
  CalendarClock,
  CircleCheck,
  FilePen,
  LoaderCircle,
  MessageSquareText,
  Mic,
  Pause,
  Rocket,
  Send,
  TriangleAlert,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { useT } from "@/hooks/i18n/useT";
import { nivelDaTaxa, percentual, type NivelDaTaxa } from "@/lib/campanhas/resumo";
import type { StatusDaCampanha } from "@/lib/campanhas/tipos";

const SITUACAO: Record<StatusDaCampanha, { rotulo: string; Icone: LucideIcon }> = {
  running: { rotulo: "Enviando", Icone: Send },
  paused: { rotulo: "Pausada", Icone: Pause },
  completed: { rotulo: "Concluída", Icone: CircleCheck },
  cancelled: { rotulo: "Cancelada", Icone: X },
  scheduled: { rotulo: "Agendada", Icone: CalendarClock },
  draft: { rotulo: "Rascunho", Icone: FilePen },
  preparing: { rotulo: "Montando a lista", Icone: LoaderCircle },
  ready: { rotulo: "Pronta para iniciar", Icone: Rocket },
  failed: { rotulo: "Falhou", Icone: TriangleAlert },
};

export function ChipDeSituacao({ status }: { status: StatusDaCampanha }) {
  const t = useT();
  const s = SITUACAO[status] ?? SITUACAO.draft;
  const { Icone } = s;
  return (
    <span className="cp-situacao" data-s={status}>
      <Icone size={12} aria-hidden strokeWidth={2.4} />
      <span className="cp-reticencias">{t(s.rotulo)}</span>
    </span>
  );
}

export type TipoDeConteudo = "fluxo" | "mensagem" | "audio";

export const ICONE_DO_TIPO: Record<TipoDeConteudo, LucideIcon> = {
  fluxo: Zap,
  mensagem: MessageSquareText,
  audio: Mic,
};

export const ROTULO_DO_TIPO: Record<TipoDeConteudo, string> = {
  fluxo: "Fluxo",
  mensagem: "Mensagem",
  audio: "Áudio",
};

export function QuadradoDoTipo({ tipo }: { tipo: TipoDeConteudo }) {
  const Icone = ICONE_DO_TIPO[tipo];
  return (
    <span className="cp-tipo" data-tipo={tipo} aria-hidden>
      <Icone size={16} />
    </span>
  );
}

export const ROTULO_DO_NIVEL: Record<NivelDaTaxa, string> = {
  otima: "Ótima",
  boa: "Boa",
  baixa: "Baixa",
  sem: "Sem envios",
};

/** Percentual para a tela: "17%" ou "—". */
export function textoDoPercentual(parte: number, base: number): string {
  const p = percentual(parte, base);
  return p === null ? "—" : `${p}%`;
}

export function PillDaTaxa({
  respostas,
  enviadas,
  media,
  idioma,
}: {
  respostas: number;
  enviadas: number;
  media: number | null;
  idioma: string;
}) {
  const t = useT();
  const nivel = nivelDaTaxa(respostas, enviadas);
  return (
    <div className="cp-pill" data-n={nivel}>
      <span className="cp-pill-valor">{textoDoPercentual(respostas, enviadas)}</span>
      <span className="cp-pill-texto">
        <span className="cp-pill-nivel">{t(ROTULO_DO_NIVEL[nivel])}</span>
        <span className="cp-pill-conta">
          {nivel === "sem"
            ? t("nenhum envio")
            : `${respostas.toLocaleString(idioma)} ${t("de")} ${enviadas.toLocaleString(idioma)} · ${t("média")} ${media === null ? "—" : `${media}%`}`}
        </span>
      </span>
    </div>
  );
}

/** "06/10, 12:55" — curto, no relógio de quem olha. */
export function dataCurta(iso: string, idioma: string): string {
  const d = new Date(iso);
  const dia = d.toLocaleDateString(idioma, { day: "2-digit", month: "2-digit" });
  const hora = d.toLocaleTimeString(idioma, { hour: "2-digit", minute: "2-digit" });
  return `${dia}, ${hora}`;
}

export function dataLonga(iso: string, idioma: string): string {
  return new Date(iso).toLocaleString(idioma, { dateStyle: "long", timeStyle: "short" });
}
