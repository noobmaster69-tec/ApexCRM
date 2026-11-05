"use client";

import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";

import type { Locale } from "date-fns";
import { formatDistanceToNowStrict } from "date-fns";
import { useT } from "@/hooks/i18n/useT";
import { Check, Robot, Sparkle } from "@/lib/ui/icons";
import { ChannelLogo } from "@/components/inbox/ChannelLogo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Contact, FileText, IconeImagem, MapPin, Mic, Sticker, Video } from "./icones";
import { telefoneLegivel } from "@/lib/inbox/telefone-legivel";
import { comandoDaConversa, esperaDaConversa } from "@/lib/inbox/comando-da-conversa";
import { cn } from "@/lib/utils";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";
import { nomeDoContato, rotuloParaAEquipe } from "@/lib/contacts/rotulo-do-contato";
import { initials, relativeTime } from "@/lib/contacts/apresentacao-na-lista";
import { phoneForDisplay } from "@/lib/channels/phone-variants";
import { rotuloDoCanalDaConversa } from "@/lib/channels/estado";

interface Props {
  conversation: ConversationWithContact;
  isSelected: boolean;
  onSelect: (id: string) => void;
  /** Posição 1-based na fila (G5-03). Presente só na visão Fila. */
  queuePosition?: number;
  /**
   * Mostrar POR ONDE a conversa entrou.
   *
   * Só com mais de um número conectado. Com um só, o rótulo seria a mesma
   * palavra em toda linha da lista — ruído que ensina o olho a ignorar a área
   * onde vivem os avisos que importam (bloqueado, tags).
   */
  mostrarCanal?: boolean;
  /**
   * Mostrar QUEM está no comando de cada conversa.
   *
   * Mesma regra do canal, e pelo mesmo motivo: só quando o rótulo DISCRIMINA. Nas
   * abas "Fila" (todas sem dono), "Minhas" (todas do mesmo dono) e "IA" o badge
   * seria a mesma palavra em toda linha — ruído que ensina o olho a ignorar a
   * área onde vivem os avisos que importam. Quem decide é a lista, que é quem
   * sabe quantos donos distintos ela tem.
   */
  mostrarAtendente?: boolean;
  /**
   * Mostrar o ícone de robô na prévia da mensagem, quando quem manda é o
   * automático. Mesma regra dos dois badges acima: só quando DISCRIMINA. Na
   * aba "Automático" toda linha já é robô, e o ícone repetido em cada uma vira
   * ruído. Ausente ou `true` = mostra (comportamento anterior, seguro para o
   * teste que não passa esta prop).
   */
  mostrarAutomatico?: boolean;
  /**
   * A org tem atendimento automático de pé? Vem por PROP e não por hook: um hook
   * por linha faria 50 assinaturas de query na mesma lista para responder a MESMA
   * pergunta org-wide. `undefined` = "não sei", e a função trata isso como "não
   * afirme nada".
   */
  automaticoDaOrg?: boolean;
  /**
   * Marca esta linha no lote (#2484, F1). Presente só quando a seleção
   * múltipla está ligada — sem ela a caixa não aparece, e a lista continua
   * sendo o que era.
   */
  selecionado?: boolean;
  /**
   * Liga o modo de seleção: com esta prop a linha ganha a caixa de marcação.
   * A ação da caixa é SEPARADA do clique na linha — quem marca não abre a
   * conversa, e quem abre não marca.
   */
  onAlternarSelecao?: (id: string) => void;
  /**
   * Marca (ou desmarca) ESTA conversa como exemplo para o agente aprender
   * (#3006). Presente = a linha monta o controle; AUSENTE = a linha é
   * exatamente a que era, sem controle nenhum e sem selo — é o que mantém os
   * testes que renderizam a linha sozinha, e a lista que não oferece a ação.
   *
   * A CHAMADA À ROTA NÃO MORA AQUI, e isso é de propósito. Vem por prop, como
   * o `automaticoDaOrg`: uma resposta por lista, não por linha — e, medido, a
   * linha é renderizada sem `QueryClientProvider` em vários testes do repo, o
   * que faria um `useQueryClient()` aqui dentro derrubar todos eles com "No
   * QueryClient set". Quem faz o `POST .../usable-for-rag` é a lista.
   */
  onAlternarExemplo?: (id: string, enabled: boolean) => void;
}

