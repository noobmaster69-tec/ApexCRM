"use client";
/**
 * A lista de Campanhas (PRD §24; redesenho de nov/2026, tema Ônix + Azul).
 *
 * De cima para baixo: o cabeçalho, os resultados do PERÍODO escolhido (KPIs e
 * a taxa de resposta em destaque), a campanha que está enviando AGORA (ao vivo)
 * e a tabela. O período mora na URL (`?periodo=30d` ou `?de=&ate=`) e na
 * memória do navegador; os números saem de `GET /api/v1/campaigns/resumo`.
 */
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  List,
  Megaphone,
  MessageCircleReply,
  Pause,
  Plus,
  SlidersHorizontal,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { CalendarioDeIntervalo, textoDoIntervalo } from "@/components/campanhas/CalendarioDeIntervalo";
import { useAgora } from "@/components/campanhas/CamposDeRitmo";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  useAcaoNaLista,
  useMetricasAoVivo,
  useResumoDasCampanhas,
  type AcaoDeCampanha,
  type CampanhaDoResumo,
  type Destinatario,
} from "@/hooks/campanhas/useCampanhas";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { fusoValido } from "@/lib/campanhas/fuso";
import { previsaoDoFim, fusoDoNavegador } from "@/lib/campanhas/previsao";
import {
  datasDoPeriodo,
  diaLocal,
  instantesDasDatas,
  percentual,
  PERIODOS_PRONTOS,
  type PeriodoPronto,
} from "@/lib/campanhas/resumo";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";

import { ICONE_DO_TIPO, ROTULO_DO_TIPO, textoDoPercentual } from "./_lista/comum";
import { nomeDaLista, TabelaDeCampanhas, type ItemDoMenu } from "./_lista/TabelaDeCampanhas";
import "./_estilo/lista.css";

type Periodo = { tipo: "pronto"; valor: PeriodoPronto } | { tipo: "livre"; de: string; ate: string };

const ROTULO_DO_PERIODO: Record<PeriodoPronto, string> = {
  hoje: "Hoje",
  "7d": "7 dias",
  "30d": "30 dias",
  "90d": "90 dias",
};

const CHAVE_DO_PERIODO = "campanhas:periodo";
const PADRAO: Periodo = { tipo: "pronto", valor: "30d" };

function lerPeriodo(params: URLSearchParams | null): Periodo | null {
  const p = params?.get("periodo");
  if (p && (PERIODOS_PRONTOS as readonly string[]).includes(p)) return { tipo: "pronto", valor: p as PeriodoPronto };
  const de = params?.get("de");
  const ate = params?.get("ate");
  if (de && ate && instantesDasDatas(de, ate)) return { tipo: "livre", de, ate };
  return null;
}

function datasDe(p: Periodo): { de: string; ate: string } {
  return p.tipo === "pronto" ? datasDoPeriodo(p.valor) : { de: p.de, ate: p.ate };
}

