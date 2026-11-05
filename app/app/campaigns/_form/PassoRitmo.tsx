"use client";
/**
 * PASSO 5 — RITMO E PROGRAMAÇÃO: o início (agora ou agendado), o fuso, a
 * janela diária (steppers + régua arrastável), como distribuir os envios e,
 * abaixo da seção, o "Resumo do envio" — que refaz a conta a cada clique.
 *
 * Os valores são os mesmos de `CamposDeRitmo` (que segue servindo a tela de
 * detalhe): janela "HH:mm", cota por período ou o intervalo avançado.
 */
import {
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CircleAlert,
  Flag,
  Gauge,
  Globe,
  Rocket,
  Sunrise,
  Sunset,
  Timer,
  TriangleAlert,
  Users,
} from "lucide-react";
import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { diaEMes } from "@/components/campanhas/CalendarioDeIntervalo";
import { equivalenciaDosSegundos, janelaDosValores, modoDoRitmo } from "@/components/campanhas/CamposDeRitmo";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { camposDoInstante, horarioDosMinutos, minutosDoHorario } from "@/lib/campanhas/agendamento";
import { PERIODOS_DA_COTA } from "@/lib/campanhas/cota";
import { FUSOS_PRINCIPAIS, todosOsFusos } from "@/lib/campanhas/fuso";

import { VelocidadeDaCampanha } from "../_components/VelocidadeDaCampanha";
import { CartaoDeOpcao, Campo, ErroDoCampo, GrupoDeOpcoes, SelectComIcone, Secao, Stepper, StepperDeHora } from "./base";
import { contaDoEnvio, enviosPorDia, marcasDoDia, textoDoIntervalo } from "./calculos";
import { mudarCampo, type PropsDoPasso } from "./contexto";

const PRESETS = [5, 10, 20, 50] as const;
const OUTRO = "__outro__";
const LEGENDA = ["00h", "06h", "12h", "18h", "24h"] as const;
/** A régua anda de 15 em 15 minutos. */
const PASSO_DA_REGUA = 15;

const ROTULO_DO_PERIODO = { hora: "por hora", dia: "por dia", semana: "por semana", mes: "por mês" } as const;

