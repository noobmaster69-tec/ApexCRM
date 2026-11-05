"use client";
/**
 * PASSO 4 — FUNIL: onde o contato entra ao RECEBER e para onde vai ao
 * RESPONDER (os dois opcionais, ligados pelo conector), e quem atende a
 * resposta. "Mover no funil" desligado zera os dois ao salvar.
 */
import { Bot, MessageCircleReply, Send, SquareKanban, User, type LucideIcon } from "lucide-react";
import { useState, type CSSProperties } from "react";

import {
  useAgentesPublicados,
  useEtapas,
  useFunis,
  type EtapaDoFunil,
  type FunilDaCampanha,
} from "@/hooks/campanhas/useDestinoDaCampanha";
import { useT } from "@/hooks/i18n/useT";

import { CartaoDeOpcao, Campo, GrupoDeOpcoes, SelectComIcone, Secao } from "./base";
import type { PropsDoPasso } from "./contexto";

/** As etapas onde um contato pode ENTRAR: ganho e perdido ficam de fora. */
export const etapasAbertas = (etapas: EtapaDoFunil[] | undefined) => (etapas ?? []).filter((e) => !e.is_won && !e.is_lost);

export function PassoFunil({ v, setV }: PropsDoPasso) {
  const t = useT();
  const funis = useFunis();
  const agentes = useAgentesPublicados();
  const mover = v.moverNoFunil !== false;
  const [especifico, setEspecifico] = useState(v.agente !== "");

  return (
    <>
      <Secao
        icone={SquareKanban}
        cor="#f7cd7a"
        fundo="#2a2010"
        titulo={t("Progresso no funil")}
        subtitulo={t("Opcional. Move o contato no CRM quando ele recebe e quando responde.")}
        direita={
          <label className="cw-chave">
            {t("Mover no funil")}
            <button
              type="button"
              role="switch"
              aria-checked={mover}
              aria-label={t("Mover no funil")}
              className="cw-interruptor"
              onClick={() => setV((a) => ({ ...a, moverNoFunil: !mover }))}
              data-testid="mover-no-funil"
            >
              <span />
            </button>
          </label>
        }
      >
        <div className="cw-funil" data-desligado={!mover || undefined} aria-disabled={!mover || undefined}>
          <CardDoFunil
            prefixo="recebe"
            icone={Send}
            titulo={t("Quem recebe")}
            descricao={t("Ao receber, o contato entra nesta etapa.")}
            cores={{ c: "#93b0ff", bg: "#152248", borda: "#2c3a66" }}
            funis={funis.data ?? []}
            funil={v.funilDeQuemRecebe}
            etapa={v.etapaDeQuemRecebe}
            desligado={!mover}
            onFunil={(x) => setV((a) => ({ ...a, funilDeQuemRecebe: x, etapaDeQuemRecebe: "" }))}
            onEtapa={(x) => setV((a) => ({ ...a, etapaDeQuemRecebe: x }))}
          />
          <div className="cw-conector" aria-hidden>
            <div className="cw-conector-linha">
              <i className="cw-conector-ponto" style={{ "--p": "#5b8cff", animationDelay: "0s" } as CSSProperties} />
              <i className="cw-conector-ponto" style={{ "--p": "#93b0ff", animationDelay: "0.8s" } as CSSProperties} />
              <i className="cw-conector-ponto" style={{ "--p": "#f2b544", animationDelay: "1.6s" } as CSSProperties} />
            </div>
            <span>{t("ao responder")}</span>
          </div>
          <CardDoFunil
            prefixo="responde"
            icone={MessageCircleReply}
            titulo={t("Quem responde")}
            descricao={t("Ao responder, é movido para esta etapa.")}
            cores={{ c: "#f7cd7a", bg: "#2a2010", borda: "#4a3a16" }}
            funis={funis.data ?? []}
            funil={v.funil}
            etapa={v.etapa}
            desligado={!mover}
            onFunil={(x) => setV((a) => ({ ...a, funil: x, etapa: "" }))}
            onEtapa={(x) => setV((a) => ({ ...a, etapa: x }))}
          />
        </div>
      </Secao>

      <section className="cw-secao" style={{ padding: "20px 22px", gap: 14 }}>
        <span className="cw-rotulo" style={{ fontSize: 15, fontWeight: 600, color: "var(--cw-text)" }}>
          {t("Quem atende a resposta (opcional)")}
        </span>
        <GrupoDeOpcoes
          rotulo={t("Quem atende a resposta (opcional)")}
          classe="cw-grade-2"
          valores={["numero", "agente"]}
          valor={especifico ? "agente" : "numero"}
          onChange={(x) => {
            setEspecifico(x === "agente");
            if (x === "numero") setV((a) => ({ ...a, agente: "" }));
          }}
        >
          <CartaoDeOpcao
            valor="numero"
            selecionado={!especifico}
            onEscolher={() => {
              setEspecifico(false);
              setV((a) => ({ ...a, agente: "" }));
            }}
            icone={Bot}
            titulo={t("Agente do número")}
            descricao={t("Padrão")}
            testid="atende-numero"
          />
          <CartaoDeOpcao
            valor="agente"
            selecionado={especifico}
            onEscolher={() => setEspecifico(true)}
            icone={User}
            titulo={t("Agente específico")}
            descricao={t("Escolher")}
            desabilitado={(agentes.data ?? []).length === 0}
            dica={(agentes.data ?? []).length === 0 ? t("Nenhum agente publicado.") : undefined}
            testid="atende-agente"
          />
        </GrupoDeOpcoes>
        {especifico && (
          <Campo id="agente" rotulo={t("Agente")}>
            <SelectComIcone id="agente" icone={Bot} valor={v.agente} onChange={(x) => setV((a) => ({ ...a, agente: x }))}>
              <option value="">{t("Agente publicado no número (padrão)")}</option>
              {(agentes.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </SelectComIcone>
          </Campo>
        )}
        <p className="cw-ajuda">
          {t(
            "Vale só para conversas que nascem desta campanha: quem já falava com você continua com quem o atendia. Quem aborda precisa saber dizer de onde veio o contato.",
          )}
        </p>
      </section>
    </>
  );
}

function CardDoFunil({
  prefixo,
  icone: Icone,
  titulo,
  descricao,
  cores,
  funis,
  funil,
  etapa,
  desligado,
  onFunil,
  onEtapa,
}: {
  prefixo: string;
  icone: LucideIcon;
  titulo: string;
  descricao: string;
  cores: { c: string; bg: string; borda: string };
  funis: FunilDaCampanha[];
  funil: string;
  etapa: string;
  desligado: boolean;
  onFunil: (v: string) => void;
  onEtapa: (v: string) => void;
}) {
  const t = useT();
  const etapas = etapasAbertas(useEtapas(funil || null).data);
  // Sem etapa escolhida, o contato entra na primeira etapa do funil.
  const efetiva = etapa || etapas[0]?.id || "";
  const estilo = { "--c": cores.c, "--c-bg": cores.bg, "--c-borda": cores.borda } as CSSProperties;
  return (
    <div className="cw-card-funil" style={estilo} data-testid={`progresso-${prefixo}`}>
      <div className="cw-card-funil-topo">
        <span className="cw-card-funil-icone" aria-hidden>
          <Icone size={16} />
        </span>
        <div>
          <div className="cw-card-funil-titulo">{titulo}</div>
          <div className="cw-opcao-desc">{descricao}</div>
        </div>
      </div>
      <div className="cw-selects-funil">
        <SelectComIcone
          id={`${prefixo}-funil`}
          valor={funil}
          onChange={onFunil}
          desligado={desligado}
          rotulo={t("Funil")}
        >
          <option value="">{t("Nenhum (opcional)")}</option>
          {funis.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </SelectComIcone>
        <SelectComIcone
          id={`${prefixo}-etapa`}
          valor={etapa}
          onChange={onEtapa}
          desligado={desligado || !funil}
          rotulo={t("Etapa")}
          classe={funil ? "cw-etapa-escolhida" : ""}
        >
          <option value="">{funil ? t("Primeira etapa do funil") : t("Etapa")}</option>
          {etapas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </SelectComIcone>
      </div>
      {funil && etapas.length > 0 && (
        <div className="cw-mini-trilho" role="group" aria-label={t("Etapas do funil")}>
          {etapas.map((e) => (
            <button
              key={e.id}
              type="button"
              aria-pressed={efetiva === e.id}
              title={e.name}
              disabled={desligado}
              onClick={() => onEtapa(e.id)}
            >
              {e.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
