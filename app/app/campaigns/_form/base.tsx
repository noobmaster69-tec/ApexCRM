"use client";
/**
 * Os componentes base do assistente de campanha (seção "Componentes base" da
 * especificação de nov/2026): seção de passo, campo com rótulo/ajuda/erro,
 * select com ícone, card de opção (radiogroup com setas), stepper numérico.
 *
 * Nenhum deles chama `t()` sobre o que recebe: quem usa passa o texto já
 * traduzido.
 */
import { ChevronDown, CircleAlert, CircleCheck, Minus, Plus, type LucideIcon } from "lucide-react";
import { useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";

export function Secao({
  icone: Icone,
  cor,
  fundo,
  titulo,
  subtitulo,
  direita,
  children,
}: {
  icone: LucideIcon;
  cor: string;
  fundo: string;
  titulo: string;
  subtitulo: string;
  direita?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="cw-secao">
      <header className="cw-secao-cabecalho">
        <span className="cw-secao-icone" style={{ background: fundo, color: cor }} aria-hidden>
          <Icone size={18} />
        </span>
        <div style={{ minWidth: 0 }}>
          <h2 className="cw-secao-titulo">{titulo}</h2>
          <p className="cw-secao-sub">{subtitulo}</p>
        </div>
        {direita}
      </header>
      {children}
    </section>
  );
}

export function ErroDoCampo({ id, texto }: { id: string; texto?: string | null }) {
  if (!texto) return null;
  return (
    <p className="cw-erro-campo" id={`${id}-erro`} role="alert">
      <CircleAlert size={13} aria-hidden />
      {texto}
    </p>
  );
}

export function Campo({
  id,
  rotulo,
  detalhe,
  ajuda,
  erro,
  children,
  estilo,
}: {
  id?: string;
  rotulo?: ReactNode;
  detalhe?: string;
  ajuda?: ReactNode;
  erro?: string | null;
  children: ReactNode;
  estilo?: CSSProperties;
}) {
  return (
    <div className="cw-campo" style={estilo} data-campo={id}>
      {rotulo && (
        <label className="cw-rotulo" htmlFor={id}>
          {rotulo}
          {detalhe && <small>{detalhe}</small>}
        </label>
      )}
      {children}
      {ajuda && <p className="cw-ajuda">{ajuda}</p>}
      {id && <ErroDoCampo id={id} texto={erro} />}
    </div>
  );
}

/** Select nativo vestido: ícone à esquerda, chevron à direita. */
export function SelectComIcone({
  id,
  icone: Icone,
  valor,
  onChange,
  children,
  desligado,
  rotulo,
  classe = "",
  estilo,
}: {
  id?: string;
  icone?: LucideIcon;
  valor: string;
  onChange: (v: string) => void;
  children: ReactNode;
  desligado?: boolean;
  rotulo?: string;
  classe?: string;
  estilo?: CSSProperties;
}) {
  return (
    <div className={`cw-com-icone ${classe}`} data-desligado={desligado || undefined} style={estilo}>
      {Icone ? <Icone size={15} aria-hidden /> : <span />}
      <select
        id={id}
        value={valor}
        disabled={desligado}
        aria-label={rotulo}
        onChange={(e) => onChange(e.target.value)}
        style={Icone ? undefined : { paddingLeft: 12 }}
      >
        {children}
      </select>
      <ChevronDown size={15} className="cw-chevron" aria-hidden />
    </div>
  );
}

/**
 * Radiogroup acessível: as setas mudam a seleção (e o foco), como num grupo de
 * rádios do navegador. Os filhos são `CartaoDeOpcao`.
 */
export function GrupoDeOpcoes({
  rotulo,
  valores,
  valor,
  onChange,
  classe,
  children,
  id,
}: {
  rotulo: string;
  valores: readonly string[];
  valor: string;
  onChange: (v: string) => void;
  classe: string;
  children: ReactNode;
  id?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const aoTeclar = (e: KeyboardEvent<HTMLDivElement>) => {
    const passo = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!passo || valores.length === 0) return;
    e.preventDefault();
    const elemento = (x: string) =>
      [...(ref.current?.querySelectorAll<HTMLElement>("[data-valor]") ?? [])].find((el) => el.dataset.valor === x);
    const habilitados = valores.filter((x) => {
      const el = elemento(x);
      return el && el.getAttribute("aria-disabled") !== "true";
    });
    if (habilitados.length === 0) return;
    const i = habilitados.indexOf(valor);
    const proximo = habilitados[(i + passo + habilitados.length) % habilitados.length]!;
    onChange(proximo);
    elemento(proximo)?.focus();
  };
  return (
    <div ref={ref} role="radiogroup" aria-label={rotulo} className={classe} onKeyDown={aoTeclar} id={id}>
      {children}
    </div>
  );
}

export function CartaoDeOpcao({
  valor,
  selecionado,
  onEscolher,
  icone: Icone,
  titulo,
  descricao,
  indicador = "radio",
  selo,
  direita,
  desabilitado,
  dica,
  cores,
  topo,
  testid,
  radioAntes,
}: {
  valor: string;
  selecionado: boolean;
  onEscolher: () => void;
  icone?: LucideIcon;
  titulo: ReactNode;
  descricao?: ReactNode;
  /** "radio" à direita, "check" no canto, ou nenhum. */
  indicador?: "radio" | "check" | "nenhum";
  selo?: string;
  direita?: ReactNode;
  desabilitado?: boolean;
  dica?: string;
  /** As cores do contexto quando selecionado. */
  cores?: { bg?: string; borda?: string; icone?: string; iconeBg?: string };
  topo?: boolean;
  testid?: string;
  /** O radio à esquerda do ícone (cards de número), em vez de à direita. */
  radioAntes?: boolean;
}) {
  const estilo = {
    "--sel-bg": cores?.bg,
    "--sel-borda": cores?.borda,
    "--sel-icone": cores?.icone,
    "--sel-icone-bg": cores?.iconeBg,
  } as CSSProperties;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selecionado}
      aria-disabled={desabilitado || undefined}
      data-valor={valor}
      data-testid={testid}
      title={dica}
      className={`cw-opcao${topo ? " cw-opcao-topo" : ""}`}
      style={estilo}
      onClick={() => {
        if (!desabilitado) onEscolher();
      }}
    >
      {indicador === "radio" && radioAntes && <span className="cw-radio" aria-hidden />}
      {Icone && (
        <span className="cw-opcao-icone" aria-hidden>
          <Icone size={17} />
        </span>
      )}
      <span className="cw-opcao-texto">
        <span className="cw-opcao-titulo">
          {titulo}
          {selo && <span className="cw-selo">{selo}</span>}
        </span>
        {descricao && <span className="cw-opcao-desc">{descricao}</span>}
      </span>
      {direita}
      {indicador === "radio" && !radioAntes && <span className="cw-radio" aria-hidden style={topo ? { alignSelf: "flex-start" } : undefined} />}
      {indicador === "check" && selecionado && <CircleCheck size={17} className="cw-check-canto" aria-hidden />}
    </button>
  );
}