/**
 * "Aguardando há 5 min" — desde quando o cliente ESPERA.
 *
 * A régua é `esperaDaConversa`, a mesma `awaiting_since` que ordena a Fila
 * (#990): `last_inbound_at` é a ÚLTIMA mensagem do cliente, então a pílula de
 * quem insistia voltava para "há 1 min" a cada mensagem dele — o tempo na linha
 * contradizia a posição do lado e a ordem da lista. O fallback segue sendo a
 * criação, para a conversa que nunca recebeu mensagem.
 */
function waitingLabel(
  conversation: ConversationWithContact,
  t: (texto: string) => string = (texto) => texto, locale: Locale,
): string {
  const since = esperaDaConversa(conversation);
  if (!since) return t("Aguardando");
  return `${t("Aguardando")} ${formatDistanceToNowStrict(new Date(since), { addSuffix: true, locale: locale })}`;
}

export function ConversationListItem({
  conversation,
  isSelected,
  onSelect,
  queuePosition,
  mostrarCanal,
  mostrarAtendente,
  mostrarAutomatico = true,
  automaticoDaOrg,
  selecionado = false,
  onAlternarSelecao,
  onAlternarExemplo,
}: Props) {
  const localeDaData = useLocaleDeData();
  const t = useT();
  const c = conversation.contacts ?? null;
  const displayName = rotuloParaAEquipe(c, t);
  const phoneFallback = c?.phone_number ? phoneForDisplay(c.phone_number) : "??";
  const tags = c?.tags ?? [];
  const preview = conversation.last_message_preview?.trim() || t("Sem mensagens");
  const truncated = preview.length > 60 ? `${preview.slice(0, 60)}…` : preview;
  const naFila = queuePosition !== undefined;
  /**
   * A HORA DO CANTO RESPONDE À MESMA PERGUNTA QUE ORDENA A LISTA.
   *
   * Na Fila a lista sai por TEMPO DE ESPERA (`ORDEM_DA_ESPERA`: `awaiting_since`
   * crescente — a mensagem mais antiga sem resposta, #990), mas a hora do canto era
   * sempre a da última mensagem de QUALQUER lado. Bastava o atendente responder para o número daquela linha pular para
   * agora sem que a linha saísse do lugar: lida de cima para baixo, a coluna de
   * horas saía fora de ordem (#464 — "a lista parece aleatória") embaixo de uma
   * lista que estava certa.
   *
   * Fora da Fila a ordem é por atividade recente, e aí a última mensagem de
   * qualquer lado É a resposta certa — a régua do relógio segue a régua da lista.
   *
   * A origem é a MESMA da pílula "Aguardando há…" (`waitingLabel`), inclusive no
   * fallback: duas respostas para o mesmo "desde quando?" na mesma linha, a 40px
   * de distância, seriam a próxima divergência.
   */
  const horaDaOrdem = naFila
    ? esperaDaConversa(conversation)
    : conversation.last_message_at;
  const time = relativeTime(horaDaOrdem, localeDaData);
  const unread = conversation.unread_count_for_assignee ?? 0;


  /**
   * Quem manda, pela MESMA regra do cabeçalho.
   *
   * `status === 'ai_handling'` era um proxy ruim e foi medido: o único escritor
   * desse status em produção é o botão "Devolver ao automático", então o ícone de
   * robô aparecia só em conversa que já tinha sido escalada E devolvida — nunca
   * na que o automático atendeu do começo ao fim, que é a maioria.
   */
  const { comando } = comandoDaConversa({
    status: conversation.status,
    assigned_to_user_id: conversation.assigned_to_user_id,
    assigned_to_user_name: conversation.assigned_to_user_name ?? null,
    assignee_kind: conversation.assignee_kind ?? null,
    bot_silenced_until: conversation.bot_silenced_until ?? null,
    last_handoff_reason: conversation.last_handoff_reason ?? null,
    force_human: c?.force_human ?? null,
    is_blocked: c?.is_blocked ?? null,
    is_group: conversation.is_group ?? false,
    automaticoDaOrg,
  });
  const isAi = comando.quem === "automatico";

  // QUEM MANDA ESTA CONVERSA — o número DA EMPRESA por onde ela chegou, não o
  // do cliente. Com dois canais é o que decide o tom da resposta e qual número
  // a pessoa vê respondendo.
  //
  // #2383: quando o canal tem nome ou número, o texto é o MESMO do card da tela
  // de canais (`/app/connections`), com o nome amigável na frente — antes o
  // número vencia o nome, e um canal chamado "Peças" saía na lista como o
  // número cru. Sem canal associado (grupo, conversa sem sessão, não-WA) e sem
  // nome E sem número o badge continua não existindo, como estava.
  const canal = conversation.channel_sessions ?? null;
  const rotuloCanal = rotuloDoCanalDaConversa(canal, t);

  /**
   * A CONVERSA MARCADA COMO EXEMPLO PARA O AGENTE (#3006).
   *
   * `usable_for_rag` é a coluna que a rota `usable-for-rag` liga; quem a traz
   * para cá é o `SELECT_COLS` da lista. Os dois rótulos são literais `t()`
   * separados — a cerca de espanhol cobra chave por chave, e uma escolha
   * ternária dentro do `t()` ficaria invisível para ela.
   */
  const exemploMarcado = Boolean(conversation.usable_for_rag);
  const rotuloExemplo = exemploMarcado
    ? t("Deixar de usar como exemplo")
    : t("Usar como exemplo para a IA");

  // Tags, número de entrada e atendente saíram da linha (ficavam como chips
  // embaixo da prévia) e passaram para a dica do selo do canal — a linha fica
  // com duas leituras só: quem e o quê. A ficha do contato mostra o resto.
  const dicaDoCanal = [
    mostrarCanal && rotuloCanal ? `${t("Entrou por")} ${rotuloCanal}` : null,
    mostrarAtendente && comando.quem === "humano" ? `${t("Atendido por")} ${comando.nome ?? t("Atendente")}` : null,
    tags.length > 0 ? `${t("Tags")}: ${tags.join(", ")}` : null,
    exemploMarcado ? t("Exemplo para a IA") : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const midia = midiaDaPrevia(preview);
  // Sem nome de gente, o número formatado ("+55 19 2042-5772") no lugar do cru.
  const nomeVisivel = nomeDoContato(c) ? displayName : c?.phone_number ? telefoneLegivel(c.phone_number) : displayName;

  return (
    <div
      className={cn(
        "relative flex w-full items-start rounded-[10px]",
        selecionado && "bg-ibx-accent-active-bg",
      )}
    >
      {/*
        A CAIXA DE SELEÇÃO (1.99, #2484) — fora do botão da linha, de propósito:
        controle interativo dentro de `<button>` é HTML inválido, e o clique na
        caixa NÃO pode abrir a conversa. Marcar e abrir são gestos diferentes.
      */}
      {onAlternarSelecao && (
        <button
          type="button"
          role="checkbox"
          aria-checked={selecionado}
          aria-label={t("Selecionar conversa")}
          title={t("Selecionar conversa")}
          data-testid={`selecao-em-lote-${conversation.id}`}
          onClick={() => onAlternarSelecao(conversation.id)}
          className={cn(
            "ml-2 mt-[22px] flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
            "focus-visible:outline-2 focus-visible:outline-ibx-accent",
            selecionado
              ? "border-ibx-accent bg-ibx-accent text-white"
              : "border-ibx-border-hover bg-ibx-pane hover:bg-ibx-field",
          )}
        >
          {selecionado && <Check size={12} weight="bold" aria-hidden />}
        </button>
      )}
    <button
      type="button"
      data-conversation-id={conversation.id}
      onClick={() => onSelect(conversation.id)}
      className={cn(
        "group relative flex min-w-0 flex-1 items-start gap-3 rounded-[10px] p-2.5 text-left transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ibx-accent",
        isSelected ? "bg-ibx-accent-active-bg" : selecionado ? "hover:bg-transparent" : "hover:bg-ibx-field",
      )}
      aria-current={isSelected ? "true" : undefined}
      data-comando={comando.quem}
    >
      <div className="relative shrink-0">
        <Avatar className="h-10 w-10">
          {/* Só monta a <img> quando existe arquivo: sem isso o browser pediria
              a rota para TODO contato da lista e levaria 404 em cada um sem
              foto — que é a maioria. O AvatarFallback do Radix já cobre o caso
              de a imagem não carregar, então as iniciais nunca somem. */}
          {c?.avatar_storage_path && !c?.is_anonymized ? (
            <AvatarImage
              src={`/api/v1/contacts/${c.id}/avatar`}
              alt=""
              className="object-cover"
            />
          ) : null}
          <AvatarFallback
            className={cn(
              "text-[12px] font-semibold",
              isSelected ? "bg-ibx-avatar-sel-bg text-ibx-avatar-sel-fg" : "bg-ibx-chip text-ibx-text-2",
            )}
          >
            {initials(displayName, phoneFallback)}
          </AvatarFallback>
        </Avatar>
        <span
          className="absolute -bottom-0.5 -right-0.5 flex h-[14px] w-[14px] items-center justify-center rounded-full border-2 border-ibx-pane bg-ibx-pane"
          title={dicaDoCanal || undefined}
        >
          <ChannelLogo channel={canal} size={10} className="h-[10px] w-[10px]" />
        </span>
      </div>

      <div className="min-w-0 flex-1">
        {naFila && (
          <div className="mb-1 flex items-center gap-1.5">
            <span
              className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-ibx-chip px-1 font-inbox-mono text-[10px] font-medium tabular-nums text-ibx-accent-text"
              aria-label={`${t("Posição")} ${queuePosition} ${t("na fila")}`}
            >
              {queuePosition}º
            </span>
            <span className="text-[11px] text-ibx-muted">
              {waitingLabel(conversation, t, localeDaData)}
            </span>
          </div>
        )}
        <div className="flex items-baseline justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              className={cn(
                "truncate text-[14px] text-ibx-text",
                unread > 0 ? "font-semibold" : "font-medium",
                c?.is_anonymized && "font-normal italic text-ibx-muted",
              )}
            >
              {nomeVisivel}
            </span>
            {/* A etiqueta "Grupo" ao lado do nome: sem ela a lista não distingue
                um grupo de uma conversa individual até abrir a conversa. */}
            {conversation.is_group && (
              <Badge variant="secondary" className="h-4 shrink-0 bg-ibx-chip px-1.5 text-[10px] text-ibx-text-2">
                {t("Grupo")}
              </Badge>
            )}
          </span>
          <span
            className={cn(
              "shrink-0 font-inbox-mono text-[11px] tabular-nums",
              unread > 0 ? "text-ibx-accent-text" : "text-ibx-muted",
            )}
            // Na Fila é "desde quando o cliente ESPERA" (#990), nas outras é "há
            // quanto tempo a conversa mexeu". O rótulo existe só onde a leitura muda.
            title={naFila ? t("Desde quando o cliente espera resposta") : undefined}
          >
            {time}
          </span>
        </div>

        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p
            className={cn(
              "flex min-w-0 items-center gap-1 truncate text-[13px]",
              unread > 0 ? "text-ibx-unread" : "text-ibx-muted",
            )}
          >
            {isAi && mostrarAutomatico ? (
              <Robot size={12} weight="duotone" className="shrink-0" aria-hidden />
            ) : null}
            {midia ? (
              <>
                <midia.Icone size={13} className="shrink-0" aria-hidden />
                <span className="truncate">{t(midia.rotulo)}</span>
              </>
            ) : (
              <span className="truncate">{truncated}</span>
            )}
          </p>
          {unread > 0 && (
            <span className="inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-ibx-accent px-1.5 font-inbox-mono text-[10px] font-semibold tabular-nums text-white">
              {unread}
            </span>
          )}
        </div>

        {(c?.is_blocked || c?.is_anonymized) && (
          <div className="mt-1 flex items-center gap-1">
            {c?.is_blocked && (
              <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">
                {t("Bloqueado")}
              </Badge>
            )}
            {c?.is_anonymized && (
              <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                {t("Anonimizado")}
              </Badge>
            )}
          </div>
        )}
      </div>
      </button>
      {/*
        O CONTROLE DE "EXEMPLO PARA A IA" (#3006) fica FORA do botão da linha,
        como a caixa de seleção logo acima e pelo mesmo motivo: controle
        interativo dentro de `<button>` é HTML inválido, e marcar não pode abrir
        a conversa. O gesto de marcar é separado do gesto de abrir.

        Fica sempre visível, e não só no hover: o defeito que esta issue
        conserta é justamente um recurso que ninguém achava. Um ícone que só
        aparece sob o cursor continuaria escondido no celular, onde não há
        hover — e o alvo de toque é maior do que o desenho sugere.

        Desmarcado usa `text-text-muted`, não `text-text-subtle`: é componente
        gráfico e precisa de 3:1 contra o fundo da linha. Medido na prova de
        tela, subtle dava 2,81:1 no escuro (#605e54 sobre #161510). Muted, no
        pior fundo de cada tema (linha selecionada, `bg-accent-soft`): 5,74:1 no
        claro (#5d594f sobre #e4ebe0) e 4,23:1 no escuro (#8e8b7f sobre #272b20).
      */}
      {onAlternarExemplo && (
        <button
          type="button"
          data-testid={`exemplo-ia-${conversation.id}`}
          aria-pressed={exemploMarcado}
          aria-label={rotuloExemplo}
          title={rotuloExemplo}
          onClick={() => onAlternarExemplo(conversation.id, !exemploMarcado)}
          className={cn(
            "mr-1 mt-2.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-sm transition-colors",
            "focus-visible:outline-2 focus-visible:outline-ibx-accent",
            exemploMarcado
              ? "text-ibx-accent hover:bg-ibx-accent-active-bg"
              : "text-ibx-muted hover:bg-ibx-field hover:text-ibx-text",
          )}
        >
          <Sparkle size={14} weight={exemploMarcado ? "fill" : "regular"} aria-hidden />
        </button>
      )}
    </div>
  );
}

/**
 * A prévia de mídia chega como `[image]`, `[audio]`… (o tipo da mensagem entre
 * colchetes, gravado na ingestão). Na lista ela vira ícone + palavra.
 */
const MIDIAS: Record<string, { Icone: typeof Mic; rotulo: string }> = {
  image: { Icone: IconeImagem, rotulo: "Imagem" },
  audio: { Icone: Mic, rotulo: "Áudio" },
  ptt: { Icone: Mic, rotulo: "Áudio" },
  voice: { Icone: Mic, rotulo: "Áudio" },
  video: { Icone: Video, rotulo: "Vídeo" },
  document: { Icone: FileText, rotulo: "Documento" },
  file: { Icone: FileText, rotulo: "Documento" },
  sticker: { Icone: Sticker, rotulo: "Figurinha" },
  location: { Icone: MapPin, rotulo: "Localização" },
  contact: { Icone: Contact, rotulo: "Contato" },
  vcard: { Icone: Contact, rotulo: "Contato" },
};
export function midiaDaPrevia(previa: string): { Icone: typeof Mic; rotulo: string } | null {
  const m = /^\[([a-z_]+)\]$/i.exec(previa.trim());
  return m ? (MIDIAS[m[1]!.toLowerCase()] ?? null) : null;
}
