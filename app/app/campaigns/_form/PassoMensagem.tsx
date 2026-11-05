"use client";
/**
 * PASSO 3 — MENSAGEM: texto simples (editor com as variáveis como chips) ou
 * um fluxo do construtor; no número oficial, o modelo aprovado no lugar do
 * texto. E o idioma da campanha.
 */
import { ChevronDown, ChevronUp, CircleCheck, Info, Languages, MessageSquareText, Search, Text, Zap } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import { PreviaPorContato } from "@/components/campanhas/ListaDeVariaveis";
import { useVariaveisDaOrganizacao } from "@/hooks/campanhas/useDestinoDaCampanha";
import { useT } from "@/hooks/i18n/useT";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { CAMPOS_DO_CONTATO, campoDoCatalogo } from "@/lib/variables/campos-do-contato";
import { VARIAVEIS_DO_SISTEMA } from "@/lib/variables/sistema";

import { ModeloDaCampanha } from "../_components/ModeloDaCampanha";
import { CartaoDeOpcao, Campo, ErroDoCampo, GrupoDeOpcoes, Secao } from "./base";
import { mudarCampo, type PropsDoPasso } from "./contexto";
import { EditorDeMensagem, type ApiDoEditor } from "./EditorDeMensagem";

/** As seis mais usadas, sempre à vista. */
const MAIS_USADAS = ["primeiro_nome", "nome_saudacao", "saudacao_horario", "nome_curto", "nome_completo", "whatsapp"] as const;

export interface FluxoDaLista {
  id: string;
  name: string;
  status: string;
  draft_graph?: { nodes?: unknown[] } | null;
}

/** Exemplo de formato (código de idioma), não prosa. */
const EXEMPLO_DE_IDIOMA = "pt-PT";

const CORES_DO_TIPO = { bg: "#161328", borda: "#7c6be0", icone: "#c4b5fd", iconeBg: "#1f1a35" };

export function PassoMensagem({
  v,
  setV,
  erro,
  comModelo,
  canalProvider,
  fluxos,
}: PropsDoPasso & {
  comModelo: boolean;
  canalProvider: string | null;
  fluxos: FluxoDaLista[];
}) {
  const t = useT();
  const mudar = mudarCampo(setV);
  const editor = useRef<ApiDoEditor | null>(null);

  return (
    <Secao
      icone={MessageSquareText}
      cor="#c4b5fd"
      fundo="#1f1a35"
      titulo={t("O que enviar")}
      subtitulo={t("Escreva como você falaria com uma pessoa só.")}
    >
      <GrupoDeOpcoes
        rotulo={t("O que enviar")}
        classe="cw-grade-2"
        valores={["text", "flow"]}
        valor={v.modo}
        onChange={(x) => mudar("modo", x as typeof v.modo)}
        id="modo-da-campanha"
      >
        <CartaoDeOpcao
          valor="text"
          selecionado={v.modo === "text"}
          onEscolher={() => mudar("modo", "text")}
          icone={Text}
          indicador="nenhum"
          titulo={comModelo ? t("Modelo aprovado") : t("Texto simples")}
          descricao={comModelo ? t("O modelo aprovado do número oficial") : t("Uma mensagem com variáveis")}
          direita={v.modo === "text" ? <CircleCheck size={17} color="#c4b5fd" aria-hidden /> : undefined}
          cores={CORES_DO_TIPO}
          testid="modo-texto"
        />
        <CartaoDeOpcao
          valor="flow"
          selecionado={v.modo === "flow"}
          onEscolher={() => mudar("modo", "flow")}
          icone={Zap}
          indicador="nenhum"
          titulo={t("Iniciar um fluxo")}
          descricao={t("Começa um fluxo do construtor")}
          direita={v.modo === "flow" ? <CircleCheck size={17} color="#c4b5fd" aria-hidden /> : undefined}
          cores={CORES_DO_TIPO}
          testid="modo-fluxo"
        />
      </GrupoDeOpcoes>

      {v.modo === "flow" ? (
        <EscolhaDoFluxo v={v} setV={setV} erro={erro} fluxos={fluxos} />
      ) : comModelo ? (
        <div className="cw-campo" data-campo="modelo">
          <div className="cw-legado">
            <ModeloDaCampanha
              channelSessionId={v.canal}
              provider={canalProvider}
              valor={v.modelo}
              onChange={(m) => mudar("modelo", m)}
            />
          </div>
          <ErroDoCampo id="modelo" texto={erro("modelo")} />
        </div>
      ) : (
        <>
          <div className="cw-campo">
            <EditorDeMensagem
              id="texto"
              valor={v.texto}
              onChange={(x) => mudar("texto", x)}
              apiRef={editor}
              rotulo={t("Texto da mensagem")}
              placeholder={t("Escreva como você falaria com uma pessoa só.")}
              invalido={!!erro("texto")}
              textos={{
                negrito: t("Negrito"),
                italico: t("Itálico"),
                riscado: t("Riscado"),
                emoji: t("Emoji"),
                melhorar: t("Melhorar com IA"),
                emBreve: t("Em breve"),
                caracteres: t("caracteres"),
              }}
            />
            <ErroDoCampo id="texto" texto={erro("texto")} />
          </div>
          <Variaveis onInserir={(chave) => editor.current?.inserir(`{${chave}}`, true)} />
          <p className="cw-aviso">
            <Info size={14} aria-hidden />
            <span>
              {t("Quem não tiver o dado que a mensagem usa fica de fora. Para um texto de reserva, use a barra:")}{" "}
              <code>{t("{nome_saudacao|tudo bem}")}</code>. {t("Crie variáveis em")}{" "}
              <Link href="/app/settings/variaveis">{t("Configurações › Variáveis")}</Link>.
            </span>
          </p>
          {v.texto.trim() !== "" && (
            <div className="cw-legado">
              <PreviaPorContato texto={v.texto} idioma={v.idioma || null} fuso={v.fuso || null} />
            </div>
          )}
        </>
      )}

      <IdiomaDoPasso v={v} setV={setV} erro={erro} />
    </Secao>
  );
}

