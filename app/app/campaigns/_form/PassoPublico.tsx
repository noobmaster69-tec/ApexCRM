"use client";
/**
 * PASSO 2 — PÚBLICO: de onde vem quem recebe (CRM, etiqueta ou lista
 * importada), os filtros de cada origem, o máximo de contatos e, abaixo da
 * seção, o card "Quem vai receber" — que conta sozinho a cada mudança.
 *
 * As etiquetas continuam gravadas como antes (texto separado por vírgula em
 * `comAlgumaTag`/`semTags`); só a forma de escolher mudou.
 */
import {
  CalendarRange,
  Check,
  ChevronDown,
  ChevronUp,
  GitCommitHorizontal,
  Plus,
  Search,
  SquareKanban,
  Tag,
  Upload,
  Users,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ListaSalvaOuNova } from "@/components/campanhas/FonteDoPublico";
import { ImportarLista } from "@/components/campanhas/ImportarLista";
import { CalendarioDeIntervalo } from "@/components/campanhas/CalendarioDeIntervalo";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { PreviaDaAudiencia } from "@/hooks/campanhas/useCampanhas";
import { useCrms, useEtapas, useFunis, useVariaveisDaOrganizacao } from "@/hooks/campanhas/useDestinoDaCampanha";
import { useEtiquetasDaConta } from "@/hooks/fluxos/useEtiquetasDaConta";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { TEXTO_DA_EXCLUSAO, type MotivoDeExclusao } from "@/lib/campanhas/tipos";
import { chaveDeBusca, contemEtiqueta, filtrarEtiquetas } from "@/lib/tags/busca-de-etiqueta";

import { CartaoDeOpcao, Campo, ErroDoCampo, GrupoDeOpcoes, SelectComIcone, Secao, Stepper } from "./base";
import { mudarCampo, type PropsDoPasso } from "./contexto";
import { listar, type CondicaoDeCampo, type FonteDoPublico, type OperadorDeCampo } from "./valores";

/** O schema aceita até 10 etiquetas por campo. */
const MAXIMO_DE_ETIQUETAS = 10;

const ORIGENS: ReadonlyArray<{ valor: FonteDoPublico; titulo: string; descricao: string; icone: typeof Tag }> = [
  {
    valor: "crm",
    titulo: "Do CRM",
    descricao: "Contatos com negócio num funil, por etapa, data de entrada, etiquetas e variáveis.",
    icone: SquareKanban,
  },
  { valor: "etiqueta", titulo: "Por etiqueta", descricao: "Contatos com alguma (ou todas) as etiquetas escolhidas.", icone: Tag },
  {
    valor: "importacao",
    titulo: "Importar lista",
    descricao: "Uma planilha CSV ou XLSX vira a lista desta campanha.",
    icone: Upload,
  },
];

const OPERADORES: ReadonlyArray<{ valor: OperadorDeCampo; rotulo: string }> = [
  { valor: "igual", rotulo: "é igual a" },
  { valor: "contem", rotulo: "contém" },
  { valor: "preenchido", rotulo: "não está vazio" },
  { valor: "vazio", rotulo: "está vazio" },
];

const CORES_DA_ORIGEM = { bg: "#0e1f1c", borda: "#2aa597", icone: "#5eead4", iconeBg: "#0f2a24" };

