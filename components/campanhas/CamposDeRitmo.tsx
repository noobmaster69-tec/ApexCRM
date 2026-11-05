"use client";

import { useEffect, useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";
import {
  type FaltaParaComecar,
  type JanelaDiaria,
  type ResumoDoInicio,
  camposDoInstante,
  horarioDosMinutos,
  instanteDoHorarioLocal,
  minutosDoHorario,
  resumoDoInicio,
} from "@/lib/campanhas/agendamento";
import { FUSOS_PRINCIPAIS, fusoValido, todosOsFusos } from "@/lib/campanhas/fuso";
import {
  descricaoDoIntervalo,
  intervaloDaCota,
  limiteDaCota,
  PERIODOS_DA_COTA,
  PISO_DO_INTERVALO_S,
  type PeriodoDaCota,
} from "@/lib/campanhas/cota";

/**
 * Como os envios se distribuem dentro da janela (Etapa 4): "cota" = quantos
 * contatos chamar por período, espalhados pela janela; "intervalo" = o ritmo
 * avançado (mínimo/máximo entre envios e tetos). Um só vale por vez.
 */
export type ModoDoRitmo = "cota" | "intervalo";

export interface ValoresDeRitmo {
  minIntervalo: string;
  maxIntervalo: string;
  tetoDiario: string;
  tetoHorario: string;
  /** Janela diária "HH:mm" ("" = sem janela própria). */
  janelaInicio: string;
  janelaFim: string;
  /** "" = o fuso do número. */
  fuso: string;
  /** 9020: "chamar N por hora/dia/semana/mês" ("" = sem cota). */
  cotaQuantidade?: string;
  cotaPeriodo?: "" | PeriodoDaCota;
  /** O modo escolhido. Ausente = o que a campanha gravada usa (cota preenchida → "cota"). */
  modoRitmo?: ModoDoRitmo;
  /** Início da campanha (só na criação/edição do rascunho). */
  inicioModo?: "agora" | "agendar";
  /** "AAAA-MM-DD" e "HH:mm", no fuso da campanha. */
  inicioData?: string;
  inicioHora?: string;
}

export type ErroDoRitmo =
  | "minimo"
  | "maximo"
  | "fuso"
  | "janela"
  | "cota"
  | "cota_acima"
  | "agenda_sem_fuso"
  | "agenda_invalida"
  | "agenda_passado";

/** A frase de cada erro — tabela constante, para o t() achar no dicionário. */
export const TEXTO_DO_ERRO_DO_RITMO: Record<ErroDoRitmo, string> = {
  minimo: "O intervalo mínimo é de pelo menos 10 segundos.",
  maximo: "O intervalo máximo não pode ser menor que o mínimo.",
  fuso: "Fuso horário desconhecido.",
  janela: "A janela diária de envio é obrigatória: início e fim (HH:mm), com o fim depois do início.",
  cota: "Informe quantos contatos chamar (1 ou mais) e o período.",
  cota_acima: "Nesse ritmo não cabem tantos contatos na janela. Diminua a quantidade ou aumente a janela.",
  agenda_sem_fuso: "Para agendar, escolha o fuso horário da campanha.",
  agenda_invalida: "Escolha uma data e um horário válidos — esse horário não existe nesse dia no fuso escolhido (mudança de horário de verão).",
  agenda_passado: "O horário agendado já passou. Escolha uma data e hora no futuro.",
};

/** A janela em minutos, ou `null` quando vazia/incompleta. */
export function janelaDosValores(v: Pick<ValoresDeRitmo, "janelaInicio" | "janelaFim">): JanelaDiaria | null {
  const inicio = minutosDoHorario(v.janelaInicio);
  const fim = minutosDoHorario(v.janelaFim);
  return inicio !== null && fim !== null && fim > inicio ? { inicio, fim } : null;
}

/** O modo em vigor: o escolhido na tela ou, numa campanha gravada, o que ela usa. */
export function modoDoRitmo(v: Pick<ValoresDeRitmo, "modoRitmo" | "cotaQuantidade" | "cotaPeriodo">): ModoDoRitmo {
  if (v.modoRitmo) return v.modoRitmo;
  return (v.cotaQuantidade ?? "").trim() !== "" && v.cotaPeriodo ? "cota" : "intervalo";
}

/** Os erros que a tela mostra antes de deixar salvar — só os do modo escolhido. */
export function errosDoRitmo(v: ValoresDeRitmo, agora: Date = new Date()): ErroDoRitmo[] {
  const erros: ErroDoRitmo[] = [];
  const modo = modoDoRitmo(v);
  if (modo === "intervalo") {
    const min = Number(v.minIntervalo);
    const max = Number(v.maxIntervalo);
    if (!Number.isFinite(min) || min < PISO_DO_INTERVALO_S) erros.push("minimo");
    if (!Number.isFinite(max) || max < min) erros.push("maximo");
  }
  if (v.fuso && !fusoValido(v.fuso)) erros.push("fuso");
  const janela = janelaDosValores(v);
  if (!janela) erros.push("janela");
  if (modo === "cota") {
    const q = Number((v.cotaQuantidade ?? "").trim());
    if (!(q >= 1 && Number.isInteger(q) && v.cotaPeriodo)) erros.push("cota");
    else if (q > limiteDaCota(v.cotaPeriodo, janela)) erros.push("cota_acima");
  }
  if (v.inicioModo === "agendar") {
    if (!v.fuso || !fusoValido(v.fuso)) erros.push("agenda_sem_fuso");
    else {
      const inicio = instanteDoHorarioLocal(v.inicioData ?? "", v.inicioHora ?? "", v.fuso);
      if (!inicio) erros.push("agenda_invalida");
      else if (inicio.getTime() <= agora.getTime()) erros.push("agenda_passado");
    }
  }
  return erros;
}

/** Os valores de janela e início de uma campanha gravada. */
export function programacaoDaCampanha(c: {
  cota_quantidade?: number | null;
  cota_periodo?: string | null;
  janela_inicio_hora?: number | null;
  janela_fim_hora?: number | null;
  janela_inicio_minuto?: number | null;
  janela_fim_minuto?: number | null;
  scheduled_at?: string | null;
  timezone?: string | null;
}): Pick<
  ValoresDeRitmo,
  "janelaInicio" | "janelaFim" | "inicioModo" | "inicioData" | "inicioHora" | "cotaQuantidade" | "cotaPeriodo" | "modoRitmo"
> {
  const ini = c.janela_inicio_minuto ?? (c.janela_inicio_hora != null ? c.janela_inicio_hora * 60 : null);
  const fim = c.janela_fim_minuto ?? (c.janela_fim_hora != null ? c.janela_fim_hora * 60 : null);
  const agendada = !!c.scheduled_at && fusoValido(c.timezone);
  const campos = agendada ? camposDoInstante(new Date(c.scheduled_at!), c.timezone!) : { data: "", hora: "" };
  return {
    janelaInicio: ini === null ? "" : horarioDosMinutos(ini),
    janelaFim: fim === null ? "" : horarioDosMinutos(fim),
    inicioModo: agendada ? "agendar" : "agora",
    inicioData: campos.data,
    inicioHora: campos.hora,
    cotaQuantidade: c.cota_quantidade ? String(c.cota_quantidade) : "",
    cotaPeriodo: (PERIODOS_DA_COTA as readonly string[]).includes(c.cota_periodo ?? "") ? (c.cota_periodo as PeriodoDaCota) : "",
    // Campanha gravada: quem tem cota abre na Opção A; o resto, na B.
    modoRitmo: c.cota_quantidade && c.cota_periodo ? "cota" : "intervalo",
  };
}

/** O corpo da janela para a API: em minutos (9018); a de horas é zerada. */
export function corpoDaJanela(v: Pick<ValoresDeRitmo, "janelaInicio" | "janelaFim">) {
  const j = janelaDosValores(v);
  return {
    janela_inicio_minuto: j?.inicio ?? null,
    janela_fim_minuto: j?.fim ?? null,
    janela_inicio_hora: null,
    janela_fim_hora: null,
  };
}

/** O corpo da cota para a API (9020). No modo "intervalo" a cota vai nula: só um modo vale. */
export function corpoDaCota(v: Pick<ValoresDeRitmo, "cotaQuantidade" | "cotaPeriodo" | "modoRitmo">) {
  const n = Number((v.cotaQuantidade ?? "").trim());
  return modoDoRitmo(v) === "cota" && n >= 1 && v.cotaPeriodo
    ? { cota_quantidade: Math.round(n), cota_periodo: v.cotaPeriodo }
    : { cota_quantidade: null, cota_periodo: null };
}

/** Os máximos por hora/dia para a API: só no modo "intervalo"; com cota, vão nulos. */
export function corpoDosTetos(v: Pick<ValoresDeRitmo, "tetoDiario" | "tetoHorario" | "cotaQuantidade" | "cotaPeriodo" | "modoRitmo">) {
  const ouNulo = (x: string) => (x.trim() === "" ? null : Number(x));
  return modoDoRitmo(v) === "cota"
    ? { teto_diario: null, teto_horario: null }
    : { teto_diario: ouNulo(v.tetoDiario), teto_horario: ouNulo(v.tetoHorario) };
}

/**
 * O resumo do modo em vigor, para a tela de detalhe: "3 por dia, das 09:00 às
 * 18:00" (cota) ou "1 a 3 min entre envios" (avançado). Só o modo ativo aparece.
 */
export function resumoDoRitmo(v: ValoresDeRitmo, t: (texto: string) => string): string {
  const janela = janelaDosValores(v);
  if (modoDoRitmo(v) === "cota" && v.cotaPeriodo) {
    const base = `${(v.cotaQuantidade ?? "").trim()} ${t(ROTULO_DO_PERIODO[v.cotaPeriodo])}`;
    return janela
      ? `${base}, ${t("das")} ${horarioDosMinutos(janela.inicio)} ${t("às")} ${horarioDosMinutos(janela.fim)}`
      : base;
  }
  const min = Number(v.minIntervalo);
  const max = Number(v.maxIntervalo);
  const emMinutos = min >= 60 && min % 60 === 0 && max % 60 === 0;
  return emMinutos
    ? `${min / 60} ${t("a")} ${max / 60} min ${t("entre envios")}`
    : `${min} ${t("a")} ${max} s ${t("entre envios")}`;
}

/** "60 s = 1 min", "90 s = 1,5 min", "3600 s = 1 h" — a equivalência legível do campo em segundos. */
export function equivalenciaDosSegundos(bruto: string): string | null {
  const s = Number(bruto);
  if (!Number.isFinite(s) || s < 60) return null;
  const fmt = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");
  return s < 3600 ? `${s} s = ${fmt(s / 60)} min` : `${s} s = ${fmt(s / 3600)} h`;
}

const ROTULO_DO_PERIODO: Record<PeriodoDaCota, string> = { hora: "por hora", dia: "por dia", semana: "por semana", mes: "por mês" };

const ABREVIACAO: Record<"s" | "min" | "h" | "dias", string> = { s: "s", min: "min", h: "h", dias: "dias" };

/** Opção A, "Quantos contatos chamar": N por período, espalhados pela janela, com prévia ao vivo. */
function CamposDaCota({
  v,
  onChange,
  prefixo,
}: {
  v: ValoresDeRitmo;
  onChange: (campo: keyof ValoresDeRitmo, valor: string) => void;
  prefixo: string;
}) {
  const t = useT();
  const n = Number((v.cotaQuantidade ?? "").trim());
  const janela = janelaDosValores(v);
  const periodo = v.cotaPeriodo || null;
  const valida = n >= 1 && Number.isInteger(n) && periodo !== null;
  const limite = periodo ? limiteDaCota(periodo, janela) : null;
  const divisao = valida ? descricaoDoIntervalo(intervaloDaCota({ quantidade: n, periodo }, janela)) : null;
  return (
    <div className="space-y-2" data-testid={`${prefixo}-cota`}>
      <div className="flex gap-2">
        <Input
          id={`${prefixo}-cota-n`}
          type="number"
          min={1}
          step={1}
          className="w-28"
          aria-label={t("Quantos contatos")}
          placeholder={t("ex.: 3")}
          value={v.cotaQuantidade ?? ""}
          onChange={(e) => onChange("cotaQuantidade", e.target.value)}
        />
        <select
          aria-label={t("Período")}
          className={SELECT}
          value={v.cotaPeriodo || "dia"}
          onChange={(e) => onChange("cotaPeriodo", e.target.value)}
          data-testid={`${prefixo}-cota-periodo`}
        >
          {PERIODOS_DA_COTA.map((p) => (
            <option key={p} value={p}>
              {t(ROTULO_DO_PERIODO[p])}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs text-muted-foreground" data-testid={`${prefixo}-cota-divisao`} aria-live="polite">
        {divisao && janela
          ? `${n} ${t("contatos")} ${t(ROTULO_DO_PERIODO[periodo!])} ${t("entre")} ${horarioDosMinutos(janela.inicio)} ${t("e")} ${horarioDosMinutos(janela.fim)} → ${t("cerca de 1 a cada")} ${String(divisao.valor).replace(".", ",")} ${t(ABREVIACAO[divisao.unidade])}.`
          : t("Ex.: 3 por dia numa janela de 9 horas = um contato a cada 3 horas.")}
      </p>
      {valida && limite !== null && n > limite && (
        <p className="rounded-md border border-warning-fg/40 bg-warning-fg/10 px-2 py-1 text-xs text-warning-fg" data-testid={`${prefixo}-cota-limite`}>
          {t("Nesse ritmo cabem no máximo")} {limite} {t("contatos")} {t(ROTULO_DO_PERIODO[periodo!])} {t("nessa janela.")}
        </p>
      )}
    </div>
  );
}

/** Um cartão de rádio da escolha "Como distribuir os envios dentro da janela?". */
function CartaoDoModo({
  nome,
  ativo,
  onEscolher,
  titulo,
  selo,
  descricao,
  testid,
}: {
  nome: string;
  ativo: boolean;
  onEscolher: () => void;
  titulo: string;
  selo?: string;
  descricao: string;
  testid: string;
}) {
  return (
    <label
      className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm ${ativo ? "border-primary bg-primary/5" : "border-border"}`}
      data-testid={testid}
      data-ativo={ativo || undefined}
    >
      <input type="radio" name={nome} checked={ativo} onChange={onEscolher} className="mt-1" />
      <span className="space-y-1">
        <span className="flex flex-wrap items-center gap-2 font-medium">
          {titulo}
          {selo && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">{selo}</span>}
        </span>
        <span className="block text-xs text-muted-foreground">{descricao}</span>
      </span>
    </label>
  );
}

/** O instante agendado (ISO) — `null` em "Iniciar agora" ou quando inválido. */
export function instanteAgendado(v: ValoresDeRitmo): string | null {
  if (v.inicioModo !== "agendar" || !fusoValido(v.fuso)) return null;
  return instanteDoHorarioLocal(v.inicioData ?? "", v.inicioHora ?? "", v.fuso)?.toISOString() ?? null;
}

const OUTRO = "__outro__";
const SELECT = "h-9 w-full rounded-md border border-border bg-surface px-2 text-sm";
const HORAS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTOS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

/** Hora e minuto SEMPRE em HH:mm (o `<input type="time">` vira 12h em alguns navegadores). */
function HoraMinuto({
  id,
  valor,
  onChange,
  vazio,
  ateVinteQuatro,
}: {
  id: string;
  valor: string;
  onChange: (v: string) => void;
  vazio?: string;
  ateVinteQuatro?: boolean;
}) {
  const t = useT();
  const [h, m] = valor ? valor.split(":") : ["", ""];
  const horas = ateVinteQuatro ? [...HORAS, "24"] : HORAS;
  return (
    <div className="flex items-center gap-1" data-testid={id}>
      <select
        id={id}
        aria-label={t("Hora")}
        className={SELECT}
        value={h ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? "" : `${e.target.value}:${e.target.value === "24" ? "00" : m || "00"}`)}
      >
        {vazio !== undefined && <option value="">{vazio}</option>}
        {horas.map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>
      <span aria-hidden>:</span>
      <select
        aria-label={t("Minuto")}
        className={SELECT}
        value={m ?? ""}
        disabled={!h || h === "24"}
        onChange={(e) => onChange(`${h || "00"}:${e.target.value}`)}
      >
        {!h && <option value="">--</option>}
        {MINUTOS.map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>
    </div>
  );
}

/** O nome do lugar do fuso para a frase ("Portugal"), ou o próprio fuso IANA. */
export function lugarDoFuso(fuso: string): string {
  const conhecido = FUSOS_PRINCIPAIS.find((f) => f.fuso === fuso);
  return conhecido ? conhecido.rotulo.replace(/^\S+\s+/u, "") : fuso;
}

const UNIDADES = {
  dia: ["dia", "dias"],
  hora: ["hora", "horas"],
  minuto: ["minuto", "minutos"],
} as const;

/** "58 dias, 16 horas e 23 minutos" — sem as partes zeradas; "menos de 1 minuto" nunca (arredonda para cima). */
export function useDuracao() {
  const t = useT();
  return (f: FaltaParaComecar): string => {
    const partes: string[] = [];
    const um = (n: number, u: keyof typeof UNIDADES) => `${n} ${t(UNIDADES[u][n === 1 ? 0 : 1])}`;
    if (f.dias) partes.push(um(f.dias, "dia"));
    if (f.horas) partes.push(um(f.horas, "hora"));
    if (f.minutos || partes.length === 0) partes.push(um(f.minutos, "minuto"));
    return partes.length === 1 ? partes[0]! : `${partes.slice(0, -1).join(", ")} ${t("e")} ${partes[partes.length - 1]}`;
  };
}

export type EstadoDaProgramacao = "previa" | "planejada" | "agendada" | "em_execucao";

const ROTULO_DO_ESTADO: Record<EstadoDaProgramacao, string> = {
  previa: "Prévia — ainda não salva",
  planejada: "Planejado — confirme em Agendar depois de preparar a lista",
  agendada: "Agendamento confirmado",
  em_execucao: "Em execução",
};

/** A frase dinâmica: "Agora em Portugal são 20:37 — início programado para hoje às 21:00, em 23 minutos." */
export function FraseDoInicio({
  resumo,
  fuso,
  estado,
  testid,
}: {
  resumo: ResumoDoInicio;
  fuso: string | null;
  estado: EstadoDaProgramacao;
  testid: string;
}) {
  const t = useT();
  const duracao = useDuracao();
  if (resumo.tipo === "sem_fuso" || !fuso) return null;
  const lugar = lugarDoFuso(fuso);
  const agoraEm = resumo.tipo === "invalido" ? "" : `${t("Agora em")} ${lugar} ${t("são")} ${resumo.agora}`;
  let frase = "";
  if (resumo.tipo === "agora") frase = `${agoraEm} — ${t("a campanha começa a enviar assim que for iniciada.")}`;
  if (resumo.tipo === "programado")
    frase = resumo.hoje
      ? `${agoraEm} — ${t("início programado para hoje às")} ${resumo.hora}, ${t("em")} ${duracao(resumo.falta)}.`
      : `${t("Início programado para")} ${resumo.data} ${t("às")} ${resumo.hora}, ${t("no fuso de")} ${lugar} — ${t("faltam")} ${duracao(resumo.falta)}.`;
  const deslocado = resumo.tipo === "agora" || resumo.tipo === "programado" ? resumo.deslocado : null;
  if (!frase) return null;
  return (
    <div className="space-y-1 rounded-md border border-border p-3 text-sm" data-testid={testid} aria-live="polite">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t(ROTULO_DO_ESTADO[estado])}</p>
      <p>{frase}</p>
      {deslocado && (
        <p className="text-warning-fg">
          {t("A janela diária de envio desloca o primeiro envio para")}{" "}
          {deslocado.hoje ? t("hoje") : deslocado.data} {t("às")} {deslocado.hora}.
        </p>
      )}
    </div>
  );
}

/** Relógio que anda sozinho enquanto a tela está aberta (o resumo não envelhece). */
export function useAgora(passoMs = 15_000): Date {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), passoMs);
    return () => clearInterval(id);
  }, [passoMs]);
  return agora;
}

/** O fuso da campanha: os principais primeiro; "Outro…" abre a lista IANA inteira. */
export function SeletorDeFuso({ prefixo, fuso, onFuso }: { prefixo: string; fuso: string; onFuso: (f: string) => void }) {
  const t = useT();
  const principais = FUSOS_PRINCIPAIS.map((f) => f.fuso) as readonly string[];
  const [mostrarOutro, setMostrarOutro] = useState(fuso !== "" && !principais.includes(fuso));
  const lista = useMemo(() => (mostrarOutro ? todosOsFusos() : []), [mostrarOutro]);
  return (
    <div className="space-y-2">
      <Label htmlFor={`${prefixo}-fuso`}>{t("Fuso horário da campanha")}</Label>
      <select
        id={`${prefixo}-fuso`}
        className={SELECT}
        value={mostrarOutro ? OUTRO : fuso}
        onChange={(e) => {
          if (e.target.value === OUTRO) {
            setMostrarOutro(true);
            return;
          }
          setMostrarOutro(false);
          onFuso(e.target.value);
        }}
        data-testid={`${prefixo}-fuso`}
      >
        <option value="">{t("O do número (Conexões › Proteção de envio)")}</option>
        {FUSOS_PRINCIPAIS.map((f) => (
          <option key={f.fuso} value={f.fuso}>
            {`${t(f.rotulo)} (${f.fuso})`}
          </option>
        ))}
        <option value={OUTRO}>{t("Outro…")}</option>
      </select>
      {mostrarOutro && (
        <select
          aria-label={t("Escolha o fuso")}
          className={SELECT}
          value={fuso}
          onChange={(e) => onFuso(e.target.value)}
          data-testid={`${prefixo}-fuso-outro`}
        >
          <option value="">{t("Escolha o fuso")}</option>
          {lista.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

/** O INÍCIO: agora ou agendado — data (calendário), HH:mm e o fuso, visível ao lado. */
export function CamposDeInicio({
  v,
  onChange,
  prefixo,
}: {
  v: Pick<ValoresDeRitmo, "fuso" | "inicioModo" | "inicioData" | "inicioHora">;
  onChange: (campo: "fuso" | "inicioModo" | "inicioData" | "inicioHora", valor: string) => void;
  prefixo: string;
}) {
  const t = useT();
  return (
    <fieldset className="space-y-3" data-testid={`${prefixo}-inicio`}>
      <legend className="text-sm font-medium">{t("Início da campanha")}</legend>
      <div role="radiogroup" aria-label={t("Início da campanha")} className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name={`${prefixo}-inicio-modo`}
            checked={v.inicioModo !== "agendar"}
            onChange={() => onChange("inicioModo", "agora")}
          />
          {t("Iniciar agora")}
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name={`${prefixo}-inicio-modo`}
            checked={v.inicioModo === "agendar"}
            onChange={() => onChange("inicioModo", "agendar")}
          />
          {t("Agendar")}
        </label>
      </div>
      {v.inicioModo === "agendar" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${prefixo}-data`}>{t("Data")}</Label>
            <Input
              id={`${prefixo}-data`}
              type="date"
              value={v.inicioData ?? ""}
              onChange={(e) => onChange("inicioData", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${prefixo}-hora-inicio`}>{t("Horário (HH:mm)")}</Label>
            <HoraMinuto
              id={`${prefixo}-hora-inicio`}
              valor={v.inicioHora ?? ""}
              vazio="--"
              onChange={(x) => onChange("inicioHora", x)}
            />
          </div>
        </div>
      )}
      <SeletorDeFuso prefixo={prefixo} fuso={v.fuso} onFuso={(f) => onChange("fuso", f)} />
      <p className="text-xs text-muted-foreground">
        {t("A data e a hora valem no fuso da campanha, com o horário de verão dessa data — não no fuso do seu computador.")}
      </p>
    </fieldset>
  );
}

/**
 * RITMO E PROGRAMAÇÃO (fork jhoow): o INÍCIO da campanha (evento: agora ou
 * agendado, com data, HH:mm e fuso), o RITMO de envio e a JANELA DIÁRIA
 * (restrição recorrente, HH:mm). Usado na criação/edição (com início) e no
 * ajuste de uma campanha viva (sem início — ela já foi programada).
 */
export function CamposDeRitmo({
  v,
  onChange,
  prefixo,
  comInicio = false,
}: {
  v: ValoresDeRitmo;
  onChange: (campo: keyof ValoresDeRitmo, valor: string) => void;
  prefixo: string;
  comInicio?: boolean;
}) {
  const t = useT();
  const agora = useAgora();
  const erros = errosDoRitmo(v, agora);
  const janela = janelaDosValores(v);
  const modo = modoDoRitmo(v);
  const fuso = v.fuso && fusoValido(v.fuso) ? v.fuso : null;
  const resumo = resumoDoInicio({
    agora,
    fuso,
    modo: comInicio && v.inicioModo === "agendar" ? "agendar" : "agora",
    data: v.inicioData ?? "",
    hora: v.inicioHora ?? "",
    janela,
  });

  const seletorDeFuso = <SeletorDeFuso prefixo={prefixo} fuso={v.fuso} onFuso={(f) => onChange("fuso", f)} />;

  return (
    <div className="space-y-6">
      {comInicio && <CamposDeInicio v={v} onChange={onChange} prefixo={prefixo} />}

      {!comInicio && seletorDeFuso}

      <fieldset className="space-y-3" data-testid={`${prefixo}-janela`}>
        <legend className="text-sm font-medium">{t("Janela diária de envio")}</legend>
        <p className="text-xs text-muted-foreground">
          {t("Obrigatória: os envios só saem entre esses horários, todo dia, no fuso da campanha.")}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${prefixo}-inicio`}>{t("Enviar só a partir das")}</Label>
            <HoraMinuto id={`${prefixo}-inicio`} valor={v.janelaInicio} vazio="--" onChange={(x) => onChange("janelaInicio", x)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${prefixo}-fim`}>{t("Parar de enviar às")}</Label>
            <HoraMinuto id={`${prefixo}-fim`} valor={v.janelaFim} vazio="--" ateVinteQuatro onChange={(x) => onChange("janelaFim", x)} />
          </div>
        </div>
        {!janela && (
          <p className="text-xs text-error-fg" data-testid={`${prefixo}-janela-erro`}>
            {t(TEXTO_DO_ERRO_DO_RITMO.janela)}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {t("Quando o fuso do contato é conhecido (campo fuso_horario da ficha ou o DDI de um país de fuso único), a janela vale no fuso dele.")}
        </p>
      </fieldset>

      <fieldset className="space-y-3" data-testid={`${prefixo}-modo`}>
        <legend className="text-sm font-medium">{t("Como distribuir os envios dentro da janela?")}</legend>
        <div role="radiogroup" aria-label={t("Como distribuir os envios dentro da janela?")} className="grid gap-3 sm:grid-cols-2">
          <CartaoDoModo
            nome={`${prefixo}-modo`}
            ativo={modo === "cota"}
            onEscolher={() => {
              onChange("modoRitmo", "cota");
              if (!v.cotaPeriodo) onChange("cotaPeriodo", "dia");
            }}
            titulo={t("Quantos contatos chamar")}
            selo={t("Recomendado")}
            descricao={t("Diga quantos contatos quer chamar e o sistema espalha os envios pela janela.")}
            testid={`${prefixo}-modo-cota`}
          />
          <CartaoDoModo
            nome={`${prefixo}-modo`}
            ativo={modo === "intervalo"}
            onEscolher={() => onChange("modoRitmo", "intervalo")}
            titulo={t("Ritmo de envio (avançado)")}
            descricao={t("Controle fino do intervalo entre cada envio.")}
            testid={`${prefixo}-modo-intervalo`}
          />
        </div>

        {modo === "cota" ? (
          <CamposDaCota v={v} onChange={onChange} prefixo={prefixo} />
        ) : (
          <div className="space-y-3" data-testid={`${prefixo}-intervalo`}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`${prefixo}-min`}>{t("Intervalo mínimo (segundos)")}</Label>
                <Input id={`${prefixo}-min`} type="number" min={PISO_DO_INTERVALO_S} value={v.minIntervalo} onChange={(e) => onChange("minIntervalo", e.target.value)} />
                {equivalenciaDosSegundos(v.minIntervalo) && (
                  <p className="text-xs text-muted-foreground">{equivalenciaDosSegundos(v.minIntervalo)}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${prefixo}-max`}>{t("Intervalo máximo (segundos)")}</Label>
                <Input id={`${prefixo}-max`} type="number" min={PISO_DO_INTERVALO_S} value={v.maxIntervalo} onChange={(e) => onChange("maxIntervalo", e.target.value)} />
                {equivalenciaDosSegundos(v.maxIntervalo) && (
                  <p className="text-xs text-muted-foreground">{equivalenciaDosSegundos(v.maxIntervalo)}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${prefixo}-hora`}>{t("Máximo por hora (opcional)")}</Label>
                <Input id={`${prefixo}-hora`} type="number" min={1} value={v.tetoHorario} onChange={(e) => onChange("tetoHorario", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${prefixo}-dia`}>{t("Máximo por dia (opcional)")}</Label>
                <Input id={`${prefixo}-dia`} type="number" min={1} value={v.tetoDiario} onChange={(e) => onChange("tetoDiario", e.target.value)} />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("Cada envio aguarda um tempo aleatório entre esses valores. Evita o padrão robótico que o WhatsApp detecta.")}
            </p>
          </div>
        )}
      </fieldset>

      {comInicio && (
        <FraseDoInicio resumo={resumo} fuso={fuso} estado="previa" testid={`${prefixo}-resumo`} />
      )}
      {comInicio && !fuso && v.inicioModo !== "agendar" && (
        <p className="text-sm text-muted-foreground" data-testid={`${prefixo}-resumo`}>
          {t("Sem fuso próprio, a campanha segue o relógio do número.")}
        </p>
      )}
      {erros.some((e) => e !== "janela") && (
        <ul className="space-y-1 text-sm text-error-fg" role="alert">
          {erros
            .filter((e) => e !== "janela")
            .map((e) => (
              <li key={e}>{t(TEXTO_DO_ERRO_DO_RITMO[e])}</li>
            ))}
        </ul>
      )}
    </div>
  );
}