/** "Clique para inserir uma variável": as 6 mais usadas e, em "Ver todas", os três grupos. */
function Variaveis({ onInserir }: { onInserir: (chave: string) => void }) {
  const t = useT();
  const org = useVariaveisDaOrganizacao();
  const [todas, setTodas] = useState(false);
  const daEmpresa = (org.data ?? []).filter((x) => !campoDoCatalogo(x.key));
  const doContato = CAMPOS_DO_CONTATO.filter((c) => c.origem === "padrao");
  const total = VARIAVEIS_DO_SISTEMA.length + doContato.length + daEmpresa.length;
  const mini = (chave: string, dica: string) => (
    <button
      key={chave}
      type="button"
      className="cw-var-mini"
      title={dica}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onInserir(chave)}
      data-testid={`variavel-${chave}`}
    >
      {`{${chave}}`}
    </button>
  );
  return (
    <div className="cw-campo" data-testid="lista-de-variaveis">
      <div className="cw-variaveis-topo">
        <span className="cw-rotulo">{t("Clique para inserir uma variável")}</span>
        <button type="button" className="cw-ver-todas" aria-expanded={todas} onClick={() => setTodas((x) => !x)}>
          {todas ? t("Mostrar menos") : t("Ver todas ({total})").replace("{total}", String(total))}
          {todas ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
        </button>
      </div>
      <div className="cw-etapas">
        {MAIS_USADAS.map((chave) => {
          const x = VARIAVEIS_DO_SISTEMA.find((y) => y.chave === chave);
          return (
            <button
              key={chave}
              type="button"
              className="cw-var-chip"
              title={x ? t(x.descricao) : undefined}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onInserir(chave)}
            >
              {`{${chave}}`}
            </button>
          );
        })}
      </div>
      {todas && (
        <div className="cw-painel-vars">
          <div className="cw-campo">
            <span className="cw-grupo-titulo">{t("Do contato e do envio")}</span>
            <div className="cw-etapas">{VARIAVEIS_DO_SISTEMA.map((x) => mini(x.chave, t(x.descricao)))}</div>
          </div>
          <div className="cw-campo">
            <span className="cw-grupo-titulo">{t("Campos do contato")}</span>
            <div className="cw-etapas">{doContato.map((c) => mini(c.chave, t(c.rotulo)))}</div>
          </div>
          {daEmpresa.length > 0 && (
            <div className="cw-campo">
              <span className="cw-grupo-titulo">{t("Da empresa")}</span>
              <div className="cw-etapas">{daEmpresa.map((x) => mini(x.key, x.label))}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EscolhaDoFluxo({ v, setV, erro, fluxos }: PropsDoPasso & { fluxos: FluxoDaLista[] }) {
  const t = useT();
  const [busca, setBusca] = useState("");
  const visiveis = fluxos.filter((f) => f.status === "active" || f.id === v.fluxo);
  const lista = visiveis.length > 6 && busca.trim()
    ? visiveis.filter((f) => f.name.toLowerCase().includes(busca.trim().toLowerCase()))
    : visiveis;
  return (
    <div className="cw-campo" data-campo="fluxo">
      {visiveis.length > 6 && (
        <div className="cw-busca" style={{ height: 38 }}>
          <Search size={13} aria-hidden />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={t("Buscar fluxo")} aria-label={t("Buscar fluxo")} />
        </div>
      )}
      {visiveis.length === 0 ? (
        <p className="cw-aviso">
          <Info size={14} aria-hidden />
          {t("Nenhum fluxo publicado. Publique um fluxo em Fluxos para usá-lo aqui.")}
        </p>
      ) : (
        <GrupoDeOpcoes
          id="fluxo"
          rotulo={t("Fluxo")}
          classe="cw-fluxos"
          valores={lista.map((f) => f.id)}
          valor={v.fluxo}
          onChange={(x) => setV((a) => ({ ...a, fluxo: x }))}
        >
          {lista.map((f) => {
            const blocos = Array.isArray(f.draft_graph?.nodes) ? f.draft_graph!.nodes!.length : 0;
            const ativo = f.status === "active";
            return (
              <CartaoDeOpcao
                key={f.id}
                valor={f.id}
                selecionado={v.fluxo === f.id}
                onEscolher={() => setV((a) => ({ ...a, fluxo: f.id }))}
                icone={Zap}
                indicador="nenhum"
                titulo={f.name}
                descricao={
                  ativo
                    ? t("{n} blocos · ativo").replace("{n}", String(blocos))
                    : t("{n} blocos · não publicado").replace("{n}", String(blocos))
                }
                direita={v.fluxo === f.id ? <CircleCheck size={17} color="#93b0ff" aria-hidden /> : undefined}
                testid={`fluxo-${f.id}`}
              />
            );
          })}
        </GrupoDeOpcoes>
      )}
      <ErroDoCampo id="fluxo" texto={erro("fluxo")} />
      <p className="cw-ajuda">
        {t(
          "Cada contato entra no fluxo no Início, no ritmo da campanha. Daí em diante quem conduz é o fluxo — mensagens, esperas e decisões. Quem já está em outro fluxo fica de fora.",
        )}
      </p>
    </div>
  );
}

/**
 * O IDIOMA DA CAMPANHA (9019): as opções são as do campo `idioma_conversa` (ou
 * `idioma_prospeccao`) da empresa; sem essa configuração, campo livre.
 */
function IdiomaDoPasso({ v, setV, erro }: PropsDoPasso) {
  const t = useT();
  const idiomaDaTela = useTagDeIdioma();
  const org = useVariaveisDaOrganizacao();
  const def = (org.data ?? []).find(
    (x) => (x.key === "idioma_conversa" || x.key === "idioma_prospeccao") && (x.options?.length ?? 0) > 0,
  );
  const opcoes = def?.options ?? [];
  const nome = (codigo: string) => {
    try {
      return new Intl.DisplayNames([idiomaDaTela], { type: "language" }).of(codigo) ?? codigo;
    } catch {
      return codigo;
    }
  };
  const mudar = (x: string) => setV((a) => ({ ...a, idioma: x }));
  return (
    <Campo
      id="idioma-campanha"
      rotulo={t("Idioma da campanha")}
      ajuda={t(
        "Inicia o idioma da prospecção e da conversa de quem ainda não tem um. Conversa já estabelecida em outro idioma continua nele.",
      )}
    >
      <div data-campo="idioma" data-testid="idioma-da-campanha">
        <div className="cw-com-icone" data-invalido={erro("idioma") ? true : undefined}>
          <Languages size={15} aria-hidden />
          {opcoes.length > 0 ? (
            <select id="idioma-campanha" value={v.idioma} onChange={(e) => mudar(e.target.value)} style={{ paddingRight: 96 }}>
              <option value="">{t("Sem idioma próprio (o do contato)")}</option>
              {opcoes.map((o) => (
                <option key={o} value={o}>
                  {nome(o)}
                </option>
              ))}
              {v.idioma && !opcoes.includes(v.idioma) && <option value={v.idioma}>{nome(v.idioma)}</option>}
            </select>
          ) : (
            <input
              id="idioma-campanha"
              value={v.idioma}
              placeholder={EXEMPLO_DE_IDIOMA}
              onChange={(e) => mudar(e.target.value)}
              aria-invalid={!!erro("idioma") || undefined}
            />
          )}
          {opcoes.length > 0 && v.idioma && (
            <span className="cw-mono" style={{ position: "absolute", right: 36, fontSize: 12, color: "var(--cw-muted)", pointerEvents: "none" }}>
              {v.idioma}
            </span>
          )}
          {opcoes.length > 0 && <ChevronDown size={15} className="cw-chevron" aria-hidden />}
        </div>
        <ErroDoCampo id="idioma" texto={erro("idioma")} />
      </div>
    </Campo>
  );
}
