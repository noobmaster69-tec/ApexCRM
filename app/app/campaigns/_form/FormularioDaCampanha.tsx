"use client";
/**
 * O ASSISTENTE de campanha — o MESMO para criar e editar (fork jhoow;
 * redesenho de nov/2026, tema Ônix + Azul).
 *
 * Cinco passos (Informações → Público → Mensagem → Funil → Ritmo) sobre UM
 * estado só, que o título do cabeçalho, os passos e o resumo da lateral leem.
 * O passo atual mora na URL (`?passo=3`). O rascunho se salva sozinho 800 ms
 * depois da última mudança — a primeira gravação CRIA a campanha (POST), as
 * seguintes a editam (PATCH) — com o que já passa na validação do servidor
 * (`corpoDoRascunho`). "Salvar rascunho" confere os cinco passos e grava o
 * corpo inteiro, o mesmo de sempre (`corpoDaCampanha`).
 *
 * Preparar, testar e iniciar continuam sendo ações da tela de detalhe; daqui
 * só sai "Preparar lista", quando os cinco passos estão prontos.
 */
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleDot,
  Cloud,
  CloudCheck,
  Info,
  ListChecks,
  LoaderCircle,
  MessageSquareText,
  Pencil,
  SquareKanban,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";

import { TEXTO_DO_ERRO_DO_RITMO, useAgora } from "@/components/campanhas/CamposDeRitmo";
import { diaEMes } from "@/components/campanhas/CalendarioDeIntervalo";
import { showApiError } from "@/components/feedback/ApiErrorToast";
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
import { useModelosDaCampanha, type PreviaDaAudiencia } from "@/hooks/campanhas/useCampanhas";
import { useEtapas } from "@/hooks/campanhas/useDestinoDaCampanha";
import { channelLabel, useChannelSessions } from "@/hooks/channels/useChannelSessions";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { useListaRemota } from "@/app/app/fluxos/_blocos/useListaRemota";
import { apiClient } from "@/lib/api/client";
import { horarioDosMinutos } from "@/lib/campanhas/agendamento";
import { fusoValido } from "@/lib/campanhas/fuso";
import { fusoDoNavegador } from "@/lib/campanhas/previsao";

import { variaveisIncompletas } from "../_components/ModeloDaCampanha";
import { contaDoEnvio } from "./calculos";
import { alvoDoCampo, type MudarValores } from "./contexto";
import { PassoFunil, etapasAbertas } from "./PassoFunil";
import { PassoInformacoes } from "./PassoInformacoes";
import { PassoMensagem, type FluxoDaLista } from "./PassoMensagem";
import { PassoPublico, QuemVaiReceber } from "./PassoPublico";
import { PassoRitmo, ResumoDoEnvio } from "./PassoRitmo";
import {
  corpoDoRascunho,
  errosDoPasso,
  PASSOS,
  TEXTO_DO_ERRO,
  TITULO_DO_PASSO,
  variaveisDoTexto,
  type CampoComErro,
  type Passo,
} from "./passos";
import { corpoDaCampanha, filtroDoFormulario, listar, temCriterio, type ValoresDaCampanha } from "./valores";

import "../_estilo/assistente.css";

const ICONE_DO_PASSO: Record<Passo, LucideIcon> = {
  1: Info,
  2: Users,
  3: MessageSquareText,
  4: SquareKanban,
  5: CalendarClock,
};

const ESPERA_DO_SALVAMENTO_MS = 800;
const ESPERA_DA_PREVIA_MS = 500;

type EstadoDoSalvamento =
  | { tipo: "nada" }
  | { tipo: "pendente" }
  | { tipo: "salvando" }
  | { tipo: "salvo"; em: number }
  | { tipo: "erro" };

function passoDaUrl(bruto: string | null): Passo {
  const n = Number(bruto);
  return (PASSOS as readonly number[]).includes(n) ? (n as Passo) : 1;
}

/** Tela estreita (abaixo de 1024 px): o resumo sai da lateral e vai para o fim do passo. */
const ESTREITA = "(max-width: 1023.98px)";
const consultaEstreita = () => (typeof window !== "undefined" ? window.matchMedia?.(ESTREITA) : undefined);
function assinarEstreita(avisar: () => void) {
  const mq = consultaEstreita();
  mq?.addEventListener("change", avisar);
  return () => mq?.removeEventListener("change", avisar);
}
function useTelaEstreita(): boolean {
  return useSyncExternalStore(assinarEstreita, () => consultaEstreita()?.matches ?? false, () => false);
}