/** O período: a URL manda; sem ela, o último escolhido neste navegador; sem ele, 30 dias. */
function usePeriodo(): [Periodo, (p: Periodo) => void] {
  const params = useSearchParams();
  const [periodo, setPeriodo] = useState<Periodo>(() => lerPeriodo(params) ?? PADRAO);
  useEffect(() => {
    if (lerPeriodo(params)) return;
    try {
      const salvo = lerPeriodo(new URLSearchParams(window.localStorage.getItem(CHAVE_DO_PERIODO) ?? ""));
      if (salvo) setPeriodo(salvo);
    } catch {
      // Sem armazenamento (aba privada): fica o padrão.
    }
    // Só na montagem: depois disso quem muda o período é a tela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const mudar = (p: Periodo) => {
    setPeriodo(p);
    const qs = p.tipo === "pronto" ? `periodo=${p.valor}` : `de=${p.de}&ate=${p.ate}`;
    try {
      window.localStorage.setItem(CHAVE_DO_PERIODO, qs);
    } catch {
      // idem
    }
    window.history.replaceState(null, "", `${window.location.pathname}?${qs}`);
  };
  return [periodo, mudar];
}

/** As ações que pedem confirmação: mexem com gente de verdade (PRD §34). */
type Confirmacao = { campanha: CampanhaDoResumo; acao: "pausar" | "cancelar" | "iniciar" };

export function ListaDeCampanhas() {
  const t = useT();
  const idioma = useTagDeIdioma();
  const router = useRouter();
  const [periodo, setPeriodo] = usePeriodo();
  const datas = datasDe(periodo);
  const consulta = useMemo(() => {
    const i = instantesDasDatas(datas.de, datas.ate);
    return i ? { de: i.de.toISOString(), ate: i.ate.toISOString() } : null;
  }, [datas.de, datas.ate]);
  const resumo = useResumoDasCampanhas(consulta);
  const acao = useAcaoNaLista();
  const [confirmando, setConfirmando] = useState<Confirmacao | null>(null);
  const [indiceAoVivo, setIndiceAoVivo] = useState(0);

  const dados = resumo.data;
  const enviando = useMemo(
    () =>
      (dados?.campanhas ?? [])
        .filter((c) => c.status === "running")
        .sort((a, b) => Date.parse(b.iniciada_em ?? b.criada_em) - Date.parse(a.iniciada_em ?? a.criada_em)),
    [dados],
  );
  const aoVivo = enviando.length > 0 ? enviando[indiceAoVivo % enviando.length]! : null;
  const naTabela = (dados?.campanhas ?? []).filter((c) => c.id !== aoVivo?.id);
  const media = dados?.resumo.taxa_resposta ?? null;

  const abrir = (id: string) => router.push(`/app/campaigns/${id}`);

  const executar = (c: CampanhaDoResumo, a: AcaoDeCampanha) =>
    acao.mutate(
      { id: c.id, acao: a },
      {
        onSuccess: (r) => {
          if (a === "duplicar") {
            const novo = (r.data as { id?: string } | undefined)?.id;
            toast.success(t("Campanha duplicada como rascunho."));
            if (novo) router.push(`/app/campaigns/${novo}/edit`);
          }
        },
      },
    );

  const noMenu = (c: CampanhaDoResumo, item: ItemDoMenu) => {
    if (item === "relatorio") return abrir(c.id);
    if (item === "editar") return router.push(`/app/campaigns/${c.id}/edit`);
    if (item === "csv") return void exportarCsv(c, t);
    if (item === "pausar" || item === "cancelar" || item === "iniciar") return setConfirmando({ campanha: c, acao: item });
    executar(c, item);
  };

  return (
    <div className="cp sh-sangria" data-testid="lista-de-campanhas">
      <header className="cp-cabecalho">
        <div className="cp-cabecalho-texto">
          <h1 className="cp-titulo">{t("Campanhas")}</h1>
          <p className="cp-subtitulo">{t("Escolha o público, escreva a mensagem e acompanhe quem recebeu.")}</p>
        </div>
        <Link href="/app/campaigns/settings" className="cp-botao">
          <SlidersHorizontal size={15} aria-hidden />
          {t("Configuração")}
        </Link>
        <Link href="/app/campaigns/new" className="cp-botao-primario">
          <Plus size={16} aria-hidden />
          {t("Nova campanha")}
        </Link>
      </header>

      <div className="cp-periodo">
        <div className="cp-periodo-texto">
          <span className="cp-periodo-titulo">{t("Resultados do período")}</span>
          <span className="cp-periodo-sub">
            {textoDoIntervalo(datas.de, datas.ate, idioma)}
            {dados
              ? ` · ${
                  dados.resumo.campanhas_no_periodo === 1
                    ? t("soma de 1 campanha")
                    : t("soma de {n} campanhas").replace("{n}", dados.resumo.campanhas_no_periodo.toLocaleString(idioma))
                }`
              : ""}
          </span>
        </div>
        <SeletorDePeriodo periodo={periodo} onMudar={setPeriodo} idioma={idioma} />
      </div>

      {resumo.isLoading || (!dados && !resumo.isError) ? (
        <Esqueletos />
      ) : resumo.isError || !dados ? (
        <div className="cp-erro" role="alert">
          <TriangleAlert size={16} aria-hidden />
          <span style={{ flex: 1 }}>{t("Erro ao carregar as campanhas.")}</span>
          <button type="button" className="cp-botao" onClick={() => resumo.refetch()}>
            {t("Tentar novamente")}
          </button>
        </div>
      ) : dados.total_na_conta === 0 ? (
        <div className="cp-vazio-conta">
          <Megaphone size={24} aria-hidden color="var(--cp-muted-3)" />
          <h2>{t("Nenhuma campanha ainda")}</h2>
          <p>{t("Escolha uma lista, escreva a mensagem e acompanhe quem recebeu.")}</p>
          <Link href="/app/campaigns/new" className="cp-botao-primario">
            <Plus size={16} aria-hidden />
            {t("Nova campanha")}
          </Link>
        </div>
      ) : (
        <>
          <Kpis resumo={dados.resumo} idioma={idioma} />
          {aoVivo && (
            <AoVivo
              campanha={aoVivo}
              posicao={(indiceAoVivo % enviando.length) + 1}
              total={enviando.length}
              onTrocar={(passo) => setIndiceAoVivo((i) => (i + passo + enviando.length) % enviando.length)}
              onAbrir={() => abrir(aoVivo.id)}
              onPausar={() => setConfirmando({ campanha: aoVivo, acao: "pausar" })}
              idioma={idioma}
            />
          )}
          <TabelaDeCampanhas campanhas={naTabela} media={media} idioma={idioma} onAbrir={abrir} onAcao={noMenu} />
          {dados.parcial && (
            <p className="cp-aviso-parcial">
              {t("Os números deste período são parciais: o volume passou do teto de leitura de uma vez.")}
            </p>
          )}
        </>
      )}

      <AlertDialog open={confirmando !== null} onOpenChange={(aberto) => !aberto && setConfirmando(null)}>
        <AlertDialogContent className="cp-portal cp-confirmar">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmando?.acao === "pausar"
                ? t("Pausar a campanha?")
                : confirmando?.acao === "iniciar"
                  ? t("Iniciar a campanha agora?")
                  : t("Cancelar a campanha?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmando?.acao === "pausar"
                ? t("Ninguém mais recebe até você retomar. Quem já recebeu continua na conversa.")
                : confirmando?.acao === "iniciar"
                  ? t("O envio começa no ritmo da campanha, dentro da janela de horário.")
                  : t(
                      "Cancelar é definitivo: quem ainda não recebeu não recebe mais, e a campanha não volta a rodar.",
                    )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Voltar")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmando) executar(confirmando.campanha, confirmando.acao);
                setConfirmando(null);
              }}
            >
              {t("Confirmar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SeletorDePeriodo({
  periodo,
  onMudar,
  idioma,
}: {
  periodo: Periodo;
  onMudar: (p: Periodo) => void;
  idioma: string;
}) {
  const t = useT();
  const [aberto, setAberto] = useState(false);
  const datas = datasDe(periodo);
  return (
    <div className="cp-segmentado" role="group" aria-label={t("Período")}>
      {PERIODOS_PRONTOS.map((p) => (
        <button
          key={p}
          type="button"
          className="cp-segmento"
          aria-pressed={periodo.tipo === "pronto" && periodo.valor === p}
          onClick={() => onMudar({ tipo: "pronto", valor: p })}
        >
          {t(ROTULO_DO_PERIODO[p])}
        </button>
      ))}
      <span className="cp-divisoria" aria-hidden />
      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger asChild>
          <button type="button" className="cp-segmento" aria-pressed={periodo.tipo === "livre"}>
            <Calendar size={14} aria-hidden />
            {periodo.tipo === "livre" ? textoDoIntervalo(periodo.de, periodo.ate, idioma) : t("Personalizado")}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto border-0 bg-transparent p-0 shadow-none">
          <CalendarioDeIntervalo
            de={datas.de}
            ate={datas.ate}
            ateHoje
            onAplicar={(de, ate) => {
              onMudar({ tipo: "livre", de, ate: ate > diaLocal(new Date()) ? diaLocal(new Date()) : ate });
              setAberto(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function Kpis({
  resumo,
  idioma,
}: {
  resumo: { enviadas: number; entregues: number; lidas: number; responderam: number; campanhas_no_periodo: number; taxa_resposta: number | null };
  idioma: string;
}) {
  const t = useT();
  const n = (x: number) => x.toLocaleString(idioma);
  return (
    <div className="cp-kpis" data-testid="kpis">
      <div className="cp-kpi">
        <span className="cp-kpi-rotulo">
          <i className="cp-quadradinho" style={{ background: "var(--m-sent)" }} />
          {t("Mensagens enviadas")}
        </span>
        <span className="cp-kpi-linha">
          <span className="cp-kpi-valor">{n(resumo.enviadas)}</span>
          <span className="cp-kpi-sub">
            {resumo.campanhas_no_periodo === 1
              ? t("em 1 campanha")
              : t("em {n} campanhas").replace("{n}", n(resumo.campanhas_no_periodo))}
          </span>
        </span>
      </div>
      <div className="cp-kpi">
        <span className="cp-kpi-rotulo">
          <i className="cp-quadradinho" style={{ background: "var(--m-del)" }} />
          {t("Entregues")}
        </span>
        <span className="cp-kpi-linha">
          <span className="cp-kpi-valor">{n(resumo.entregues)}</span>
          <span className="cp-kpi-sub">
            {textoDoPercentual(resumo.entregues, resumo.enviadas)} {t("das enviadas")}
          </span>
        </span>
      </div>
      <div className="cp-kpi">
        <span className="cp-kpi-rotulo">
          <i className="cp-quadradinho" style={{ background: "var(--m-read)" }} />
          {t("Lidas")}
        </span>
        <span className="cp-kpi-linha">
          <span className="cp-kpi-valor">{n(resumo.lidas)}</span>
          <span className="cp-kpi-sub">
            {textoDoPercentual(resumo.lidas, resumo.enviadas)} {t("das enviadas")}
          </span>
        </span>
      </div>
      <div className="cp-kpi-taxa" data-testid="kpi-taxa">
        <div className="cp-kpi-taxa-texto">
          <span className="cp-kpi-taxa-rotulo">
            <MessageCircleReply size={14} aria-hidden />
            {t("Taxa de resposta")}
          </span>
          <span className="cp-kpi-taxa-frase">
            {resumo.enviadas === 0
              ? t("Nenhum envio no período")
              : t("{r} de {e} pessoas responderam")
                  .replace("{r}", n(resumo.responderam))
                  .replace("{e}", n(resumo.enviadas))}
          </span>
        </div>
        <span className="cp-kpi-taxa-valor">{resumo.taxa_resposta === null ? "—" : `${resumo.taxa_resposta}%`}</span>
      </div>
    </div>
  );
}

function AoVivo({
  campanha,
  posicao,
  total,
  onTrocar,
  onAbrir,
  onPausar,
  idioma,
}: {
  campanha: CampanhaDoResumo;
  posicao: number;
  total: number;
  onTrocar: (passo: number) => void;
  onAbrir: () => void;
  onPausar: () => void;
  idioma: string;
}) {
  const t = useT();
  const metricas = useMetricasAoVivo(campanha.id);
  const agora = useAgora(30_000);
  const m = metricas.data?.contagem;
  const enviadas = m?.enviados ?? campanha.contagem.enviadas;
  const entregues = m?.entregues ?? campanha.contagem.entregues;
  const lidas = m?.lidos ?? campanha.contagem.lidas;
  const responderam = m?.responderam ?? campanha.contagem.responderam;
  const lista = campanha.lista.total || m?.elegiveis || 0;
  const restantes = m ? m.pendentes + m.naFila + m.enviando : campanha.contagem.restantes;
  const progresso = Math.min(100, percentual(enviadas, lista) ?? 0);

  const r = campanha.ritmo;
  const fuso = fusoValido(r.fuso) ? r.fuso : fusoDoNavegador();
  const fim = previsaoDoFim({
    agora,
    restantes,
    cadenciaSegundos: r.cadencia_segundos,
    janela:
      r.janela_inicio_minuto !== null && r.janela_fim_minuto !== null
        ? { inicio: r.janela_inicio_minuto, fim: r.janela_fim_minuto }
        : null,
    fuso,
    proximoEnvio: campanha.proximo_envio_em ? new Date(campanha.proximo_envio_em) : null,
    tetoDiario: r.teto_diario,
  });
  const hora = fim?.toLocaleTimeString(idioma, { hour: "2-digit", minute: "2-digit", timeZone: fuso });
  const mesmoDia = fim ? fim.toLocaleDateString(idioma, { timeZone: fuso }) === agora.toLocaleDateString(idioma, { timeZone: fuso }) : false;
  const previsao = !fim
    ? ""
    : mesmoDia
      ? t("termina por volta de {h}").replace("{h}", hora ?? "")
      : t("termina por volta de {h}").replace(
          "{h}",
          `${fim.toLocaleDateString(idioma, { day: "2-digit", month: "2-digit", timeZone: fuso })}, ${hora ?? ""}`,
        );
  const IconeDoTipo = ICONE_DO_TIPO[campanha.tipo];

  const tile = (rotulo: string, cor: string, valor: number, pct: string) => (
    <div className="cp-tile">
      <span className="cp-tile-rotulo" style={{ color: cor }}>
        {rotulo}
      </span>
      <span className="cp-tile-linha">
        <span className="cp-tile-valor">{valor.toLocaleString(idioma)}</span>
        <span className="cp-tile-pct">{pct}</span>
      </span>
    </div>
  );

  return (
    <section
      className="cp-aovivo"
      data-testid="enviando-agora"
      aria-label={t("Enviando agora")}
      onClick={onAbrir}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) onAbrir();
      }}
      tabIndex={0}
    >
      <div
        className="cp-anel"
        style={{ background: `conic-gradient(#3d72ff 0 ${progresso}%, #1d2440 ${progresso}% 100%)` }}
        role="progressbar"
        aria-valuenow={progresso}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t("Progresso do envio")}
      >
        <div className="cp-anel-miolo">
          <span className="cp-anel-valor">{`${progresso}%`}</span>
          <span className="cp-anel-rotulo">{t("enviado")}</span>
        </div>
      </div>

      <div className="cp-aovivo-texto">
        <div className="cp-aovivo-linha1">
          <span className="cp-chip-aovivo">
            <i className="cp-ponto-aovivo" aria-hidden />
            {t("Enviando agora")}
          </span>
          {previsao && <span className="cp-previsao">{previsao}</span>}
        </div>
        <span className="cp-aovivo-nome" title={campanha.nome}>
          {campanha.nome}
        </span>
        <div className="cp-aovivo-linha3">
          <span>
            <IconeDoTipo size={13} aria-hidden />
            <span className="cp-reticencias">
              {t(ROTULO_DO_TIPO[campanha.tipo])}: {campanha.conteudo ?? "—"}
            </span>
          </span>
          <span>
            <List size={13} aria-hidden />
            <span className="cp-reticencias">
              {nomeDaLista(campanha, t)} · {lista.toLocaleString(idioma)}
            </span>
          </span>
        </div>
      </div>

      <div className="cp-aovivo-metricas">
        {tile(t("Enviadas"), "var(--m-sent)", enviadas, textoDoPercentual(enviadas, lista))}
        {tile(t("Entregues"), "var(--m-del)", entregues, textoDoPercentual(entregues, enviadas))}
        {campanha.leitura_disponivel
          ? tile(t("Lidas"), "var(--m-read)", lidas, textoDoPercentual(lidas, enviadas))
          : null}
      </div>

      <div className="cp-selo">
        <span className="cp-selo-valor">{textoDoPercentual(responderam, enviadas)}</span>
        <span className="cp-selo-texto">
          <b>{t("responderam")}</b>
          <span>
            {responderam === 1 ? t("1 pessoa") : t("{n} pessoas").replace("{n}", responderam.toLocaleString(idioma))}
          </span>
        </span>
      </div>

      <button
        type="button"
        className="cp-botao-pausar"
        onClick={(e) => {
          e.stopPropagation();
          onPausar();
        }}
      >
        <Pause size={14} aria-hidden />
        {t("Pausar")}
      </button>

      {total > 1 && (
        <span className="cp-setas" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="cp-seta" aria-label={t("Campanha anterior")} onClick={() => onTrocar(-1)}>
            <ChevronLeft size={15} aria-hidden />
          </button>
          {t("{a} de {n}").replace("{a}", String(posicao)).replace("{n}", String(total))}
          <button type="button" className="cp-seta" aria-label={t("Próxima campanha")} onClick={() => onTrocar(1)}>
            <ChevronRight size={15} aria-hidden />
          </button>
        </span>
      )}
    </section>
  );
}

function Esqueletos() {
  return (
    <>
      <div className="cp-kpis" aria-busy>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="cp-esqueleto" style={{ height: 88 }} />
        ))}
      </div>
      <div className="cp-esqueleto" style={{ height: 132, borderRadius: 18 }} />
      <div className="cp-tabela">
        {[0, 1, 2].map((i) => (
          <div key={i} className="cp-esqueleto" style={{ height: 76, borderRadius: 0, borderBottom: "1px solid #18181b" }} />
        ))}
      </div>
    </>
  );
}

