"use client";
/**
 * A TABELA da lista de Campanhas (seção 6 da especificação de nov/2026):
 * mesmas colunas no cabeçalho e nas linhas, colunas de número ordenáveis,
 * 20 por página, e o menu ⋯ com as ações que cabem na situação — as mesmas
 * da máquina de estados (`lib/campanhas/maquina-de-estados.ts`), que é quem
 * recusa de verdade.
 */
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Ellipsis } from "lucide-react";
import { useMemo, useState } from "react";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { AcaoDeCampanha, CampanhaDoResumo } from "@/hooks/campanhas/useCampanhas";
import { useT } from "@/hooks/i18n/useT";
import { percentual } from "@/lib/campanhas/resumo";
import type { StatusDaCampanha } from "@/lib/campanhas/tipos";

import { ChipDeSituacao, dataCurta, dataLonga, PillDaTaxa, QuadradoDoTipo, textoDoPercentual } from "./comum";

export type ItemDoMenu = AcaoDeCampanha | "relatorio" | "editar" | "csv";

/** As ações de cada situação, na ordem do menu. Excluir não existe na plataforma: ficou de fora. */
export const MENU_DA_SITUACAO: Record<StatusDaCampanha, ItemDoMenu[]> = {
  running: ["relatorio", "pausar", "cancelar"],
  paused: ["retomar", "relatorio", "duplicar", "cancelar"],
  completed: ["relatorio", "duplicar", "csv"],
  cancelled: ["relatorio", "duplicar"],
  draft: ["editar", "preparar", "cancelar"],
  scheduled: ["relatorio", "iniciar", "pausar", "cancelar"],
  ready: ["relatorio", "iniciar", "cancelar"],
  preparing: ["relatorio"],
  failed: ["relatorio", "duplicar"],
};

const ROTULO_DO_ITEM: Record<ItemDoMenu, string> = {
  relatorio: "Ver relatório",
  editar: "Editar",
  csv: "Exportar CSV",
  preparar: "Preparar lista",
  iniciar: "Iniciar agora",
  agendar: "Agendar",
  pausar: "Pausar",
  retomar: "Retomar",
  cancelar: "Cancelar",
  duplicar: "Duplicar",
  testar: "Enviar teste",
};

type Coluna = "data" | "enviadas" | "entregues" | "lidas" | "taxa";

const POR_PAGINA = 20;

function valorDaColuna(c: CampanhaDoResumo, coluna: Coluna): number {
  const k = c.contagem;
  if (coluna === "enviadas") return k.enviadas;
  if (coluna === "entregues") return k.entregues;
  if (coluna === "lidas") return c.leitura_disponivel ? k.lidas : -1;
  if (coluna === "taxa") return percentual(k.responderam, k.enviadas) ?? -1;
  return Date.parse(c.criada_em);
}

/** A data que importa depende do estado: "terminou", "começou", "agendada" ou "criada". */
function dataDaLinha(c: CampanhaDoResumo): { iso: string; tipo: "terminou" | "começou" | "agendada" | "criada" } {
  if (c.concluida_em) return { iso: c.concluida_em, tipo: "terminou" };
  if (c.cancelada_em && !c.iniciada_em) return { iso: c.cancelada_em, tipo: "terminou" };
  if (c.iniciada_em) return { iso: c.iniciada_em, tipo: "começou" };
  if (c.status === "scheduled" && c.agendada_em) return { iso: c.agendada_em, tipo: "agendada" };
  return { iso: c.criada_em, tipo: "criada" };
}

const ROTULO_DA_DATA: Record<"terminou" | "começou" | "agendada" | "criada", string> = {
  terminou: "terminou",
  começou: "começou",
  agendada: "agendada para",
  criada: "criada",
};