export function PassoRitmo({
  v,
  setV,
  erro,
  agora,
  fusoDaConta,
  limiteDoNumero,
  mostrarVelocidade,
  comModelo,
}: PropsDoPasso & {
  agora: Date;
  /** O fuso usado nas contas quando a campanha não tem um (o do navegador). */
  fusoDaConta: string;
  /** O limite diário do número escolhido no passo 1 (0 = desconhecido). */
  limiteDoNumero: number;
  mostrarVelocidade: boolean;
  comModelo: boolean;
}) {
  const t = useT();
  const idioma = useTagDeIdioma();
  const mudar = mudarCampo(setV);
  const modo = modoDoRitmo(v);
  const janela = janelaDosValores(v);
  const ini = minutosDoHorario(v.janelaInicio);
  const fim = minutosDoHorario(v.janelaFim);
  const porDia = enviosPorDia(v);
  const rapida = comModelo && v.velocidade === "rapida";
  const hoje = camposDoInstante(agora, v.fuso || fusoDaConta).data;

  const dataLegivel = (iso: string) => {
    const [a, m, d] = iso.split("-").map(Number);
    return a ? new Intl.DateTimeFormat(idioma, { dateStyle: "short" }).format(new Date(a, (m ?? 1) - 1, d ?? 1)) : iso;
  };
  const ajudaDoInicio =
    v.inicioModo === "agendar" && v.inicioData && v.inicioHora
      ? t("Agendada para {data} às {hora}.").replace("{data}", dataLegivel(v.inicioData)).replace("{hora}", v.inicioHora)
      : t("Começa assim que você iniciar, dentro da janela.");

  return (
    <Secao
      icone={CalendarClock}
      cor="#7dd3fc"
      fundo="#0f2533"
      titulo={t("Ritmo e programação")}
      subtitulo={t("Em branco, vale o ritmo do número. O que você puser aqui só pode deixar mais devagar.")}
    >
      <div className="cw-grade-2">
        <div className="cw-campo" data-campo="inicio">
          <span className="cw-rotulo">{t("Início da campanha")}</span>
          <div role="radiogroup" aria-label={t("Início da campanha")} className="cw-grade-2" style={{ gap: 10 }}>
            <button
              type="button"
              role="radio"
              aria-checked={v.inicioModo !== "agendar"}
              className="cw-botao-card"
              onClick={() => mudar("inicioModo", "agora")}
              data-testid="inicio-agora"
            >
              <Rocket size={15} aria-hidden />
              {t("Iniciar agora")}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={v.inicioModo === "agendar"}
              className="cw-botao-card"
              onClick={() =>
                setV((a) => ({
                  ...a,
                  inicioModo: "agendar",
                  inicioData: a.inicioData || hoje,
                  inicioHora: a.inicioHora || a.janelaInicio || "09:00",
                }))
              }
              data-testid="inicio-agendar"
            >
              <CalendarClock size={15} aria-hidden />
              {t("Agendar")}
            </button>
          </div>
          {v.inicioModo === "agendar" && (
            <div className="cw-grade-2" style={{ gap: 10 }}>
              <input
                id="inicio"
                type="date"
                className="cw-input cw-data"
                aria-label={t("Data")}
                min={hoje}
                value={v.inicioData}
                onChange={(e) => mudar("inicioData", e.target.value)}
                aria-invalid={!!erro("inicio") || undefined}
              />
              <StepperDeHora
                id="inicio-hora"
                minutos={minutosDoHorario(v.inicioHora)}
                maximo={1410}
                onChange={(m) => mudar("inicioHora", horarioDosMinutos(m))}
                rotulo={t("Horário (HH:mm)")}
                menos={t("Mais cedo")}
                mais={t("Mais tarde")}
              />
            </div>
          )}
          <p className="cw-ajuda">{ajudaDoInicio}</p>
          {v.inicioModo === "agendar" && (
            <p className="cw-ajuda">
              {t(
                "O agendamento é confirmado depois de preparar a lista, no botão Agendar da campanha. Até lá, nada é enviado.",
              )}
            </p>
          )}
          <ErroDoCampo id="inicio" texto={erro("inicio")} />
        </div>
        <SeletorDoFuso fuso={v.fuso} onFuso={(f) => mudar("fuso", f)} erro={erro("fuso")} />
      </div>

      <div className="cw-campo" data-campo="janela">
        <span className="cw-rotulo">
          {t("Janela diária de envio")}
          <small>{t("obrigatória · os envios só saem entre esses horários")}</small>
        </span>
        <div className="cw-janela">
          <div className="cw-campo">
            <label className="cw-rotulo cw-rotulo-icone" htmlFor="janela-inicio">
              <Sunrise size={14} color="#f7cd7a" aria-hidden />
              {t("Enviar a partir das")}
            </label>
            <StepperDeHora
              id="janela-inicio"
              minutos={ini}
              maximo={1410}
              onChange={(m) => mudar("janelaInicio", horarioDosMinutos(m))}
              rotulo={t("Enviar a partir das")}
              menos={t("Mais cedo")}
              mais={t("Mais tarde")}
              invalido={!!erro("janela")}
            />
          </div>
          <div className="cw-regua-col">
            <ReguaDoDia
              inicio={ini}
              fim={fim}
              porDia={porDia ?? 0}
              onMudar={(i, f) => setV((a) => ({ ...a, janelaInicio: horarioDosMinutos(i), janelaFim: horarioDosMinutos(f) }))}
              rotuloInicio={t("Enviar a partir das")}
              rotuloFim={t("Parar de enviar às")}
            />
          </div>
          <div className="cw-campo">
            <label className="cw-rotulo cw-rotulo-icone" htmlFor="janela-fim">
              <Sunset size={14} color="#c4b5fd" aria-hidden />
              {t("Parar de enviar às")}
            </label>
            <StepperDeHora
              id="janela-fim"
              minutos={fim}
              minimo={30}
              maximo={1440}
              onChange={(m) => mudar("janelaFim", horarioDosMinutos(m))}
              rotulo={t("Parar de enviar às")}
              menos={t("Mais cedo")}
              mais={t("Mais tarde")}
              invalido={!!erro("janela")}
            />
          </div>
        </div>
        <p className="cw-ajuda">
          {t(
            "Quando o fuso do contato é conhecido (campo fuso_horario ou DDI de país de fuso único), a janela vale no fuso dele.",
          )}
        </p>
        <ErroDoCampo id="janela" texto={erro("janela") ?? (!janela ? t("O fim tem que ser depois do início.") : null)} />
      </div>

      <div className="cw-campo">
        <span className="cw-rotulo">{t("Como distribuir os envios dentro da janela?")}</span>
        <GrupoDeOpcoes
          rotulo={t("Como distribuir os envios dentro da janela?")}
          classe="cw-grade-2"
          valores={["cota", "intervalo"]}
          valor={modo}
          onChange={(x) =>
            setV((a) => ({ ...a, modoRitmo: x as typeof modo, cotaPeriodo: x === "cota" && !a.cotaPeriodo ? "dia" : a.cotaPeriodo }))
          }
        >
          <CartaoDeOpcao
            valor="cota"
            topo
            selecionado={modo === "cota"}
            onEscolher={() => setV((a) => ({ ...a, modoRitmo: "cota", cotaPeriodo: a.cotaPeriodo || "dia" }))}
            icone={Users}
            titulo={t("Quantos contatos chamar")}
            selo={t("Recomendado")}
            descricao={t("O sistema espalha os envios pela janela.")}
            testid="ritmo-modo-cota"
          />
          <CartaoDeOpcao
            valor="intervalo"
            topo
            selecionado={modo === "intervalo"}
            onEscolher={() => mudar("modoRitmo", "intervalo")}
            icone={Gauge}
            titulo={t("Ritmo de envio (avançado)")}
            descricao={t("Controle fino do intervalo entre cada envio.")}
            testid="ritmo-modo-intervalo"
          />
        </GrupoDeOpcoes>
      </div>

      {modo === "cota" ? (
        <div className="cw-campo" data-campo="cota">
          <div className="cw-quantidade">
            <Stepper
              id="cota"
              grande
              valor={v.cotaQuantidade}
              onChange={(x) => mudar("cotaQuantidade", x)}
              minimo={1}
              rotulo={t("Quantos contatos")}
              menos={t("Menos")}
              mais={t("Mais")}
              invalido={!!erro("cota")}
            />
            <span className="cw-quantidade-rotulo">
              {t("contatos")}
              <select
                aria-label={t("Período")}
                value={v.cotaPeriodo || "dia"}
                onChange={(e) => mudar("cotaPeriodo", e.target.value as typeof v.cotaPeriodo)}
                data-testid="ritmo-cota-periodo"
              >
                {PERIODOS_DA_COTA.map((p) => (
                  <option key={p} value={p}>
                    {t(ROTULO_DO_PERIODO[p])}
                  </option>
                ))}
              </select>
            </span>
            <div className="cw-presets" role="group" aria-label={t("Atalhos")}>
              {PRESETS.map((n) => (
                <button
                  key={n}
                  type="button"
                  className="cw-preset"
                  aria-pressed={(v.cotaPeriodo || "dia") === "dia" && Number(v.cotaQuantidade) === n}
                  onClick={() => setV((a) => ({ ...a, cotaQuantidade: String(n), cotaPeriodo: "dia" }))}
                >
                  {t("{n}/dia").replace("{n}", String(n))}
                </button>
              ))}
            </div>
          </div>
          {limiteDoNumero > 0 && porDia !== null && porDia > limiteDoNumero && (
            <p className="cw-aviso-amarelo">
              <TriangleAlert size={13} aria-hidden />
              {t("O número aceita até {n}/dia").replace("{n}", limiteDoNumero.toLocaleString(idioma))}
            </p>
          )}
          <ErroDoCampo id="cota" texto={erro("cota")} />
        </div>
      ) : (
        <div className="cw-campo" data-campo="intervalo">
          <div className="cw-grade-2">
            <Campo id="intervalo" rotulo={t("Intervalo mínimo")} ajuda={equivalenciaDosSegundos(v.minIntervalo)}>
              <Stepper
                id="intervalo"
                valor={v.minIntervalo}
                onChange={(x) => mudar("minIntervalo", x)}
                passo={10}
                minimo={10}
                sufixo={t("segundos")}
                rotulo={t("Intervalo mínimo")}
                menos={t("Menos")}
                mais={t("Mais")}
                invalido={!!erro("intervalo")}
              />
            </Campo>
            <Campo id="intervalo-max" rotulo={t("Intervalo máximo")} ajuda={equivalenciaDosSegundos(v.maxIntervalo)}>
              <Stepper
                id="intervalo-max"
                valor={v.maxIntervalo}
                onChange={(x) => mudar("maxIntervalo", x)}
                passo={10}
                minimo={10}
                sufixo={t("segundos")}
                rotulo={t("Intervalo máximo")}
                menos={t("Menos")}
                mais={t("Mais")}
                invalido={!!erro("intervalo")}
              />
            </Campo>
            <Campo id="teto-hora" rotulo={t("Máximo por hora")} detalhe={t("opcional")}>
              <Stepper
                id="teto-hora"
                valor={v.tetoHorario}
                onChange={(x) => mudar("tetoHorario", x)}
                minimo={1}
                rotulo={t("Máximo por hora")}
                menos={t("Menos")}
                mais={t("Mais")}
              />
            </Campo>
            <Campo id="teto-dia" rotulo={t("Máximo por dia")} detalhe={t("opcional")}>
              <Stepper
                id="teto-dia"
                valor={v.tetoDiario}
                onChange={(x) => mudar("tetoDiario", x)}
                minimo={1}
                rotulo={t("Máximo por dia")}
                menos={t("Menos")}
                mais={t("Mais")}
              />
            </Campo>
          </div>
          <p className="cw-ajuda">
            {t("Cada envio aguarda um tempo aleatório entre esses valores. Evita o padrão robótico que o WhatsApp detecta.")}
          </p>
          <ErroDoCampo id="intervalo" texto={erro("intervalo")} />
        </div>
      )}

      {mostrarVelocidade && (
        <div className="cw-legado">
          <VelocidadeDaCampanha valor={v.velocidade} onChange={(x) => mudar("velocidade", x)} ehOficial={comModelo} />
          {rapida && (
            <p className="cw-ajuda" style={{ marginTop: 8 }}>
              {t("No envio rápido o intervalo da campanha não vale: a rajada tem o próprio espaçamento.")}
            </p>
          )}
        </div>
      )}
    </Secao>
  );
}