export function PassoPublico({ v, setV, erro }: PropsDoPasso) {
  const t = useT();
  const mudar = mudarCampo(setV);
  const [aberto, setAberto] = useState<"com" | "sem" | null>(null);

  const silencio = (
    <Campo id="silencio" rotulo={t("Sem falar com a gente há")} ajuda={t("0 = sem filtro de silêncio.")}>
      <Stepper
        id="silencio"
        valor={v.semInteracao || "0"}
        onChange={(x) => mudar("semInteracao", x === "" || x === "0" ? "" : x)}
        passo={5}
        minimo={0}
        maximo={3650}
        sufixo={t("dias")}
        rotulo={t("Sem falar com a gente há")}
        menos={t("Menos")}
        mais={t("Mais")}
      />
    </Campo>
  );

  const limite = (
    <Campo id="limite" rotulo={t("Máximo de contatos nesta campanha")} erro={erro("limite")}>
      <Stepper
        id="limite"
        valor={v.limite}
        onChange={(x) => mudar("limite", x)}
        passo={10}
        minimo={1}
        maximo={5000}
        sufixo={t("contatos")}
        rotulo={t("Máximo de contatos nesta campanha")}
        menos={t("Menos")}
        mais={t("Mais")}
        invalido={!!erro("limite")}
      />
    </Campo>
  );

  const etiquetas = (
    <div className="cw-grade-2" data-campo="criterio">
      <div className="cw-campo">
        <span className="cw-rotulo">
          {v.fonte === "etiqueta" && v.todasAsTags ? t("Com todas estas etiquetas") : t("Com alguma destas etiquetas")}
        </span>
        <SeletorDeEtiquetas
          id="com-tags"
          tipo="positivo"
          valor={v.comAlgumaTag}
          outro={v.semTags}
          onChange={(x) => mudar("comAlgumaTag", x)}
          aberto={aberto === "com"}
          onAbrir={(a) => setAberto(a ? "com" : null)}
          rotuloDoOutro={t("Sem nenhuma destas etiquetas")}
        />
        {v.fonte === "etiqueta" && (
          <div className="cw-segmentado" role="radiogroup" aria-label={t("Como combinar as etiquetas")}>
            <button type="button" role="radio" aria-checked={!v.todasAsTags} onClick={() => mudar("todasAsTags", false)}>
              {t("Alguma")}
            </button>
            <button type="button" role="radio" aria-checked={v.todasAsTags} onClick={() => mudar("todasAsTags", true)}>
              {t("Todas")}
            </button>
          </div>
        )}
      </div>
      <div className="cw-campo">
        <span className="cw-rotulo">{t("Sem nenhuma destas etiquetas")}</span>
        <SeletorDeEtiquetas
          id="sem-tags"
          tipo="negativo"
          valor={v.semTags}
          outro={v.comAlgumaTag}
          onChange={(x) => mudar("semTags", x)}
          aberto={aberto === "sem"}
          onAbrir={(a) => setAberto(a ? "sem" : null)}
          rotuloDoOutro={
            v.fonte === "etiqueta" && v.todasAsTags ? t("Com todas estas etiquetas") : t("Com alguma destas etiquetas")
          }
        />
      </div>
    </div>
  );

  return (
    <Secao
      icone={Users}
      cor="#5eead4"
      fundo="#0f2a24"
      titulo={t("Público")}
      subtitulo={t("Escolha de onde vem o público e pelo menos um critério.")}
    >
      <GrupoDeOpcoes
        rotulo={t("Fonte do público")}
        classe="cw-grade-3"
        valores={ORIGENS.map((o) => o.valor)}
        valor={v.fonte}
        onChange={(x) => mudar("fonte", x as FonteDoPublico)}
      >
        {ORIGENS.map((o) => (
          <CartaoDeOpcao
            key={o.valor}
            valor={o.valor}
            topo
            indicador="check"
            selecionado={v.fonte === o.valor}
            onEscolher={() => mudar("fonte", o.valor)}
            icone={o.icone}
            titulo={t(o.titulo)}
            descricao={t(o.descricao)}
            cores={CORES_DA_ORIGEM}
            testid={`fonte-${o.valor}`}
          />
        ))}
      </GrupoDeOpcoes>

      {v.fonte === "crm" && <FiltrosDoCrm {...{ v, setV, erro }} />}
      {v.fonte === "crm" && etiquetas}
      {v.fonte === "etiqueta" && etiquetas}

      {v.fonte === "importacao" && (
        <div className="cw-upload" data-campo="lista">
          {!v.listaImportada && <ListaSalvaOuNova v={v} setV={setV} />}
          {(v.listaImportada || v.origemDaLista !== "salva") && (
            <ImportarLista
              importada={v.listaImportada ? { id: v.listaImportada, resumo: v.resumoDaLista } : null}
              onImportada={(r) =>
                setV((a) => ({
                  ...a,
                  listaImportada: r.fonteId ?? "",
                  resumoDaLista: r,
                  // O teto acompanha a lista: importar 800 e mandar para 100 seria surpresa.
                  limite: String(Math.min(5000, Math.max(Number(a.limite) || 0, r.criados + r.atualizados + r.mantidos))),
                }))
              }
              onTrocar={() => setV((a) => ({ ...a, listaImportada: "", resumoDaLista: null }))}
            />
          )}
        </div>
      )}
      <ErroDoCampo id="lista" texto={erro("lista")} />
      {v.fonte !== "importacao" && <ErroDoCampo id="criterio" texto={erro("criterio")} />}

      <div className="cw-grade-2">
        {v.fonte === "crm" ? <CondicoesDoContato v={v} setV={setV} /> : v.fonte === "etiqueta" ? silencio : null}
        {limite}
      </div>
    </Secao>
  );
}