export function TabelaDeCampanhas({
  campanhas,
  media,
  idioma,
  onAbrir,
  onAcao,
}: {
  campanhas: CampanhaDoResumo[];
  media: number | null;
  idioma: string;
  onAbrir: (id: string) => void;
  onAcao: (c: CampanhaDoResumo, item: ItemDoMenu) => void;
}) {
  const t = useT();
  const [ordem, setOrdem] = useState<{ coluna: Coluna; desc: boolean }>({ coluna: "data", desc: true });
  const [pagina, setPagina] = useState(0);

  const ordenadas = useMemo(() => {
    const lista = [...campanhas];
    lista.sort((a, b) => {
      const d = valorDaColuna(a, ordem.coluna) - valorDaColuna(b, ordem.coluna);
      return ordem.desc ? -d : d;
    });
    return lista;
  }, [campanhas, ordem]);

  const paginas = Math.max(1, Math.ceil(ordenadas.length / POR_PAGINA));
  const atual = Math.min(pagina, paginas - 1);
  const visiveis = ordenadas.slice(atual * POR_PAGINA, (atual + 1) * POR_PAGINA);

  const ordenar = (coluna: Coluna) => {
    setPagina(0);
    setOrdem((o) => (o.coluna === coluna ? { coluna, desc: !o.desc } : { coluna, desc: true }));
  };
  const Seta = ordem.desc ? ArrowDown : ArrowUp;
  const titulo = (coluna: Coluna, texto: string) => (
    <button
      type="button"
      className="cp-ordenar"
      data-ativo={ordem.coluna === coluna || undefined}
      onClick={() => ordenar(coluna)}
    >
      {texto}
      {ordem.coluna === coluna && <Seta size={12} aria-hidden />}
    </button>
  );

  return (
    <div className="cp-tabela" data-testid="tabela-de-campanhas">
      <div className="cp-grade cp-cabecalho-da-tabela" role="row">
        <span>{t("Campanha")}</span>
        <span>{t("Situação")}</span>
        {titulo("enviadas", t("Enviadas"))}
        {titulo("entregues", t("Entregues"))}
        {titulo("lidas", t("Lidas"))}
        {titulo("taxa", t("Taxa de resposta"))}
        {titulo("data", t("Data"))}
        <span />
      </div>

      {visiveis.length === 0 ? (
        <div className="cp-vazio-periodo">{t("Nenhuma outra campanha neste período.")}</div>
      ) : (
        visiveis.map((c) => {
          const k = c.contagem;
          const total = c.lista.total;
          const quando = dataDaLinha(c);
          const semEnvio = k.enviadas === 0;
          const itens = MENU_DA_SITUACAO[c.status] ?? ["relatorio"];
          return (
            <div
              key={c.id}
              className="cp-grade cp-linha"
              role="link"
              tabIndex={0}
              data-testid={`linha-${c.id}`}
              onClick={() => onAbrir(c.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onAbrir(c.id);
              }}
            >
              <div className="cp-celula-campanha cp-a-campanha">
                <QuadradoDoTipo tipo={c.tipo} />
                <div className="cp-coluna">
                  <span className="cp-nome" title={c.nome}>
                    {c.nome}
                  </span>
                  <span className="cp-detalhe">
                    {c.lista.preparada
                      ? `${nomeDaLista(c, t)} · ${total.toLocaleString(idioma)} ${t("contatos")}`
                      : t("lista ainda não preparada")}
                  </span>
                </div>
              </div>
              <div className="cp-a-situacao">
                <ChipDeSituacao status={c.status} />
              </div>
              <Metrica
                classe="cp-a-enviadas"
                rotulo={t("Enviadas")}
                valor={semEnvio ? null : k.enviadas}
                complemento={semEnvio ? "" : `${t("de")} ${total.toLocaleString(idioma)}`}
                largura={percentual(k.enviadas, total)}
                cor="var(--m-sent)"
                idioma={idioma}
              />
              <Metrica
                classe="cp-a-entregues"
                rotulo={t("Entregues")}
                valor={semEnvio ? null : k.entregues}
                complemento={semEnvio ? "" : textoDoPercentual(k.entregues, k.enviadas)}
                largura={percentual(k.entregues, k.enviadas)}
                cor="var(--m-del)"
                idioma={idioma}
              />
              {c.leitura_disponivel ? (
                <Metrica
                  classe="cp-a-lidas"
                  rotulo={t("Lidas")}
                  valor={semEnvio ? null : k.lidas}
                  complemento={semEnvio ? "" : textoDoPercentual(k.lidas, k.enviadas)}
                  largura={percentual(k.lidas, k.enviadas)}
                  cor="var(--m-read)"
                  idioma={idioma}
                />
              ) : (
                <div className="cp-metrica cp-a-lidas" title={t("Leitura indisponível nesta conexão")}>
                  <span className="cp-rotulo-celula">{t("Lidas")}</span>
                  <div className="cp-metrica-linha">
                    <span className="cp-metrica-valor">—</span>
                  </div>
                  <div className="cp-barra" />
                </div>
              )}
              <div className="cp-a-taxa">
                <PillDaTaxa respostas={k.responderam} enviadas={k.enviadas} media={media} idioma={idioma} />
              </div>
              <span className="cp-data cp-a-data" title={`${t(ROTULO_DA_DATA[quando.tipo])} ${dataLonga(quando.iso, idioma)}`}>
                {dataCurta(quando.iso, idioma)}
              </span>
              <div className="cp-a-menu" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger className="cp-menu-botao" aria-label={t("Mais ações")}>
                    <Ellipsis size={16} aria-hidden />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="cp-portal cp-menu">
                    {itens.map((item) => (
                      <DropdownMenuItem
                        key={item}
                        className="cp-menu-item"
                        data-perigo={item === "cancelar" || undefined}
                        onSelect={() => onAcao(c, item)}
                      >
                        {t(ROTULO_DO_ITEM[item])}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          );
        })
      )}

      {ordenadas.length > POR_PAGINA && (
        <div className="cp-rodape">
          <span style={{ marginRight: "auto" }}>
            {t("Mostrando {a}–{b} de {n}")
              .replace("{a}", String(atual * POR_PAGINA + 1))
              .replace("{b}", String(Math.min(ordenadas.length, (atual + 1) * POR_PAGINA)))
              .replace("{n}", String(ordenadas.length))}
          </span>
          <button
            type="button"
            className="cp-seta"
            disabled={atual === 0}
            aria-label={t("Página anterior")}
            onClick={() => setPagina(atual - 1)}
          >
            <ChevronLeft size={15} aria-hidden />
          </button>
          <button
            type="button"
            className="cp-seta"
            disabled={atual >= paginas - 1}
            aria-label={t("Próxima página")}
            onClick={() => setPagina(atual + 1)}
          >
            <ChevronRight size={15} aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}

/** O nome da lista na linha: a importada, o funil, as etiquetas ou o CRM. */
export function nomeDaLista(c: CampanhaDoResumo, t: (s: string) => string): string {
  if (c.lista.tipo === "etiquetas") return `${t("Etiquetas")}: ${c.lista.nome ?? ""}`;
  if (c.lista.nome) return c.lista.nome;
  if (c.lista.tipo === "lista") return t("Lista importada");
  if (c.lista.tipo === "funil") return t("Funil do CRM");
  return t("Contatos do CRM");
}

function Metrica({
  classe,
  rotulo,
  valor,
  complemento,
  largura,
  cor,
  idioma,
}: {
  classe: string;
  rotulo: string;
  valor: number | null;
  complemento: string;
  largura: number | null;
  cor: string;
  idioma: string;
}) {
  return (
    <div className={`cp-metrica ${classe}`}>
      <span className="cp-rotulo-celula">{rotulo}</span>
      <div className="cp-metrica-linha">
        <span className="cp-metrica-valor">{valor === null ? "—" : valor.toLocaleString(idioma)}</span>
        {complemento && <span className="cp-metrica-comp">{complemento}</span>}
      </div>
      <div className="cp-barra">
        {valor !== null && <i style={{ width: `${Math.min(100, largura ?? 0)}%`, background: cor }} />}
      </div>
    </div>
  );
}