/** O valor, só depois de `ms` sem mudar. */
function useAdiado<T>(valor: T, ms: number): T {
  const [adiado, setAdiado] = useState(valor);
  useEffect(() => {
    const id = setTimeout(() => setAdiado(valor), ms);
    return () => clearTimeout(id);
  }, [valor, ms]);
  return adiado;
}

export function FormularioDaCampanha({
  campanhaId = null,
  inicial,
}: {
  /** A campanha em edição; ausente = campanha nova (o primeiro salvamento a cria). */
  campanhaId?: string | null;
  inicial: ValoresDaCampanha;
}) {
  const t = useT();
  const idioma = useTagDeIdioma();
  const router = useRouter();
  const qc = useQueryClient();
  const busca = useSearchParams();
  const agora = useAgora(30_000);
  const editando = campanhaId !== null;

  const [v, setV] = useState<ValoresDaCampanha>(inicial);
  const mudar: MudarValores = useCallback((f) => setV(f), []);
  const [passo, setPasso] = useState<Passo>(() => passoDaUrl(busca.get("passo")));
  // Os passos já conferidos ("Continuar"/"Salvar") mostram os erros. Editar já
  // abre com os cinco conferidos: a campanha existe, e o que falta deve aparecer.
  const [conferidos, setConferidos] = useState<ReadonlySet<Passo>>(() => new Set<Passo>(editando ? PASSOS : []));
  const [resumoAberto, setResumoAberto] = useState(true);
  const [saindo, setSaindo] = useState(false);
  const [finalizando, setFinalizando] = useState<null | "salvar" | "preparar">(null);
  const conteudo = useRef<HTMLDivElement>(null);
  const estreita = useTelaEstreita();

  // ── O número e o que ele aceita ─────────────────────────────────────────
  const canais = useChannelSessions();
  const listaDeCanais = canais.data ?? [];
  const canal = listaDeCanais.find((c) => c.id === v.canal) ?? null;
  const doCanal = useModelosDaCampanha(v.canal);
  const ehOficial = doCanal.data?.modo === "template";
  const comModelo = ehOficial && v.modo === "text";
  const modeloEscolhido =
    v.modelo && doCanal.data
      ? (doCanal.data.modelos.find((m) => m.name === v.modelo!.name && m.language === v.modelo!.language) ?? null)
      : null;
  const modeloPronto =
    v.modelo !== null && modeloEscolhido !== null && variaveisIncompletas(modeloEscolhido, v.modelo.variables).length === 0;
  const contexto = { ehOficial: comModelo, modeloPronto };
  // Enquanto não se sabe o que o número aceita, o corpo não é confiável
  // (sairia como texto livre num número oficial): o salvamento espera.
  const canalConhecido = !v.canal || doCanal.isSuccess || doCanal.isError;

  const { itens: fluxos } = useListaRemota<FluxoDaLista>("/api/v1/ai/followup-flows?surface=fluxo");

  // ── Erros e prontidão de cada passo ─────────────────────────────────────
  const erros = Object.fromEntries(PASSOS.map((p) => [p, errosDoPasso(p, v, contexto, agora)])) as Record<
    Passo,
    ReturnType<typeof errosDoPasso>
  >;
  const pronto = (p: Passo) => erros[p].length === 0;
  const prontos = PASSOS.filter(pronto).length;
  const erro = (campo: CampoComErro): string | undefined => {
    for (const p of PASSOS) {
      if (!conferidos.has(p)) continue;
      const e = erros[p].find((x) => x.campo === campo);
      if (e) return e.ritmo ? t(TEXTO_DO_ERRO_DO_RITMO[e.ritmo]) : t(TEXTO_DO_ERRO[e.campo]);
    }
    return undefined;
  };

  // ── A prévia do público (conta sozinha, 500 ms depois da última mudança) ──
  const limite = Number(v.limite);
  const limiteValido = Number.isInteger(limite) && limite >= 1 && limite <= 5000;
  const semCriterio = v.fonte === "importacao" ? !v.listaImportada : !temCriterio(v);
  const pedidoDaPrevia =
    !semCriterio && limiteValido
      ? JSON.stringify({
          audience_filter: filtroDoFormulario(v),
          message_body: v.modo === "flow" || comModelo ? "" : v.texto,
          base_legal: v.baseLegal,
          ...(comModelo && v.modelo
            ? {
                modelo: {
                  channel_session_id: v.canal,
                  name: v.modelo.name,
                  language: v.modelo.language,
                  variables: v.modelo.variables,
                },
              }
            : {}),
        })
      : null;
  const previaAdiada = useAdiado(pedidoDaPrevia, ESPERA_DA_PREVIA_MS);
  const previa = useQuery({
    queryKey: ["campanha-previa", previaAdiada],
    enabled: previaAdiada !== null,
    queryFn: async () =>
      (await apiClient.post<{ data: PreviaDaAudiencia }>("/api/v1/campaigns/preview", JSON.parse(previaAdiada!))).data,
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: 30_000,
  });
  const dadosDaPrevia = pedidoDaPrevia === null ? undefined : previa.data;
  const calculando = pedidoDaPrevia !== null && (pedidoDaPrevia !== previaAdiada || previa.isFetching);
  const quantos = dadosDaPrevia ? Math.min(dadosDaPrevia.elegiveis, limiteValido ? limite : Infinity) : null;
  const variaveisDaMensagem = v.modo === "text" && !comModelo ? variaveisDoTexto(v.texto) : [];
  const avisoDaContagem = semCriterio
    ? v.fonte === "importacao"
      ? t("Suba uma planilha ou escolha uma lista salva para contar.")
      : t("Escolha pelo menos um critério para contar.")
    : !limiteValido
      ? t(TEXTO_DO_ERRO.limite)
      : previa.isError && !previa.data
        ? t("Não deu para contar agora. Mude um filtro para tentar de novo.")
        : null;

  // ── Salvamento automático ───────────────────────────────────────────────
  const id = useRef<string | null>(campanhaId);
  const passoAtual = useRef(passo);
  useEffect(() => {
    passoAtual.current = passo;
  }, [passo]);
  const rascunho = JSON.stringify(corpoDoRascunho(v, contexto, agora));
  const desejado = useRef(rascunho);
  const salvo = useRef<string | undefined>(undefined);
  const fila = useRef<Promise<unknown>>(Promise.resolve());
  const [salvamento, setSalvamento] = useState<EstadoDoSalvamento>({ tipo: "nada" });

  const enfileirar = useCallback(<T,>(tarefa: () => Promise<T>): Promise<T> => {
    const p = fila.current.then(tarefa);
    fila.current = p.catch(() => undefined);
    return p;
  }, []);

  /** POST na primeira vez (cria a campanha), PATCH depois. */
  const persistir = useCallback(async (corpo: Record<string, unknown>) => {
    if (!id.current) {
      const criada = await apiClient.post<{ data: { id: string } }>("/api/v1/campaigns", corpo);
      id.current = criada.data.id;
      // A tela vira a de editar sem remontar: recarregar volta ao mesmo passo.
      window.history.replaceState(null, "", `/app/campaigns/${criada.data.id}/edit?passo=${passoAtual.current}`);
    } else {
      await apiClient.patch(`/api/v1/campaigns/${id.current}`, corpo);
    }
  }, []);

  const gravarRascunho = useCallback(
    () =>
      enfileirar(async () => {
        const alvo = desejado.current;
        if (alvo === salvo.current || alvo === "null") return true;
        setSalvamento({ tipo: "salvando" });
        try {
          await persistir(JSON.parse(alvo) as Record<string, unknown>);
          salvo.current = alvo;
          setSalvamento(desejado.current === alvo ? { tipo: "salvo", em: Date.now() } : { tipo: "pendente" });
          return true;
        } catch {
          setSalvamento({ tipo: "erro" });
          return false;
        }
      }),
    [enfileirar, persistir],
  );

  useEffect(() => {
    if (!canalConhecido) return;
    // A primeira leitura é a referência: editar não regrava o que acabou de carregar.
    if (salvo.current === undefined) {
      salvo.current = editando ? rascunho : "null";
      desejado.current = rascunho;
      return;
    }
    desejado.current = rascunho;
    if (rascunho === salvo.current || rascunho === "null") return;
    setSalvamento({ tipo: "pendente" });
    const espera = setTimeout(() => void gravarRascunho(), ESPERA_DO_SALVAMENTO_MS);
    return () => clearTimeout(espera);
  }, [rascunho, canalConhecido, editando, gravarRascunho]);

  const pendente =
    salvamento.tipo === "pendente" || salvamento.tipo === "salvando" || salvamento.tipo === "erro";

  useEffect(() => {
    if (!pendente) return;
    const avisar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [pendente]);

  // ── Navegação entre passos ──────────────────────────────────────────────
  const irPara = (p: Passo) => {
    setPasso(p);
    const url = new URL(window.location.href);
    url.searchParams.set("passo", String(p));
    window.history.replaceState(null, "", `${url.pathname}?${url.searchParams.toString()}`);
  };
  useEffect(() => {
    if (conteudo.current) conteudo.current.scrollTop = 0;
  }, [passo]);

  const focar = (campo: CampoComErro) => {
    // Depois do render: o campo pode ter acabado de aparecer.
    requestAnimationFrame(() => {
      const alvo = alvoDoCampo(campo);
      if (!alvo) return;
      const calmo = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      alvo.scrollIntoView?.({ block: "center", behavior: calmo ? "auto" : "smooth" });
      alvo.focus({ preventScroll: true });
    });
  };

  const continuar = () => {
    setConferidos((c) => new Set([...c, passo]));
    const primeiro = erros[passo][0];
    if (primeiro) {
      focar(primeiro.campo);
      return;
    }
    if (passo < 5) irPara((passo + 1) as Passo);
  };

  /** Confere os cinco passos; com erro, vai ao primeiro. */
  const conferirTudo = (): boolean => {
    setConferidos(new Set(PASSOS));
    const comErro = PASSOS.find((p) => !pronto(p));
    if (comErro === undefined) return true;
    irPara(comErro);
    const primeiro = erros[comErro][0];
    if (primeiro) focar(primeiro.campo);
    return false;
  };

  const finalizar = async (preparar: boolean) => {
    if (finalizando || !conferirTudo()) return;
    setFinalizando(preparar ? "preparar" : "salvar");
    try {
      await enfileirar(async () => {
        await persistir(corpoDaCampanha(v, contexto));
        salvo.current = desejado.current;
      });
      setSalvamento({ tipo: "salvo", em: Date.now() });
      const alvo = id.current!;
      if (preparar) {
        try {
          await apiClient.post(`/api/v1/campaigns/${alvo}/preparar`, {});
        } catch (err) {
          showApiError(err);
        }
      }
      void qc.invalidateQueries({ queryKey: ["campanhas"] });
      void qc.invalidateQueries({ queryKey: ["campanhas-resumo"] });
      void qc.invalidateQueries({ queryKey: ["campanha", alvo] });
      router.push(`/app/campaigns/${alvo}`);
    } catch (err) {
      showApiError(err);
      setFinalizando(null);
    }
  };

  const sair = () => {
    if (pendente) setSaindo(true);
    else router.push("/app/campaigns");
  };

  const teclar = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.defaultPrevented) return;
    const alvo = e.target as HTMLElement;
    if (e.key === "Escape") {
      if (alvo !== document.body && alvo.closest(".cw-conteudo, .cw-cabecalho")) alvo.blur();
      return;
    }
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    if (alvo.tagName !== "INPUT" || alvo.closest(".cw-busca, .cw-painel-tags, .cw-legado, .cw-cabecalho")) return;
    if ((alvo as HTMLInputElement).type === "date" || (alvo as HTMLInputElement).type === "file") return;
    e.preventDefault();
    if (passo < 5) continuar();
    else void finalizar(false);
  };

  // ── As frases do resumo ─────────────────────────────────────────────────
  const etapasRecebe = etapasAbertas(useEtapas(v.funilDeQuemRecebe || null).data);
  const etapasResponde = etapasAbertas(useEtapas(v.funil || null).data);
  const fusoDaConta = v.fuso && fusoValido(v.fuso) ? v.fuso : fusoDoNavegador();
  const totalDoEnvio = quantos ?? (limiteValido ? limite : 0);
  const conta = contaDoEnvio(v, totalDoEnvio, agora, fusoDaConta);
  const n = (x: number) => x.toLocaleString(idioma);

  const frase = (p: Passo): string => {
    if (!pronto(p)) return t("A fazer");
    if (p === 1) {
      return t('"{nome}" pelo {numero}, com {base}.')
        .replace("{nome}", v.nome.trim())
        .replace("{numero}", canal ? channelLabel(canal, t) : "—")
        .replace("{base}", v.baseLegal === "consent" ? t("consentimento") : t("interesse legítimo"));
    }
    if (p === 2) {
      const qtd = quantos === null ? "—" : n(quantos);
      const base =
        v.fonte === "crm"
          ? t("{n} contatos do CRM")
          : v.fonte === "etiqueta"
            ? t("{n} contatos por etiqueta")
            : t("{n} contatos da lista importada");
      const com = v.fonte === "importacao" ? 0 : listar(v.comAlgumaTag).length;
      const sem = v.fonte === "importacao" ? 0 : listar(v.semTags).length;
      const partes = [
        com > 0 ? t("com {x} etiquetas").replace("{x}", String(com)) : null,
        sem > 0 ? t("sem {y}").replace("{y}", String(sem)) : null,
      ].filter(Boolean);
      return `${base.replace("{n}", qtd)}${partes.length ? `, ${partes.join(` ${t("e")} `)}` : ""}.`;
    }
    if (p === 3) {
      if (v.modo === "flow") {
        const f = fluxos.find((x) => x.id === v.fluxo);
        return t("Inicia o fluxo {nome}.").replace("{nome}", f?.name ?? "—");
      }
      if (comModelo) return t("Modelo aprovado {nome}.").replace("{nome}", v.modelo?.name ?? "—");
      const k = String(variaveisDaMensagem.length);
      return v.idioma.trim()
        ? t("Texto simples com {k} variáveis, em {idioma}.").replace("{k}", k).replace("{idioma}", v.idioma.trim())
        : t("Texto simples com {k} variáveis.").replace("{k}", k);
    }
    if (p === 4) {
      const mover = v.moverNoFunil !== false;
      const nomeDaEtapa = (etapas: typeof etapasRecebe, etapa: string) =>
        (etapa ? etapas.find((e) => e.id === etapa)?.name : etapas[0]?.name) ?? "—";
      const partes = [
        mover && v.funilDeQuemRecebe
          ? t("Recebe: {etapa}.").replace("{etapa}", nomeDaEtapa(etapasRecebe, v.etapaDeQuemRecebe))
          : null,
        mover && v.funil ? t("Responde: {etapa}.").replace("{etapa}", nomeDaEtapa(etapasResponde, v.etapa)) : null,
      ].filter(Boolean);
      return partes.length ? partes.join(" ") : t("Sem mudança no funil");
    }
    return conta
      ? t("{n} por dia, {de}–{ate}, termina em {fim}.")
          .replace("{n}", n(conta.porDia))
          .replace("{de}", horarioDosMinutos(conta.janela.inicio))
          .replace("{ate}", horarioDosMinutos(conta.janela.fim))
          .replace("{fim}", diaEMes(conta.fim, idioma))
      : t("Falta definir quantos contatos por dia.");
  };

  const resumo = (
    <aside className="cw-resumo" aria-label={t("Resumo")}>
      <button type="button" className="cw-resumo-topo" aria-expanded={resumoAberto} onClick={() => setResumoAberto((x) => !x)}>
        <span className="cw-resumo-rotulo">{t("Resumo")}</span>
        <span className="cw-resumo-conta">{t("{n} de 5 prontos").replace("{n}", String(prontos))}</span>
      </button>
      <div className="cw-trilho" aria-hidden>
        <i style={{ width: `${(prontos / 5) * 100}%` }} />
      </div>
      {resumoAberto &&
        PASSOS.map((p) => {
          const atual = p === passo;
          const ok = pronto(p);
          const Icone = atual ? CircleDot : ok ? CircleCheck : CircleDashed;
          return (
            <button
              key={p}
              type="button"
              className="cw-resumo-linha"
              data-pendente={!ok || undefined}
              onClick={() => irPara(p)}
            >
              <Icone size={16} color={atual ? "#93b0ff" : ok ? "#3ecf8e" : "#5a5a62"} aria-hidden />
              <span style={{ minWidth: 0 }}>
                <span className="cw-resumo-titulo">{t(TITULO_DO_PASSO[p])}</span>
                <span className="cw-resumo-frase" style={{ display: "block" }}>
                  {frase(p)}
                </span>
              </span>
            </button>
          );
        })}
    </aside>
  );

  const salvoHa = salvamento.tipo === "salvo" ? Math.floor((agora.getTime() - salvamento.em) / 60_000) : 0;
  const chip =
    salvamento.tipo === "salvando" || salvamento.tipo === "pendente" ? (
      <span className="cw-chip-salvo" role="status">
        <LoaderCircle size={14} className="cw-girando" aria-hidden />
        {t("Salvando…")}
      </span>
    ) : salvamento.tipo === "erro" ? (
      <button type="button" className="cw-chip-salvo" data-erro onClick={() => void gravarRascunho()} role="status">
        <CircleAlert size={14} aria-hidden />
        {t("Erro ao salvar · tentar de novo")}
      </button>
    ) : salvamento.tipo === "salvo" ? (
      <span className="cw-chip-salvo" role="status">
        <CloudCheck size={14} aria-hidden />
        {salvoHa < 1
          ? t("Rascunho salvo agora")
          : salvoHa < 60
            ? t("Salvo há {n} min").replace("{n}", String(salvoHa))
            : t("Salvo há {n} h").replace("{n}", String(Math.floor(salvoHa / 60)))}
      </span>
    ) : (
      <span className="cw-chip-salvo" role="status">
        {editando ? <CloudCheck size={14} aria-hidden /> : <Cloud size={14} aria-hidden />}
        {editando ? t("Rascunho salvo") : t("Salva sozinho ao dar nome e escolher o número")}
      </span>
    );

  return (
    <div className="cw sh-tela-cheia" onKeyDown={teclar} data-testid="assistente-de-campanha">
      <div className="cw-wrap">
        <header className="cw-cabecalho">
          <div className="cw-cabecalho-texto">
            <nav className="cw-trilha" aria-label={t("Você está em")}>
              <button type="button" onClick={sair}>
                <ArrowLeft size={14} aria-hidden />
                {t("Campanhas")}
              </button>
              <span className="cw-trilha-barra" aria-hidden>
                /
              </span>
              <span>{editando ? t("Editar campanha") : t("Nova campanha")}</span>
            </nav>
            <div className="cw-titulo-linha">
              <input
                className="cw-titulo"
                value={v.nome}
                maxLength={200}
                onChange={(e) => setV((a) => ({ ...a, nome: e.target.value }))}
                placeholder={t("Nova campanha")}
                aria-label={t("Nome da campanha")}
                data-testid="titulo-da-campanha"
              />
              <Pencil size={16} color="#6b6b73" aria-hidden style={{ flexShrink: 0 }} />
            </div>
          </div>
          {chip}
          <button type="button" className="cw-botao cw-botao-cancelar" onClick={sair}>
            {t("Cancelar")}
          </button>
        </header>

        <div className="cw-corpo">
          <div className="cw-esquerda">
            <nav className="cw-tempo" aria-label={t("Passos")}>
              {PASSOS.map((p) => {
                const atual = p === passo;
                const ok = pronto(p);
                const comErro = !atual && !ok && conferidos.has(p);
                const Icone = comErro ? CircleAlert : ok && !atual ? Check : ICONE_DO_PASSO[p];
                return (
                  <button
                    key={p}
                    type="button"
                    className="cw-tempo-item"
                    data-estado={atual ? "atual" : ok ? "pronto" : "pendente"}
                    data-erro={comErro || undefined}
                    aria-current={atual ? "step" : undefined}
                    onClick={() => irPara(p)}
                    data-testid={`passo-${p}`}
                  >
                    <span className="cw-marcador-col">
                      <span className="cw-marcador">
                        <Icone size={16} aria-hidden />
                      </span>
                      {p < 5 && <span className="cw-traco" aria-hidden />}
                    </span>
                    <span className="cw-tempo-texto">
                      <span className="cw-tempo-titulo">{t(TITULO_DO_PASSO[p])}</span>
                      <span className="cw-tempo-estado">
                        {atual
                          ? t("Editando agora")
                          : ok
                            ? t("Pronto")
                            : t("Passo {n}").replace("{n}", String(p))}
                      </span>
                    </span>
                  </button>
                );
              })}
            </nav>
            {!estreita && resumo}
          </div>

          <div className="cw-direita">
            <div className="cw-conteudo" ref={conteudo}>
              <div className="cw-entrada" key={passo}>
                {passo === 1 && (
                  <PassoInformacoes v={v} setV={mudar} erro={erro} canais={listaDeCanais} comModelo={comModelo} />
                )}
                {passo === 2 && (
                  <>
                    <PassoPublico v={v} setV={mudar} erro={erro} />
                    <QuemVaiReceber
                      previa={dadosDaPrevia}
                      calculando={calculando}
                      aviso={avisoDaContagem}
                      limite={limiteValido ? limite : 0}
                      variavel={variaveisDaMensagem.length === 1 ? variaveisDaMensagem[0]! : null}
                    />
                  </>
                )}
                {passo === 3 && (
                  <PassoMensagem
                    v={v}
                    setV={mudar}
                    erro={erro}
                    comModelo={comModelo}
                    canalProvider={canal?.provider ?? null}
                    fluxos={fluxos}
                  />
                )}
                {passo === 4 && <PassoFunil v={v} setV={mudar} erro={erro} />}
                {passo === 5 && (
                  <>
                    <PassoRitmo
                      v={v}
                      setV={mudar}
                      erro={erro}
                      agora={agora}
                      fusoDaConta={fusoDaConta}
                      limiteDoNumero={canal?.daily_message_limit ?? 0}
                      mostrarVelocidade={!!v.canal && v.modo === "text"}
                      comModelo={comModelo}
                    />
                    <ResumoDoEnvio v={v} total={totalDoEnvio} agora={agora} fuso={fusoDaConta} />
                  </>
                )}
                {estreita && <div className="cw-resumo-no-fim">{resumo}</div>}
              </div>
            </div>

            <div className="cw-acoes">
              <span className="cw-acoes-passo">{t("Passo {n} de 5").replace("{n}", String(passo))}</span>
              {passo > 1 && (
                <button type="button" className="cw-botao" onClick={() => irPara((passo - 1) as Passo)}>
                  <ArrowLeft size={15} aria-hidden />
                  {t("Voltar")}
                </button>
              )}
              {passo < 5 ? (
                <button type="button" className="cw-primario" onClick={continuar} data-testid="continuar">
                  {t("Continuar")}
                  <ArrowRight size={15} aria-hidden />
                </button>
              ) : (
                <>
                  {prontos === 5 && (
                    <button
                      type="button"
                      className="cw-botao"
                      disabled={finalizando !== null}
                      onClick={() => void finalizar(true)}
                      data-testid="preparar-lista"
                    >
                      {finalizando === "preparar" ? (
                        <LoaderCircle size={15} className="cw-girando" aria-hidden />
                      ) : (
                        <ListChecks size={15} aria-hidden />
                      )}
                      {t("Preparar lista")}
                    </button>
                  )}
                  <button
                    type="button"
                    className="cw-primario"
                    disabled={finalizando !== null}
                    onClick={() => void finalizar(false)}
                    data-testid="salvar-campanha"
                  >
                    {finalizando === "salvar" ? t("Salvando…") : t("Salvar rascunho")}
                    {finalizando === "salvar" ? (
                      <LoaderCircle size={15} className="cw-girando" aria-hidden />
                    ) : (
                      <Check size={15} aria-hidden />
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <AlertDialog open={saindo} onOpenChange={setSaindo}>
        <AlertDialogContent className="cw-portal cw-confirmar">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Sair sem terminar de salvar?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {salvamento.tipo === "erro"
                ? t("A última alteração não foi salva. Se sair agora, ela se perde.")
                : t("Ainda estou salvando a última alteração. Se sair agora, ela pode se perder.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Ficar")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => router.push("/app/campaigns")}>{t("Sair mesmo assim")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