/** O fuso: "O do número", os principais e "Outro…", que abre a lista IANA inteira. */
function SeletorDoFuso({ fuso, onFuso, erro }: { fuso: string; onFuso: (f: string) => void; erro?: string }) {
  const t = useT();
  const principais = FUSOS_PRINCIPAIS.map((f) => f.fuso) as readonly string[];
  const [outro, setOutro] = useState(fuso !== "" && !principais.includes(fuso));
  const todos = useMemo(() => (outro ? todosOsFusos() : []), [outro]);
  return (
    <div className="cw-campo" data-campo="fuso">
      <label className="cw-rotulo" htmlFor="fuso">
        {t("Fuso horário da campanha")}
      </label>
      <SelectComIcone
        id="fuso"
        icone={Globe}
        valor={outro ? OUTRO : fuso}
        onChange={(x) => {
          if (x === OUTRO) {
            setOutro(true);
            return;
          }
          setOutro(false);
          onFuso(x);
        }}
      >
        <option value="">{t("O do número (Conexões › Proteção de envio)")}</option>
        {FUSOS_PRINCIPAIS.map((f) => (
          <option key={f.fuso} value={f.fuso}>
            {`${t(f.rotulo)} (${f.fuso})`}
          </option>
        ))}
        <option value={OUTRO}>{t("Outro…")}</option>
      </SelectComIcone>
      {outro && (
        <SelectComIcone icone={Globe} valor={fuso} onChange={onFuso} rotulo={t("Escolha o fuso")}>
          <option value="">{t("Escolha o fuso")}</option>
          {todos.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </SelectComIcone>
      )}
      <p className="cw-ajuda">{t("Vale o fuso da campanha, com o horário de verão dessa data.")}</p>
      <ErroDoCampo id="fuso" texto={erro} />
    </div>
  );
}

/**
 * A RÉGUA DO DIA: a faixa da janela sobre as 24 h, um traço por envio, e as
 * bordas arrastáveis (mouse/toque) ou ajustáveis pelo teclado (←→ 15 min,
 * Shift 1 h) — sincronizadas com os steppers.
 */
function ReguaDoDia({
  inicio,
  fim,
  porDia,
  onMudar,
  rotuloInicio,
  rotuloFim,
}: {
  inicio: number | null;
  fim: number | null;
  porDia: number;
  onMudar: (inicio: number, fim: number) => void;
  rotuloInicio: string;
  rotuloFim: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [arrastando, setArrastando] = useState<"inicio" | "fim" | null>(null);
  const valida = inicio !== null && fim !== null && fim > inicio;
  const i = inicio ?? 540;
  const f = fim ?? 1080;
  const marcas = valida ? marcasDoDia({ inicio: i, fim: f }, porDia) : [];

  const minutoDoPonto = (x: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || r.width === 0) return 0;
    const bruto = ((x - r.left) / r.width) * 1440;
    return Math.max(0, Math.min(1440, Math.round(bruto / PASSO_DA_REGUA) * PASSO_DA_REGUA));
  };
  const aplicar = (qual: "inicio" | "fim", m: number) => {
    if (qual === "inicio") onMudar(Math.min(m, f - PASSO_DA_REGUA, 1440 - PASSO_DA_REGUA), f);
    else onMudar(i, Math.max(m, i + PASSO_DA_REGUA));
  };
  const mover = (e: PointerEvent<HTMLDivElement>) => {
    if (!arrastando) return;
    aplicar(arrastando, minutoDoPonto(e.clientX));
  };
  const teclar = (qual: "inicio" | "fim") => (e: KeyboardEvent<HTMLButtonElement>) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const passo = (e.shiftKey ? 60 : PASSO_DA_REGUA) * d;
    aplicar(qual, (qual === "inicio" ? i : f) + passo);
  };
  const alca = (qual: "inicio" | "fim") => (
    <button
      type="button"
      className="cw-alca"
      role="slider"
      aria-label={qual === "inicio" ? rotuloInicio : rotuloFim}
      aria-valuemin={0}
      aria-valuemax={1440}
      aria-valuenow={qual === "inicio" ? i : f}
      aria-valuetext={horarioDosMinutos(qual === "inicio" ? i : f)}
      style={{ left: `${((qual === "inicio" ? i : f) / 1440) * 100}%` }}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget.parentElement as HTMLElement | null)?.setPointerCapture?.(e.pointerId);
        setArrastando(qual);
      }}
      onKeyDown={teclar(qual)}
    />
  );

  return (
    <div>
      <div
        ref={ref}
        className="cw-regua"
        data-arrastando={arrastando ? true : undefined}
        onPointerMove={mover}
        onPointerUp={() => setArrastando(null)}
        onPointerCancel={() => setArrastando(null)}
      >
        {valida && (
          <div className="cw-faixa" style={{ left: `${(i / 1440) * 100}%`, width: `${((f - i) / 1440) * 100}%` }} />
        )}
        {marcas.map((x, k) => (
          <i key={k} className="cw-traco-envio" style={{ left: `${x}%` }} />
        ))}
        {alca("inicio")}
        {alca("fim")}
      </div>
      <div className="cw-legenda" aria-hidden>
        {LEGENDA.map((x) => (
          <span key={x}>{x}</span>
        ))}
      </div>
    </div>
  );
}