/** "Exportar CSV": os destinatários da campanha (até 5.000), pela mesma rota da tela de detalhe. */
async function exportarCsv(c: CampanhaDoResumo, t: (s: string) => string) {
  const linhas: Destinatario[] = [];
  let cursor: string | undefined;
  try {
    for (let i = 0; i < 50; i += 1) {
      const qs = new URLSearchParams({ limit: "100" });
      if (cursor) qs.set("cursor", cursor);
      const r = await apiClient.get<{ data: Destinatario[]; meta?: { cursor?: string; has_more?: boolean } }>(
        `/api/v1/campaigns/${c.id}/recipients?${qs.toString()}`,
      );
      linhas.push(...r.data);
      if (!r.meta?.has_more || !r.meta.cursor) break;
      cursor = r.meta.cursor;
    }
  } catch {
    toast.error(t("Não foi possível exportar os destinatários."));
    return;
  }
  const campo = (v: string | null | undefined) => `"${(v ?? "").replace(/"/g, '""')}"`;
  const cabecalho = ["contato", "situacao", "enviada_em", "entregue_em", "lida_em", "respondeu_em", "motivo"];
  const corpo = linhas.map((l) =>
    [
      l.contacts ? rotuloDoContato(l.contacts) : l.contact_id,
      l.status,
      l.sent_at,
      l.delivered_at,
      l.read_at,
      l.replied_at,
      l.motivo_da_falha ?? l.legenda_da_exclusao,
    ]
      .map(campo)
      .join(","),
  );
  const blob = new Blob([`﻿${[cabecalho.join(","), ...corpo].join("\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${c.nome.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 60) || "campanha"}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