function FiltrosDoCrm({ v, setV }: PropsDoPasso) {
  const t = useT();
  const idioma = useTagDeIdioma();
  const crms = useCrms();
  const funis = useFunis(v.crmDoPublico || null);
  const etapas = useEtapas(v.funilDoPublico || null);
  const [calendario, setCalendario] = useState(false);
  const mudar = mudarCampo(setV);
  const dataCurta = (iso: string) => {
    const [a, m, d] = iso.split("-").map(Number);
    return a ? new Intl.DateTimeFormat(idioma, { dateStyle: "short" }).format(new Date(a, (m ?? 1) - 1, d ?? 1)) : "…";
  };
  const temData = !!(v.entrouDe || v.entrouAte);

  return (
    <>
      <div className="cw-grade-2">
        <Campo id="pub-crm" rotulo={t("CRM")}>
          <SelectComIcone
            id="pub-crm"
            icone={SquareKanban}
            valor={v.crmDoPublico}
            onChange={(x) => setV((a) => ({ ...a, crmDoPublico: x, funilDoPublico: "", etapasDoPublico: [] }))}
          >
            <option value="">{t("Todos os CRMs")}</option>
            {(crms.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectComIcone>
        </Campo>
        <Campo id="pub-funil" rotulo={t("Com negócio no funil")}>
          <SelectComIcone
            id="pub-funil"
            icone={GitCommitHorizontal}
            valor={v.funilDoPublico}
            onChange={(x) => setV((a) => ({ ...a, funilDoPublico: x, etapasDoPublico: [] }))}
          >
            <option value="">{t("Qualquer funil")}</option>
            {(funis.data ?? []).map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </SelectComIcone>
        </Campo>
      </div>

      {v.funilDoPublico && (
        <div className="cw-campo">
          <span className="cw-rotulo">
            {t("Nas etapas")}
            <small>{t("nenhuma marcada = qualquer etapa")}</small>
          </span>
          <div className="cw-etapas" role="group" aria-label={t("Nas etapas")}>
            {(etapas.data ?? []).map((e) => {
              const marcada = v.etapasDoPublico.includes(e.id);
              return (
                <button
                  key={e.id}
                  type="button"
                  className="cw-chip-tag"
                  aria-pressed={marcada}
                  data-sel={marcada ? "positivo" : undefined}
                  onClick={() =>
                    setV((a) => ({
                      ...a,
                      etapasDoPublico: marcada ? a.etapasDoPublico.filter((id) => id !== e.id) : [...a.etapasDoPublico, e.id],
                    }))
                  }
                >
                  {marcada ? <Check size={12} aria-hidden /> : <Plus size={12} aria-hidden />}
                  {e.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="cw-grade-2">
        <Campo id="entrou" rotulo={t("Entrou no funil")}>
          <Popover open={calendario} onOpenChange={setCalendario}>
            <div className="cw-com-icone">
              <CalendarRange size={15} aria-hidden />
              <PopoverTrigger asChild>
                <button type="button" id="entrou" className="cw-intervalo-botao" aria-label={t("Entrou no funil")}>
                  {temData ? (
                    <span className="cw-mono" style={{ fontSize: 13 }}>
                      {`${v.entrouDe ? dataCurta(v.entrouDe) : "…"} → ${v.entrouAte ? dataCurta(v.entrouAte) : "…"}`}
                    </span>
                  ) : (
                    <span style={{ color: "var(--cw-muted-3)" }}>{t("Qualquer data")}</span>
                  )}
                </button>
              </PopoverTrigger>
              {temData && (
                <button
                  type="button"
                  className="cw-limpar"
                  aria-label={t("Limpar datas")}
                  title={t("Limpar datas")}
                  onClick={() => setV((a) => ({ ...a, entrouDe: "", entrouAte: "" }))}
                >
                  <X size={14} aria-hidden />
                </button>
              )}
            </div>
            <PopoverContent className="cw-portal w-auto border-0 bg-transparent p-0 shadow-none" align="start">
              <CalendarioDeIntervalo
                de={v.entrouDe}
                ate={v.entrouAte}
                ateHoje
                onAplicar={(de, ate) => {
                  setV((a) => ({ ...a, entrouDe: de, entrouAte: ate }));
                  setCalendario(false);
                }}
                onLimpar={() => {
                  setV((a) => ({ ...a, entrouDe: "", entrouAte: "" }));
                  setCalendario(false);
                }}
              />
            </PopoverContent>
          </Popover>
        </Campo>
        <Campo id="silencio" rotulo={t("Sem falar com a gente há")} ajuda={t("0 = sem filtro de silêncio.")}>
          <Stepper
            id="silencio"
            valor={v.semInteracao || "0"}
            onChange={(x) => mudar("semInteracao", x === "" || x === "0" ? "" : x)}
            passo={5}
            minimo={0}
            maximo={3650}
            sufixo={t("dias")}
            rotulo={t("Sem falar com a gente há")}
            menos={t("Menos")}
            mais={t("Mais")}
          />
        </Campo>
      </div>
    </>
  );
}

/**
 * O campo de etiquetas: as escolhidas como chips dentro do campo; a lista
 * completa só ao abrir, num painel que empurra o conteúdo (não flutua).
 */
function SeletorDeEtiquetas({
  id,
  tipo,
  valor,
  outro,
  onChange,
  aberto,
  onAbrir,
  rotuloDoOutro,
}: {
  id: string;
  tipo: "positivo" | "negativo";
  valor: string;
  outro: string;
  onChange: (v: string) => void;
  aberto: boolean;
  onAbrir: (aberto: boolean) => void;
  rotuloDoOutro: string;
}) {
  const t = useT();
  const conta = useEtiquetasDaConta();
  const [busca, setBusca] = useState("");
  const caixa = useRef<HTMLDivElement>(null);
  const escolhidas = listar(valor);
  const doOutro = listar(outro);
  const todas = conta.data ?? [];
  const lista = filtrarEtiquetas(todas, busca);

  // Fecha ao clicar fora ou com Esc.
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) onAbrir(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onAbrir(false);
    };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto, onAbrir]);

  const alternar = (nome: string) => {
    const ja = contemEtiqueta(escolhidas, nome);
    if (!ja && escolhidas.length >= MAXIMO_DE_ETIQUETAS) return;
    onChange((ja ? escolhidas.filter((e) => chaveDeBusca(e) !== chaveDeBusca(nome)) : [...escolhidas, nome]).join(", "));
  };

  return (
    <div ref={caixa} className="cw-campo">
      <div
        className="cw-tags"
        data-aberto={aberto || undefined}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          onAbrir(!aberto);
        }}
      >
        {escolhidas.length === 0 && <span className="cw-tags-placeholder">{t("Escolha etiquetas")}</span>}
        {escolhidas.map((nome) => (
          <span key={nome} className="cw-tag" data-tipo={tipo}>
            <Tag size={11} aria-hidden />
            <span>{nome}</span>
            <button
              type="button"
              aria-label={t("Remover {nome}").replace("{nome}", nome)}
              onClick={() => onChange(escolhidas.filter((e) => e !== nome).join(", "))}
            >
              <X size={12} aria-hidden />
            </button>
          </span>
        ))}
        <button
          type="button"
          id={id}
          className="cw-tags-seta"
          aria-expanded={aberto}
          aria-label={t("Ver todas as etiquetas")}
          title={t("Ver todas as etiquetas")}
          onClick={() => onAbrir(!aberto)}
        >
          {aberto ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
        </button>
      </div>
      {aberto && (
        <div className="cw-painel-tags">
          <div className="cw-busca">
            <Search size={13} aria-hidden />
            <input
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={t("Buscar etiqueta...")}
              aria-label={t("Buscar etiqueta...")}
            />
          </div>
          <div className="cw-chips">
            {conta.isLoading && <span className="cw-painel-rodape">{t("Carregando…")}</span>}
            {!conta.isLoading && lista.length === 0 && (
              <span className="cw-painel-rodape">{t("Nenhuma etiqueta encontrada.")}</span>
            )}
            {lista.map((e) => {
              const marcada = contemEtiqueta(escolhidas, e.nome);
              const noOutro = contemEtiqueta(doOutro, e.nome);
              const cheio = !marcada && escolhidas.length >= MAXIMO_DE_ETIQUETAS;
              return (
                <button
                  key={e.nome}
                  type="button"
                  className="cw-chip-tag"
                  data-sel={marcada ? tipo : undefined}
                  aria-pressed={marcada}
                  disabled={noOutro || cheio}
                  title={
                    noOutro
                      ? t("Já usada em “{campo}”").replace("{campo}", rotuloDoOutro)
                      : cheio
                        ? t("No máximo {n} etiquetas por campo.").replace("{n}", String(MAXIMO_DE_ETIQUETAS))
                        : undefined
                  }
                  onClick={() => alternar(e.nome)}
                >
                  {marcada ? <Check size={12} aria-hidden /> : <Plus size={12} aria-hidden />}
                  {e.nome}
                </button>
              );
            })}
          </div>
          <span className="cw-painel-rodape">
            {t("{x} selecionadas de {total}")
              .replace("{x}", String(escolhidas.length))
              .replace("{total}", String(todas.length))}
          </span>
        </div>
      )}
    </div>
  );
}

/** "Variáveis do contato": uma linha por condição (variável · operador · valor). */
function CondicoesDoContato({ v, setV }: Pick<PropsDoPasso, "v" | "setV">) {
  const t = useT();
  const variaveis = useVariaveisDaOrganizacao();
  const mudar = (i: number, p: Partial<CondicaoDeCampo>) =>
    setV((a) => ({ ...a, campos: a.campos.map((c, j) => (j === i ? { ...c, ...p } : c)) }));
  return (
    <div className="cw-campo">
      <span className="cw-rotulo">{t("Variáveis do contato")}</span>
      {v.campos.map((c, i) => {
        const semValor = c.operador === "preenchido" || c.operador === "vazio";
        return (
          <div key={i} className="cw-condicao">
            <select
              className="cw-var"
              aria-label={t("Variável")}
              value={c.chave}
              onChange={(e) => mudar(i, { chave: e.target.value })}
            >
              <option value="">{t("Escolha a variável")}</option>
              {(variaveis.data ?? []).map((x) => (
                <option key={x.key} value={x.key}>
                  {x.key}
                </option>
              ))}
            </select>
            <select
              className="cw-op"
              aria-label={t("Condição")}
              value={c.operador}
              onChange={(e) => mudar(i, { operador: e.target.value as OperadorDeCampo })}
            >
              {OPERADORES.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {t(o.rotulo)}
                </option>
              ))}
            </select>
            {semValor ? (
              <span style={{ flex: 1 }} />
            ) : (
              <input
                aria-label={t("Valor")}
                placeholder={t("Valor")}
                value={c.valor}
                maxLength={200}
                onChange={(e) => mudar(i, { valor: e.target.value })}
              />
            )}
            <button
              type="button"
              className="cw-limpar"
              style={{ position: "static" }}
              aria-label={t("Remover condição")}
              title={t("Remover condição")}
              onClick={() => setV((a) => ({ ...a, campos: a.campos.filter((_, j) => j !== i) }))}
            >
              <X size={14} aria-hidden />
            </button>
          </div>
        );
      })}
      {v.campos.length < 10 && (
        <button
          type="button"
          className="cw-tracejado"
          disabled={(variaveis.data ?? []).length === 0}
          title={(variaveis.data ?? []).length === 0 ? t("Crie variáveis em Configurações › Variáveis.") : undefined}
          onClick={() => setV((a) => ({ ...a, campos: [...a.campos, { chave: "", operador: "igual", valor: "" }] }))}
        >
          <Plus size={14} aria-hidden />
          {t("Adicionar condição")}
        </button>
      )}
    </div>
  );
}

/**
 * QUEM VAI RECEBER: o número que a prévia contou e o funil de elegibilidade.
 * Substitui o botão "Ver quantas pessoas" — conta sozinho (o orquestrador
 * pede de novo 500 ms depois da última mudança).
 */
export function QuemVaiReceber({
  previa,
  calculando,
  aviso,
  limite,
  variavel,
}: {
  previa: PreviaDaAudiencia | undefined;
  calculando: boolean;
  /** Por que ainda não há conta (sem critério, limite inválido, falha); `null` = conta normal. */
  aviso: string | null;
  limite: number;
  /** A variável da mensagem, quando há uma só (a linha vira "Sem {variavel}"). */
  variavel: string | null;
}) {
  const t = useT();
  const idioma = useTagDeIdioma();
  const n = (x: number) => x.toLocaleString(idioma);
  const total = previa?.total ?? 0;
  const semConsentimento = previa?.motivos.sem_consentimento ?? 0;
  const semDado = previa?.motivos.variavel_ausente ?? 0;
  const outros = Math.max(0, (previa?.excluidos ?? 0) - semConsentimento - semDado);
  const elegiveis = previa?.elegiveis ?? 0;
  const largura = (x: number) => `${total > 0 ? Math.min(100, (x / total) * 100) : 0}%`;
  const linhas: Array<{ rotulo: string; valor: string; cor: string; largura: string; dica?: string }> = [
    { rotulo: t("Encontrados nos filtros"), valor: n(total), cor: "#5eead4", largura: largura(total) },
    { rotulo: t("Sem consentimento"), valor: `−${n(semConsentimento)}`, cor: "#f87171", largura: largura(semConsentimento) },
    {
      rotulo: variavel ? t("Sem {variavel}").replace("{variavel}", `{${variavel}}`) : t("Sem um dado da mensagem"),
      valor: `−${n(semDado)}`,
      cor: "#f2b544",
      largura: largura(semDado),
    },
  ];
  if (outros > 0) {
    linhas.push({
      rotulo: t("Outros motivos"),
      valor: `−${n(outros)}`,
      cor: "#8e8e96",
      largura: largura(outros),
      dica: Object.entries(previa?.motivos ?? {})
        .filter(([m]) => m !== "sem_consentimento" && m !== "variavel_ausente")
        .map(([m, q]) => `${q} — ${m in TEXTO_DA_EXCLUSAO ? t(TEXTO_DA_EXCLUSAO[m as MotivoDeExclusao]) : m}`)
        .join("\n"),
    });
  }
  linhas.push(
    { rotulo: t("Elegíveis"), valor: n(elegiveis), cor: "#3ecf8e", largura: largura(elegiveis) },
    { rotulo: t("Limite desta campanha"), valor: n(limite), cor: "#93b0ff", largura: largura(Math.min(limite, total)) },
  );
  const limitado = previa ? elegiveis >= limite : false;
  const semConta = aviso !== null;

  return (
    <section className="cw-receber" aria-live="polite" data-testid="quem-vai-receber">
      <div className="cw-receber-esq">
        <span className="cw-receber-rotulo">
          <span className="cw-ponto-vivo" aria-hidden />
          {t("Quem vai receber")}
        </span>
        <div className={`cw-receber-numero${calculando ? " cw-brilho" : ""}`} data-calculando={calculando || undefined}>
          <b data-testid="quem-vai-receber-numero">{previa && !semConta ? n(Math.min(elegiveis, limite)) : "—"}</b>
          <span>{t("contatos")}</span>
        </div>
        <span className="cw-receber-nota">
          {semConta
            ? aviso
            : !previa
              ? t("Contando…")
              : limitado
                ? t("{n} elegíveis · limitado a {max}").replace("{n}", n(elegiveis)).replace("{max}", n(limite))
                : t("todos os {n} elegíveis").replace("{n}", n(elegiveis))}
        </span>
      </div>
      <div className="cw-receber-dir">
        {linhas.map((l) => (
          <div className="cw-funil-linha" key={l.rotulo} title={l.dica}>
            <span>{l.rotulo}</span>
            <span className="cw-funil-barra">
              <i style={{ width: semConta ? "0%" : l.largura, background: l.cor }} />
            </span>
            <span className="cw-funil-valor">{semConta || !previa ? "—" : l.valor}</span>
          </div>
        ))}
        {previa?.truncado && (
          <p className="cw-receber-nota">
            {t(
              "O recorte bateu o teto de 20.000 negócios desta prévia — a lista pode estar incompleta. Refine o filtro para ver o todo.",
            )}
          </p>
        )}
      </div>
    </section>
  );
}