/**
 * O RESUMO DO ENVIO: quantos por dia, de quanto em quanto tempo, quantos dias
 * e quando termina — e um dia de envios desenhado, com a varredura.
 */
export function ResumoDoEnvio({
  v,
  total,
  agora,
  fuso,
}: {
  v: PropsDoPasso["v"];
  total: number;
  agora: Date;
  fuso: string;
}) {
  const t = useT();
  const idioma = useTagDeIdioma();
  const conta = contaDoEnvio(v, total, agora, fuso);
  if (!conta) {
    return (
      <div className="cw-alerta" role="alert" data-testid="resumo-do-envio-invalido">
        <CircleAlert size={16} aria-hidden />
        {t("Informe quantos contatos chamar (1 ou mais) e uma janela com o horário de fim depois do de início.")}
      </div>
    );
  }
  const n = (x: number) => x.toLocaleString(idioma);
  const de = horarioDosMinutos(conta.janela.inicio);
  const ate = horarioDosMinutos(conta.janela.fim);
  const intervalo = textoDoIntervalo(conta.intervaloMin);
  const marcas = marcasDoDia(conta.janela, conta.porDia);
  const largura = ((conta.janela.fim - conta.janela.inicio) / 1440) * 100;
  return (
    <section className="cw-envio" aria-live="polite" data-testid="resumo-do-envio">
      <div className="cw-envio-topo">
        <span className="cw-envio-icone" aria-hidden>
          <CalendarCheck size={17} />
        </span>
        <span className="cw-envio-rotulo">{t("Resumo do envio")}</span>
        <span className="cw-envio-vivo">
          <span className="cw-ponto-vivo" aria-hidden />
          {t("Atualiza enquanto você ajusta")}
        </span>
      </div>
      <h3 className="cw-envio-manchete">
        {t("{n} contatos por dia, entre {de} e {ate}")
          .replace("{n}", n(conta.porDia))
          .replace("{de}", de)
          .replace("{ate}", ate)}
      </h3>
      <p className="cw-envio-frase">
        {t("Cerca de 1 envio a cada {intervalo}. Os {total} contatos recebem em {d} dias, de {inicio} a {fim}.")
          .replace("{intervalo}", intervalo)
          .replace("{total}", n(total))
          .replace("{d}", n(conta.dias))
          .replace("{inicio}", diaEMes(conta.inicio, idioma))
          .replace("{fim}", diaEMes(conta.fim, idioma))}
      </p>
      <div className="cw-tiles">
        <div className="cw-tile">
          <span className="cw-tile-rotulo">
            <Users size={13} aria-hidden />
            {t("Por dia")}
          </span>
          <span className="cw-tile-valor">{t("{n} contatos").replace("{n}", n(conta.porDia))}</span>
        </div>
        <div className="cw-tile">
          <span className="cw-tile-rotulo">
            <Timer size={13} aria-hidden />
            {t("Intervalo")}
          </span>
          <span className="cw-tile-valor">{`~${intervalo}`}</span>
        </div>
        <div className="cw-tile">
          <span className="cw-tile-rotulo">
            <CalendarDays size={13} aria-hidden />
            {t("Duração")}
          </span>
          <span className="cw-tile-valor">
            {conta.dias === 1 ? t("1 dia") : t("{n} dias").replace("{n}", n(conta.dias))}
          </span>
        </div>
        <div className="cw-tile">
          <span className="cw-tile-rotulo">
            <Flag size={13} aria-hidden />
            {t("Termina em")}
          </span>
          <span className="cw-tile-valor">{diaEMes(conta.fim, idioma)}</span>
        </div>
      </div>
      <div>
        <span className="cw-dia-rotulo">{t("Como fica um dia de envios")}</span>
        <div className="cw-dia">
          <div className="cw-dia-faixa" style={{ left: `${(conta.janela.inicio / 1440) * 100}%`, width: `${largura}%` }}>
            <i className="cw-varredura" aria-hidden />
          </div>
          {marcas.map((x, k) => (
            <i key={k} className="cw-dia-bolinha" style={{ left: `${x}%` }} aria-hidden />
          ))}
        </div>
        <div className="cw-legenda" aria-hidden>
          {LEGENDA.map((x) => (
            <span key={x}>{x}</span>
          ))}
        </div>
      </div>
    </section>
  );
}