/**
 * STEPPER (− valor +): aceita digitação ao clicar no valor e as setas do
 * teclado (↑↓ ±passo, Shift ±10 passos). Vazio é permitido quando `vazio`
 * diz o que ele significa.
 */
export function Stepper({
  id,
  valor,
  onChange,
  passo = 1,
  minimo = 0,
  maximo,
  sufixo,
  grande,
  rotulo,
  menos,
  mais,
  invalido,
}: {
  id?: string;
  valor: string;
  onChange: (v: string) => void;
  passo?: number;
  minimo?: number;
  maximo?: number;
  sufixo?: string;
  grande?: boolean;
  rotulo: string;
  menos: string;
  mais: string;
  invalido?: boolean;
}) {
  const n = Number(valor);
  const atual = valor.trim() === "" || !Number.isFinite(n) ? null : n;
  const limitar = (x: number) => Math.max(minimo, maximo !== undefined ? Math.min(maximo, x) : x);
  const somar = (d: number) => onChange(String(limitar((atual ?? minimo) + d)));
  return (
    <div
      className={`cw-stepper${grande ? " cw-stepper-grande" : ""}`}
      style={invalido ? { borderColor: "var(--cw-danger)" } : undefined}
    >
      <button type="button" aria-label={menos} disabled={atual !== null && atual <= minimo} onClick={() => somar(-passo)}>
        <Minus size={grande ? 15 : 14} aria-hidden />
      </button>
      <input
        id={id}
        inputMode="numeric"
        aria-label={rotulo}
        aria-invalid={invalido || undefined}
        value={valor}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
        onBlur={() => {
          if (atual !== null && atual !== limitar(atual)) onChange(String(limitar(atual)));
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            somar((e.key === "ArrowUp" ? 1 : -1) * passo * (e.shiftKey ? 10 : 1));
          }
        }}
      />
      {sufixo && <span className="cw-stepper-sufixo">{sufixo}</span>}
      <button
        type="button"
        aria-label={mais}
        disabled={atual !== null && maximo !== undefined && atual >= maximo}
        onClick={() => somar(passo)}
      >
        <Plus size={grande ? 15 : 14} aria-hidden />
      </button>
    </div>
  );
}

