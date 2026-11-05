"use client";
/**
 * CALENDÁRIO DE INTERVALO (fork jhoow, Campanhas, nov/2026): dois meses lado a
 * lado, o primeiro clique marca o começo e o segundo o fim. As datas entram e
 * saem como "AAAA-MM-DD" no relógio de quem olha — quem converte para instante
 * é quem chama. Os nomes de mês e de dia vêm do `Intl`, no idioma da tela.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { diaLocal } from "@/lib/campanhas/resumo";

import "./calendario.css";

const dataDe = (iso: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};

/** "6 out" — dia e mês curto, sem o "de" e sem o ponto. */
export function diaEMes(iso: string, idioma: string): string {
  const d = dataDe(iso);
  if (!d) return "";
  const partes = new Intl.DateTimeFormat(idioma, { day: "numeric", month: "short" }).formatToParts(d);
  const dia = partes.find((p) => p.type === "day")?.value ?? "";
  const mes = (partes.find((p) => p.type === "month")?.value ?? "").replace(/\.$/, "");
  return `${dia} ${mes}`;
}

/** "6 out – 4 nov" (ou só "4 nov" quando o intervalo é um dia). */
export function textoDoIntervalo(de: string, ate: string, idioma: string): string {
  return de === ate ? diaEMes(de, idioma) : `${diaEMes(de, idioma)} – ${diaEMes(ate, idioma)}`;
}

function diasDoMes(ano: number, mes: number): Array<Date | null> {
  const primeiro = new Date(ano, mes, 1);
  const vazios = primeiro.getDay(); // a semana começa no domingo
  const total = new Date(ano, mes + 1, 0).getDate();
  return [
    ...Array.from({ length: vazios }, () => null),
    ...Array.from({ length: total }, (_, i) => new Date(ano, mes, i + 1)),
  ];
}

export function CalendarioDeIntervalo({
  de,
  ate,
  onAplicar,
  onLimpar,
  ateHoje = false,
  meses = 2,
}: {
  de: string;
  ate: string;
  onAplicar: (de: string, ate: string) => void;
  onLimpar?: () => void;
  /** Recusa dia no futuro (o período de resultados não tem amanhã). */
  ateHoje?: boolean;
  meses?: 1 | 2;
}) {
  const t = useT();
  const idioma = useTagDeIdioma();
  const [hoje] = useState(() => diaLocal(new Date()));
  const [inicio, setInicio] = useState<string>(de);
  const [fim, setFim] = useState<string>(ate);
  const [passando, setPassando] = useState<string | null>(null);
  const [ancora, setAncora] = useState(() => {
    const base = dataDe(ate || de || hoje) ?? new Date();
    return new Date(base.getFullYear(), base.getMonth() - (meses - 1), 1);
  });

  const nomeDoMes = useMemo(() => new Intl.DateTimeFormat(idioma, { month: "long", year: "numeric" }), [idioma]);
  const semana = useMemo(() => {
    const f = new Intl.DateTimeFormat(idioma, { weekday: "narrow" });
    // 1º de novembro de 2026 é um domingo.
    return Array.from({ length: 7 }, (_, i) => f.format(new Date(2026, 10, 1 + i)));
  }, [idioma]);

  const escolher = (dia: string) => {
    if (!inicio || (inicio && fim)) {
      setInicio(dia);
      setFim("");
      return;
    }
    if (dia < inicio) {
      setFim(inicio);
      setInicio(dia);
    } else setFim(dia);
  };

  const fimVisivel = fim || (inicio && passando && passando >= inicio ? passando : "");

  return (
    <div className="cal" role="dialog" aria-label={t("Escolha o período")}>
      <div className="cal-meses">
        {Array.from({ length: meses }, (_, k) => {
          const mes = new Date(ancora.getFullYear(), ancora.getMonth() + k, 1);
          return (
            <div className="cal-mes" key={k}>
              <div className="cal-topo">
                <button
                  type="button"
                  className="cal-nav"
                  hidden={k !== 0}
                  aria-label={t("Mês anterior")}
                  onClick={() => setAncora(new Date(ancora.getFullYear(), ancora.getMonth() - 1, 1))}
                >
                  <ChevronLeft size={15} aria-hidden />
                </button>
                <span>{nomeDoMes.format(mes)}</span>
                <button
                  type="button"
                  className="cal-nav"
                  hidden={k !== meses - 1}
                  aria-label={t("Próximo mês")}
                  onClick={() => setAncora(new Date(ancora.getFullYear(), ancora.getMonth() + 1, 1))}
                >
                  <ChevronRight size={15} aria-hidden />
                </button>
              </div>
              <div className="cal-grade" onMouseLeave={() => setPassando(null)}>
                {semana.map((s, i) => (
                  <span className="cal-semana" key={i} aria-hidden>
                    {s}
                  </span>
                ))}
                {diasDoMes(mes.getFullYear(), mes.getMonth()).map((d, i) => {
                  if (!d) return <span key={i} />;
                  const iso = diaLocal(d);
                  const ponta = iso === inicio || iso === fimVisivel;
                  const faixa = !!inicio && !!fimVisivel && iso > inicio && iso < fimVisivel;
                  return (
                    <button
                      key={i}
                      type="button"
                      className="cal-dia"
                      disabled={ateHoje && iso > hoje}
                      data-ponta={ponta || undefined}
                      data-faixa={faixa || undefined}
                      data-hoje={iso === hoje || undefined}
                      aria-pressed={ponta}
                      aria-label={new Intl.DateTimeFormat(idioma, { dateStyle: "long" }).format(d)}
                      onMouseEnter={() => setPassando(iso)}
                      onClick={() => escolher(iso)}
                    >
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="cal-rodape">
        <span>{inicio ? textoDoIntervalo(inicio, fim || inicio, idioma) : t("Escolha o primeiro dia")}</span>
        {onLimpar && (
          <button type="button" className="cal-botao" onClick={onLimpar}>
            {t("Limpar")}
          </button>
        )}
        <button
          type="button"
          className="cal-botao cal-botao-primario"
          disabled={!inicio}
          onClick={() => onAplicar(inicio, fim || inicio)}
        >
          {t("Aplicar")}
        </button>
      </div>
    </div>
  );
}
