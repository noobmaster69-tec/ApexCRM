"use client";
/**
 * PASSO 1 — INFORMAÇÕES: o nome (o mesmo do título do cabeçalho), o número que
 * envia (um card por conexão; com mais de 4, select com busca), os números do
 * rodízio e a base legal.
 */
import { Info, MessageCircle, Scale, Search, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { channelLabel, type ChannelSession } from "@/hooks/channels/useChannelSessions";
import { useT } from "@/hooks/i18n/useT";

import { CartaoDeOpcao, Campo, ErroDoCampo, GrupoDeOpcoes, SelectComIcone, Secao } from "./base";
import { mudarCampo, type PropsDoPasso } from "./contexto";

type Situacao = "ok" | "off" | "aquecendo";

/** Conectado, desconectado ou aquecendo — pelo estado do transporte e pelo aquecimento. */
export function situacaoDoCanal(c: Pick<ChannelSession, "status" | "is_warmup_complete" | "metadata">): Situacao {
  if (c.metadata?.disabled === true || c.status !== "WORKING") return "off";
  return c.is_warmup_complete === false ? "aquecendo" : "ok";
}

const ROTULO_DA_SITUACAO: Record<Situacao, string> = {
  ok: "Conectado",
  off: "Desconectado",
  aquecendo: "Aquecendo",
};

export function PassoInformacoes({
  v,
  setV,
  erro,
  canais,
  comModelo,
}: PropsDoPasso & { canais: ChannelSession[]; comModelo: boolean }) {
  const t = useT();
  const mudar = mudarCampo(setV);
  const [busca, setBusca] = useState("");
  // Cada número tem os próprios modelos: o escolhido no outro não vale aqui.
  const escolherCanal = (id: string) =>
    setV((a) => ({ ...a, canal: id, modelo: a.canal === id ? a.modelo : null, extras: a.extras.filter((x) => x !== id) }));
  const selecionavel = (c: ChannelSession) => situacaoDoCanal(c) !== "off" || c.id === v.canal;
  const comBusca = canais.length > 4;
  const filtrados = comBusca
    ? canais.filter((c) =>
        `${channelLabel(c, t)} ${c.phone_number ?? ""}`.toLowerCase().includes(busca.trim().toLowerCase()),
      )
    : canais;

  return (
    <Secao
      icone={Info}
      cor="#93b0ff"
      fundo="#152248"
      titulo={t("Informações")}
      subtitulo={t("Isto cria um rascunho. Nada é enviado antes de você preparar a lista e iniciar.")}
    >
      <Campo id="nome" rotulo={t("Nome da campanha")} erro={erro("nome")}>
        <input
          id="nome"
          className="cw-input cw-input-grande"
          value={v.nome}
          maxLength={200}
          onChange={(e) => mudar("nome", e.target.value)}
          placeholder={t("Ex.: Reativação de clientes parados")}
          aria-invalid={!!erro("nome") || undefined}
          aria-describedby={erro("nome") ? "nome-erro" : undefined}
        />
      </Campo>

      <div className="cw-campo" data-campo="canal">
        <span className="cw-rotulo" id="canal-rotulo">
          {t("Enviar pelo número")}
        </span>
        {canais.length === 0 ? (
          <p className="cw-aviso">
            <Info size={14} aria-hidden />
            {t("Nenhum número conectado. Conecte um em Conexões antes de criar a campanha.")}
          </p>
        ) : comBusca ? (
          <div className="cw-grade-2">
            <div className="cw-com-icone">
              <Search size={15} aria-hidden />
              <input
                aria-label={t("Buscar número")}
                placeholder={t("Buscar número")}
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <SelectComIcone
              id="canal"
              icone={MessageCircle}
              valor={v.canal}
              onChange={escolherCanal}
              rotulo={t("Enviar pelo número")}
            >
              <option value="">{t("Escolha um número")}</option>
              {filtrados.map((c) => {
                const s = situacaoDoCanal(c);
                return (
                  <option key={c.id} value={c.id} disabled={!selecionavel(c)}>
                    {`${channelLabel(c, t)}${c.phone_number && c.display_name ? ` · ${c.phone_number}` : ""} — ${t(ROTULO_DA_SITUACAO[s])}`}
                  </option>
                );
              })}
            </SelectComIcone>
          </div>
        ) : (
          <GrupoDeOpcoes
            id="canal"
            rotulo={t("Enviar pelo número")}
            classe="cw-grade-2"
            valores={canais.map((c) => c.id)}
            valor={v.canal}
            onChange={escolherCanal}
          >
            {canais.map((c) => {
              const s = situacaoDoCanal(c);
              return (
                <CartaoDeOpcao
                  key={c.id}
                  valor={c.id}
                  selecionado={v.canal === c.id}
                  onEscolher={() => escolherCanal(c.id)}
                  desabilitado={!selecionavel(c)}
                  dica={!selecionavel(c) ? t("Reconecte em Conexões") : undefined}
                  icone={MessageCircle}
                  cores={{ iconeBg: "#0f2a1d", icone: "#3ecf8e" }}
                  titulo={channelLabel(c, t)}
                  descricao={c.phone_number && c.display_name ? <span className="cw-mono">{c.phone_number}</span> : undefined}
                  direita={
                    <span className="cw-opcao-numero">
                      <span className="cw-status" data-s={s}>
                        {t(ROTULO_DA_SITUACAO[s])}
                      </span>
                      {c.daily_message_limit > 0 && (
                        <span className="cw-ajuda" style={{ fontSize: 11 }}>
                          {t("até {n} envios/dia").replace("{n}", c.daily_message_limit.toLocaleString())}
                        </span>
                      )}
                    </span>
                  }
                  radioAntes
                  testid={`canal-${c.id}`}
                />
              );
            })}
          </GrupoDeOpcoes>
        )}
        <ErroDoCampo id="canal" texto={erro("canal")} />
      </div>

      {comModelo && canais.length > 1 && (
        <p className="cw-ajuda">
          {t("Campanha com modelo aprovado sai por um número só: cada número tem os próprios modelos na plataforma.")}
        </p>
      )}
      {!comModelo && v.canal && canais.filter((c) => c.id !== v.canal).length > 0 && (
        <div className="cw-campo">
          <span className="cw-rotulo">
            {t("Falar também por estes números")}
            <small>{t("opcional")}</small>
          </span>
          <p className="cw-ajuda">
            {t(
              "A campanha reveza entre os números marcados, escolhendo a cada envio o que tem mais folga no teto do dia. Quem já conversa com você por um deles recebe por esse mesmo, para não chegar de um número desconhecido.",
            )}
          </p>
          <div className="cw-grade-2">
            {canais
              .filter((c) => c.id !== v.canal)
              .map((c) => {
                const marcado = v.extras.includes(c.id);
                const pode = selecionavel(c) || marcado;
                return (
                  <label
                    key={c.id}
                    className="cw-opcao"
                    aria-disabled={!pode || undefined}
                    title={!pode ? t("Reconecte em Conexões") : undefined}
                    style={marcado ? { background: "var(--cw-sel-bg)", borderColor: "var(--cw-sel-border)" } : undefined}
                  >
                    <input
                      type="checkbox"
                      checked={marcado}
                      disabled={!pode}
                      onChange={(e) =>
                        setV((a) => ({
                          ...a,
                          extras: e.target.checked ? [...a.extras, c.id] : a.extras.filter((id) => id !== c.id),
                        }))
                      }
                      style={{ accentColor: "#3d72ff", width: 16, height: 16 }}
                    />
                    <span className="cw-opcao-texto">
                      <span className="cw-opcao-titulo">{channelLabel(c, t)}</span>
                      {c.phone_number && c.display_name && <span className="cw-opcao-desc cw-mono">{c.phone_number}</span>}
                    </span>
                    <span className="cw-status" data-s={situacaoDoCanal(c)}>
                      {t(ROTULO_DA_SITUACAO[situacaoDoCanal(c)])}
                    </span>
                  </label>
                );
              })}
          </div>
          {v.extras.length > 0 && (
            <p className="cw-ajuda">
              {t(
                "Atenção: o intervalo e os tetos da CAMPANHA somam todos os números. Para o rodízio aumentar o volume, deixe o ritmo da campanha em branco e cada número usa o dele.",
              )}
            </p>
          )}
        </div>
      )}

      <div className="cw-campo">
        <span className="cw-rotulo">{t("Base legal do envio")}</span>
        <p className="cw-ajuda">
          {t("Quem recebe pode perguntar por que recebeu, e a resposta precisa existir antes do envio.")}
        </p>
        <GrupoDeOpcoes
          rotulo={t("Base legal do envio")}
          classe="cw-grade-2"
          valores={["consent", "legitimate_interest"]}
          valor={v.baseLegal}
          onChange={(x) => mudar("baseLegal", x as typeof v.baseLegal)}
        >
          <CartaoDeOpcao
            valor="consent"
            topo
            selecionado={v.baseLegal === "consent"}
            onEscolher={() => mudar("baseLegal", "consent")}
            icone={ShieldCheck}
            titulo={t("Consentimento")}
            descricao={t(
              "Estas pessoas pediram para receber. Impede o envio para contatos sem consentimento registrado no perfil.",
            )}
            testid="base-consentimento"
          />
          <CartaoDeOpcao
            valor="legitimate_interest"
            topo
            selecionado={v.baseLegal === "legitimate_interest"}
            onEscolher={() => mudar("baseLegal", "legitimate_interest")}
            icone={Scale}
            titulo={t("Interesse legítimo")}
            descricao={t("Com avaliação (LIA) registrada.")}
            testid="base-interesse"
          />
        </GrupoDeOpcoes>
      </div>

      {v.baseLegal === "legitimate_interest" && (
        <Campo id="lia" rotulo={t("Referência da avaliação (LIA)")} erro={erro("lia")}>
          <input
            id="lia"
            className="cw-input"
            value={v.liaRef}
            onChange={(e) => mudar("liaRef", e.target.value)}
            placeholder={t("Ex.: LIA-2026-01")}
            aria-invalid={!!erro("lia") || undefined}
            aria-describedby={erro("lia") ? "lia-erro" : undefined}
          />
        </Campo>
      )}
    </Secao>
  );
}