const doisDigitos = (n: number) => String(n).padStart(2, "0");
export const hhmm = (min: number) => `${doisDigitos(Math.floor(min / 60))}:${doisDigitos(min % 60)}`;

/** Stepper de HORA (Geist Mono, "09:00"): passo de 1 h, ou 30 min com Shift. Aceita digitar "0930". */
export function StepperDeHora({
  id,
  minutos,
  onChange,
  minimo = 0,
  maximo = 1440,
  rotulo,
  menos,
  mais,
  invalido,
}: {
  id?: string;
  minutos: number | null;
  onChange: (min: number) => void;
  minimo?: number;
  maximo?: number;
  rotulo: string;
  menos: string;
  mais: string;
  invalido?: boolean;
}) {
  const [texto, setTexto] = useState<string | null>(null);
  const limitar = (x: number) => Math.max(minimo, Math.min(maximo, x));
  const somar = (d: number) => onChange(limitar((minutos ?? 540) + d));
  const confirmar = () => {
    if (texto === null) return;
    const m = /^(\d{1,2}):?(\d{2})?$/.exec(texto.trim());
    if (m) {
      const h = Number(m[1]);
      const mi = Number(m[2] ?? 0);
      if (h <= 24 && mi < 60 && !(h === 24 && mi > 0)) onChange(limitar(h * 60 + mi));
    }
    setTexto(null);
  };
  return (
    <div className="cw-stepper cw-stepper-hora" style={invalido ? { borderColor: "var(--cw-danger)" } : undefined}>
      <button type="button" aria-label={menos} onClick={(e) => somar(e.shiftKey ? -30 : -60)}>
        <Minus size={14} aria-hidden />
      </button>
      <input
        id={id}
        aria-label={rotulo}
        value={texto ?? (minutos === null ? "--:--" : hhmm(minutos))}
        onFocus={(e) => {
          setTexto(minutos === null ? "" : hhmm(minutos));
          e.currentTarget.select();
        }}
        onChange={(e) => setTexto(e.target.value.replace(/[^\d:]/g, "").slice(0, 5))}
        onBlur={confirmar}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.currentTarget as HTMLInputElement).blur();
          }
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            setTexto(null);
            somar((e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 30 : 60));
          }
        }}
      />
      <button type="button" aria-label={mais} onClick={(e) => somar(e.shiftKey ? 30 : 60)}>
        <Plus size={14} aria-hidden />
      </button>
    </div>
  );
}
