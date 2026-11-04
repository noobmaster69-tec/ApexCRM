"use client";
import { useState, type RefObject } from "react";
import { useT } from "@/hooks/i18n/useT";
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
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { JanelaSelo } from "@/components/inbox/JanelaSelo";
import { Archive, ArrowRightLeft, Check, Hand, PanelRight, Search } from "./icones";
import { BOTAO_DO_GRUPO } from "./estilo";
import { SeloDeIdiomas } from "./SeloDeIdiomas";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/contacts/apresentacao-na-lista";
import { telefoneLegivel } from "@/lib/inbox/telefone-legivel";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useClaimConversation } from "@/hooks/inbox/useClaimConversation";
import { useReleaseConversation } from "@/hooks/inbox/useReleaseConversation";
import {
  useMarkPersonalContact,
  useUnmarkPersonalContact,
} from "@/hooks/contacts/usePersonalContact";
import { ROLE_RANK } from "@/lib/auth/types";
import {
  useArchiveConversation,
  useCloseConversation,
  useReopenConversation,
} from "@/hooks/inbox/useCloseConversation";
import { useResumeAiAttendance } from "@/hooks/inbox/useResumeAiAttendance";
import { usePauseAiAttendance } from "@/hooks/inbox/usePauseAiAttendance";
import { useAutomaticoAtivo } from "@/hooks/ai/useAutomaticoAtivo";
import { comandoDaConversa, ROTULO_DO_MOTIVO } from "@/lib/inbox/comando-da-conversa";
import { ReassignDialog } from "@/components/inbox/ReassignDialog";
import { SnoozeButton } from "@/components/inbox/SnoozeButton";
import { DispararFluxoButton } from "@/components/inbox/DispararFluxoButton";
import { FaixaDaCarteira } from "@/components/inbox/FaixaDaCarteira";
import { ParticipantesDaConversa } from "@/components/inbox/ParticipantesDaConversa";
import { DialButton } from "@/components/voice/DialButton";
import { VideoCallButton } from "@/components/inbox/VideoCallButton";
import { ReservarServicoNaConversa } from "@/components/agenda/ReservarServicoNaConversa";
import { motivoDoContato } from "@/lib/inbox/motivo-do-envio-bloqueado";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";

interface Props {
  conversation: ConversationWithContact;
  /**
   * A busca DENTRO da conversa (#1793): abre um campo que filtra só as
   * mensagens já carregadas. O ref devolve o foco a este botão quando o campo
   * fecha — senão o Esc largava o foco no `body`.
   */
  onBuscar?: () => void;
  buscaAberta?: boolean;
  botaoBuscaRef?: RefObject<HTMLButtonElement | null>;
  /** Seleciona outra conversa no Inbox — a aba Número do Transferir abre a do outro número. */
  onAbrirConversa?: (id: string) => void;
  /** O painel do contato (coluna da direita) está aberto? */
  painelAberto?: boolean;
  /** Recolhe/abre o painel do contato. Ausente = sem o botão (drawer do funil). */
  onAlternarPainel?: () => void;
}

/**
 * O CHIP NOMEIA CICLO DE VIDA, NÃO COMANDO.
 *
 * Ele afirmava quem manda — "Automático atendendo", "Aguardando atendente" — a
 * 20px de um selo que responde a MESMA pergunta por outra fonte, e as duas se
 * contradiziam na tela: `conversations.status` não acompanha silêncio, trava de
 * contato nem atribuição, e o motor nunca o lê. Medido em 2026-08-30 num print
 * do dono: "Aguardando atendente" e "Automático" no mesmo cabeçalho.
 *
 * Quem responde "quem manda" é o `OwnerBadge`, que vem de `comandoDaConversa`.
 * Aqui fica só o que o status realmente sabe: o episódio está aberto ou acabou.
 *
 * Cobre os SETE valores do CHECK de propósito — o call site é
 * `t(STATUS_LABEL[status] ?? status)`, e um buraco imprime o token cru em inglês
 * no rosto do atendente. Vigiado pelo invariante de espelho.
 */
const STATUS_LABEL: Record<string, string> = {
  open: "Aberta",
  pending: "Aberta",
  claimed: "Aberta",
  ai_handling: "Aberta",
  resolved: "Resolvida",
  closed: "Fechada",
  archived: "Arquivada",
};

export function ConversationHeader({
  conversation,
  onAbrirConversa,
  onBuscar,
  buscaAberta,
  botaoBuscaRef,
  painelAberto,
  onAlternarPainel,
}: Props) {
  const t = useT();
  const { user, activeOrg } = useAuth();
  const claim = useClaimConversation();
  const release = useReleaseConversation();
  const close = useCloseConversation();
  const reopen = useReopenConversation();
  const arquivar = useArchiveConversation();
  const retomar = useResumeAiAttendance();
  const pausar = usePauseAiAttendance();
  // "Existe automático nesta org?" — sem isto o selo afirmava que o robô estava
  // atendendo em instalação que nunca configurou agente nenhum.
  const automaticoDaOrg = useAutomaticoAtivo();
  const [reassignOpen, setReassignOpen] = useState(false);
  const [confirmFecharOpen, setConfirmFecharOpen] = useState(false);
  /**
   * A ESCOLHA AO FECHAR (#3313, item 1), e ela começa MARCADA em "devolver".
   *
   * O padrão não é preferência de produto: é o desfecho que a operação espera
   * ao fechar. Medido na issue — a equipe fechava conversas achando que a trava
   * de humano tinha ido embora com elas, e a próxima mensagem daquele cliente,
   * dias depois, ficava sem resposta da IA. "Manter com a equipe" continua a um
   * clique e é relembrado a cada abertura do diálogo (quem escolheu manter na
   * conversa anterior não deve ver a escolha já virada na seguinte).
   */
  const [devolverAoFechar, setDevolverAoFechar] = useState(true);
  const [confirmArquivarOpen, setConfirmArquivarOpen] = useState(false);
  const [confirmPessoalOpen, setConfirmPessoalOpen] = useState(false);

  const c = conversation.contacts ?? null;
  const displayName = rotuloDoContato(c, t);
  const phone = c?.phone_number ? telefoneLegivel(c.phone_number) : null;
  const status = conversation.status;
  const isMineAssigned = conversation.assigned_to_user_id === user.id;
  const isOpen = status === "open" || conversation.assigned_to_user_id == null;

  // Marcar/desmarcar pessoal (spec 21, etapa 15 — botão no cabeçalho).
  //
  // GERENTE pode (spec decisão 1, D3): pessoal é decisão operacional — esconder
  // uma conversa da operação. Desbloquear exige ADMIN porque reabre um canal
  // que o cliente fechou (direito do titular, LGPD): dois gestos parecidos,
  // dois gates diferentes, cada um com seu motivo.
  //
  // Os hooks ficam AQUI, antes de qualquer early return (a ordem dos hooks não
  // pode mudar entre renderizações); com contato ausente o id vazio nunca
  // dispara porque o botão nem é desenhado.
  const ehPessoal = c?.is_personal === true;
  /**
   * A TRAVA DE HUMANO MORA NO CONTATO, não na conversa (1.99) — fechar a
   * conversa não a solta. Enquanto `force_human` for `true`, o motor continua
   * vetando a IA; o diálogo de fechar pergunta sobre ela só quando existe.
   */
  const contatoTravadoComEquipe = c?.force_human === true;
  const podeMarcarPessoal =
    (user.is_platform_admin && !user.support) ||
    (activeOrg != null && ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager);
  /**
   * ATENDIMENTO CONJUNTO (#2542): quem pode CONVIDAR é o dono da conversa ou um
   * gestor+ — exatamente o gate da rota. A tela não oferece o que a rota recusa:
   * um botão que devolve 403 é pior que um botão que não existe, porque a pessoa
   * descobre o limite depois de escolher o colega na lista. Não é gate de
   * SEGURANÇA (esse mora na rota, que revalida papel e organização): é o mesmo
   * desenho de `podeMarcarPessoal`, que também espelha a régua do servidor.
   */
  const podeConvidar =
    isMineAssigned ||
    (user.is_platform_admin && !user.support) ||
    (activeOrg != null && ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager);
  const marcarPessoal = useMarkPersonalContact(c?.id ?? "");
  const desmarcarPessoal = useUnmarkPersonalContact(c?.id ?? "");

  /**
   * QUEM MANDA, uma pergunta com uma resposta.
   *
   * Este bloco era três leituras parciais. O selo e o botão de volta liam duas
   * travas (`bot_silenced_until || force_human`); a linha da lista lia uma, por
   * COR; o painel não lia nenhuma. Desde a 0173 há uma quarta situação —
   * "alguém assumiu" — e continuar somando condições à mão aqui é como as três
   * leituras divergiram em primeiro lugar. A regra mora em `lib/inbox`,
   * espelhando os gates que o MOTOR lê, e esta tela só a consome.
   */
  const fatosDoComando = {
    status,
    assigned_to_user_id: conversation.assigned_to_user_id,
    assigned_to_user_name: conversation.assigned_to_user_name ?? null,
    assignee_kind: conversation.assignee_kind ?? null,
    bot_silenced_until: conversation.bot_silenced_until ?? null,
    last_handoff_reason: conversation.last_handoff_reason ?? null,
    force_human: c?.force_human ?? null,
    is_blocked: conversation.contacts?.is_blocked ?? null,
    is_group: conversation.is_group ?? false,
    automaticoDaOrg: automaticoDaOrg.data,
  };
  const { comando, automaticoAtivo, travaVigente, motivo } = comandoDaConversa(fatosDoComando);
  /**
   * O QUE "LIBERAR" FAZ DEPENDE DO ESTADO, e a guia do botão (#3003) não pode
   * prometer o automático de volta quando ele não volta.
   *
   * `fn_conversation_assign` com dono `null` deixa a conversa aberta e sem dono,
   * mas só limpa `bot_silenced_until` quando NÃO houve escalação
   * (`last_handoff_at is null`). Depois de uma escalação, com o contato travado
   * (`force_human`), descadastrado, em grupo ou numa org sem automático, a
   * conversa cai na fila esperando gente. A pergunta é a mesma regra de quem
   * manda, aplicada ao estado que a RPC vai gravar.
   */
  const liberarDevolveAoAutomatico =
    comandoDaConversa({
      ...fatosDoComando,
      status: "open",
      assigned_to_user_id: null,
      assigned_to_user_name: null,
      assignee_kind: null,
      bot_silenced_until: conversation.last_handoff_at ? fatosDoComando.bot_silenced_until : null,
    }).comando.quem === "automatico";

  const encerrada = status === "closed" || status === "archived" || status === "resolved";
  /**
   * A VOLTA aparece sempre que há algo a devolver — inclusive em conversa
   * ENCERRADA. Antes ela era condicionada a `status !== "closed"`, e o resultado
   * era um beco sem saída medido: atendente assume, fecha, sai de férias; a
   * conversa fica com o automático parado e, para qualquer colega, sem NENHUMA
   * porta — "Liberar" só existe para o próprio dono e a rota recusa quem não é.
   * `devolverAtendimentoAoAgente` funciona nesse estado (o status fechado está na
   * lista de reativáveis), então esconder o botão escondia uma ação que existe.
   *
   * A condição é `travaVigente`, e NÃO `!automaticoAtivo`: conversa encerrada tem
   * o automático inativo sem ter trava nenhuma, e sair do segundo faria o botão
   * aparecer em toda conversa fechada — clicá-lo REABRIRIA uma conversa que
   * ninguém pediu para reabrir. Oferecer uma ação que não deveria acontecer é
   * pior que não oferecer nenhuma.
   */
  const podeDevolver = travaVigente;
  /**
   * PAUSAR só aparece quando pausar é um gesto DIFERENTE de assumir.
   *
   * Desde a 0173 "Assumir" já cala o automático (a RPC grava o silêncio). Numa
   * conversa sem dono, portanto, "Assumir" e "Pausar o automático" teriam
   * exatamente o mesmo efeito — dois botões para um ato é a confusão que esta
   * entrega existe para acabar, não para dobrar.
   *
   * Sobra o caso em que ele é próprio: a conversa JÁ tem dono e o automático
   * continua de pé. Isso é real e não é raro — o rodízio (`reason='routing'`)
   * distribui sem calar, de propósito, senão uma org em round_robin ficaria sem
   * automático nenhum.
   */
  const podePausar =
    automaticoAtivo && !encerrada && conversation.assigned_to_user_id !== null;

  if (user.support?.access_mode === "support_readonly") return <header className="flex items-center justify-between border-b p-4">
    <strong>{displayName}</strong><span className="text-sm text-muted-foreground">{STATUS_LABEL[status] ?? status} · Somente leitura</span>
  </header>;
  const linhaDeQuem =
    comando.quem === "humano"
      ? `${t("Atendido por")} ${comando.nome ?? t("Atendente")}`
      : comando.quem === "automatico"
        ? t("Atendido pelo automático")
        : t("Sem responsável");
  const corDoStatus = encerrada
    ? "bg-ibx-muted"
    : status === "pending"
      ? "bg-ibx-warning"
      : "bg-ibx-success";
  const textoDoStatus = encerrada
    ? "text-ibx-muted"
    : status === "pending"
      ? "text-ibx-warning"
      : "text-ibx-success";
  const botaoSecundario =
    "inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-[10px] border border-ibx-border bg-transparent px-3 text-[13px] font-medium text-ibx-text transition-colors hover:border-ibx-border-hover hover:bg-ibx-field focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ibx-accent disabled:pointer-events-none disabled:opacity-50";

  return (
    // `flex-wrap`: este header já travou a LARGURA DA TELA INTEIRA (707px de
    // `min-content` com a barra `shrink-0`). A barra pode encolher e quebrar
    // para a linha de baixo; nenhuma ação some.
    <div className="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-ibx-line px-4 py-3.5">
      {/* FAIXA DA CARTEIRA (1.99, #2591): "este cliente pertence à carteira de
          A". Linha própria acima da identidade; sem carteira não desenha nada. */}
      {c?.id && (
        <div className="w-full empty:hidden">
          <FaixaDaCarteira contactId={c.id} quemAtendeId={conversation.assigned_to_user_id} />
        </div>
      )}
      <div className="flex min-w-0 items-center gap-3">
        <Avatar className="h-9 w-9 shrink-0">
          {c?.avatar_storage_path && !c?.is_anonymized ? (
            <AvatarImage src={`/api/v1/contacts/${c.id}/avatar`} alt="" className="object-cover" />
          ) : null}
          <AvatarFallback className="bg-ibx-avatar-head-bg text-[12px] font-semibold text-ibx-accent-text">
            {initials(displayName, phone ?? "??")}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="min-w-0 truncate text-[15px] font-semibold text-ibx-text" title={displayName}>
              {displayName}
            </h2>
            <span className={cn("inline-flex shrink-0 items-center gap-1.5 text-[12px] font-medium", textoDoStatus)}>
              <span className={cn("h-1.5 w-1.5 rounded-full", corDoStatus)} aria-hidden />
              {t(STATUS_LABEL[status] ?? status)}
            </span>
            {/* "Dá para escrever agora?" se pergunta ANTES de digitar, não
                depois de um `failed` com código de cinco dígitos. */}
            <JanelaSelo
              provider={conversation.channel_sessions?.provider ?? null}
              lastInboundAt={conversation.last_inbound_at}
            />
          </div>
          {/* QUEM ESTÁ NO COMANDO sai de `comandoDaConversa` — a mesma regra do
              card do funil e do dossiê, agora escrita por extenso. */}
          <p
            className="mt-0.5 truncate text-[12px] text-ibx-muted"
            data-testid="comando-da-conversa"
            data-comando={comando.quem}
          >
            {linhaDeQuem}
            {phone ? ` · ${phone}` : ""}
          </p>
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {/* Tradução automática: só aparece quando o cliente fala outra língua. */}
        {!conversation.is_group && <SeloDeIdiomas conversationId={conversation.id} />}
        {/* A chamada usa o telefone da ficha. Grupos não são uma pessoa. */}
        {!conversation.is_group && c?.id && (
          <DialButton contactId={c.id} hasPhone={!!c.phone_number} />
        )}
        {!conversation.is_group && c?.id && activeOrg && ROLE_RANK[activeOrg.role] >= ROLE_RANK.agent && (
          <ReservarServicoNaConversa
            key={`${activeOrg.orgId}:${conversation.id}`}
            contactId={c.id}
            conversationId={conversation.id}
            contactName={displayName}
          />
        )}
        {/* Videochamada (1.99, #2440): sem JITSI_SERVER_URL o botão não existe. */}
        <VideoCallButton
          conversationId={conversation.id}
          provider={conversation.channel_sessions?.provider ?? null}
          lastInboundAt={conversation.last_inbound_at}
          bloqueio={motivoDoContato(c, t)}
          encerrada={status === "closed"}
        />
        {/* Atendimento conjunto (1.99, #2542): quem participa e a porta para
            convidar — não desenha nada sem participante nem permissão. */}
        <ParticipantesDaConversa
          conversationId={conversation.id}
          podeConvidar={podeConvidar}
          atendenteId={user.id}
        />
        {isOpen && !isMineAssigned && (
          <button
            type="button"
            disabled={claim.isPending}
            className="inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-[10px] bg-ibx-accent px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-ibx-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ibx-accent disabled:opacity-60"
            // O rótulo é contrato (`inbox-header-nao-trava` e o dicionário). A
            // consequência vai na dica: assumir também para o automático.
            title={t("Você passa a responder esta conversa e o atendimento automático para aqui.")}
            onClick={() =>
              claim.mutate({
                conversation_id: conversation.id,
                expected_assignee: conversation.assigned_to_user_id,
              })
            }
          >
            <Hand size={15} aria-hidden />
            {t("Assumir")}
          </button>
        )}
        {isMineAssigned && (
          <button
            type="button"
            className={botaoSecundario}
            disabled={release.isPending}
            // GUIA CURTA (#3003): o rótulo diz o GESTO, não a consequência. "Liberar"
            // não conta para onde a conversa vai — de volta ao automático ou para a
            // fila (ver `liberarDevolveAoAutomatico`) — e essa é exatamente a
            // pergunta "o que acontece se eu clicar aqui?".
            //
            // A guia vai em `title`, e NÃO em `aria-label`: o `aria-label`
            // SUBSTITUI o nome acessível, e `getByRole("button", { name: "Liberar" })`
            // de `inbox-header-nao-trava` e de `ConversationHeader.test` deixaria de
            // achar o botão. É o mesmo caminho já usado por "Assumir", "Devolver ao
            // automático" e "Pausar o automático" neste arquivo.
            title={
              liberarDevolveAoAutomatico
                ? t("Solta esta conversa: ela fica sem dono e o atendimento automático volta a responder.")
                : t("Solta esta conversa: ela fica sem dono e volta para a fila, esperando um atendente.")
            }
            onClick={() => release.mutate({ conversation_id: conversation.id })}
          >
            {t("Liberar")}
          </button>
        )}
        {/* O INTERRUPTOR do automático: um slot, dois rótulos. O `data-testid`
            da VOLTA é contrato (`escalacao-ciclo` o clica). */}
        {podeDevolver && (
          <button
            type="button"
            className={botaoSecundario}
            disabled={retomar.isPending}
            data-testid="devolver-ao-automatico"
            // `devolverAtendimentoAoAgente` limpa `contacts.force_human`, que é
            // do CLIENTE: quando foi ele que travou, a volta vale para todas as
            // conversas dele — e a dica diz isso.
            title={
              motivo === "contato_travado"
                ? t("Religa o atendimento automático para este cliente — vale para todas as conversas dele.")
                : t("Devolve esta conversa ao atendimento automático.")
            }
            onClick={() => retomar.mutate({ conversation_id: conversation.id })}
          >
            {retomar.isPending ? t("Devolvendo...") : t("Devolver ao automático")}
          </button>
        )}
        {podePausar && (
          <button
            type="button"
            className={botaoSecundario}
            disabled={pausar.isPending}
            data-testid="pausar-o-automatico"
            title={t("O atendimento automático para nesta conversa. O dono não muda.")}
            onClick={() => pausar.mutate({ conversation_id: conversation.id })}
          >
            {pausar.isPending ? t("Pausando...") : t("Pausar o automático")}
          </button>
        )}

        {/* Grupo secundário: ferramentas que não mudam quem atende. Só ícone,
            com a dica e o nome acessível dizendo o que cada um faz. */}
        <div className="flex items-center gap-0.5 rounded-[10px] border border-ibx-border p-0.5" role="group" aria-label={t("Ações da conversa")}>
          {onBuscar && (
            <button
              type="button"
              ref={botaoBuscaRef}
              className={cn(BOTAO_DO_GRUPO, buscaAberta && "bg-ibx-field text-ibx-text")}
              onClick={onBuscar}
              aria-label={t("Buscar na conversa")}
              title={t("Buscar na conversa")}
              aria-expanded={buscaAberta}
            >
              <Search size={16} aria-hidden />
            </button>
          )}
          {/* Fork jhoow (Fluxos, Fase B): grupo não entra em fluxo (nem em IA). */}
          {!encerrada && !conversation.is_group && (
            <DispararFluxoButton conversationId={conversation.id} compacto />
          )}
          {!encerrada && (
            <button
              type="button"
              className={BOTAO_DO_GRUPO}
              onClick={() => setReassignOpen(true)}
              aria-label={t("Transferir")}
              title={t("Transferir")}
            >
              <ArrowRightLeft size={16} aria-hidden />
            </button>
          )}
          {!encerrada && (
            <SnoozeButton
              conversationId={conversation.id}
              snoozeUntil={conversation.snooze_until ?? null}
              compacto
            />
          )}
          {/* ARQUIVAR (#923): tira da frente sem destruir. Já arquivada não
              mostra — arquivar duas vezes não é um gesto que exista. */}
          {status !== "archived" && (
            <button
              type="button"
              className={BOTAO_DO_GRUPO}
              disabled={arquivar.isPending}
              onClick={() => setConfirmArquivarOpen(true)}
              aria-label={arquivar.isPending ? t("Arquivando...") : t("Arquivar")}
              title={t("Arquivar")}
            >
              <Archive size={16} aria-hidden />
            </button>
          )}
        </div>

        {/* PESSOAL (spec 21): marcar tira a conversa do inbox na hora; desmarcar
            relista. O `data-testid` é contrato do e2e da spec. */}
        {podeMarcarPessoal && c?.id && !ehPessoal && (
          <button
            type="button"
            className={botaoSecundario}
            disabled={marcarPessoal.isPending}
            data-testid="marcar-pessoal"
            title={t("Tira este contato da operação: a conversa sai do inbox.")}
            onClick={() => setConfirmPessoalOpen(true)}
          >
            {t("Marcar como pessoal")}
          </button>
        )}
        {podeMarcarPessoal && c?.id && ehPessoal && (
          <button
            type="button"
            className={botaoSecundario}
            disabled={desmarcarPessoal.isPending}
            data-testid="desmarcar-pessoal"
            title={t("Devolve este contato à operação: a conversa volta ao inbox.")}
            onClick={() => desmarcarPessoal.mutate()}
          >
            {desmarcarPessoal.isPending ? t("Desmarcando...") : t("Desmarcar pessoal")}
          </button>
        )}
        {!encerrada && (
          <button
            type="button"
            className={botaoSecundario}
            disabled={close.isPending}
            // GUIA CURTA (#3003): "Fechar" sozinho não distingue encerrar de
            // arquivar — que é o clique errado relatado na issue. A guia diz o que
            // muda e o que continua disponível depois (reabrir).
            title={t("Encerra o atendimento. Depois você pode reabrir a conversa.")}
            onClick={() => {
              // Padrão marcado a cada abertura: a escolha é DESTA conversa.
              setDevolverAoFechar(true);
              setConfirmFecharOpen(true);
            }}
          >
            <Check size={15} aria-hidden />
            {t("Fechar")}
          </button>
        )}
        {encerrada && (
          <button
            type="button"
            className={botaoSecundario}
            disabled={reopen.isPending}
            onClick={() =>
              reopen.mutate({ conversation_id: conversation.id, expected_revision: conversation.service_revision })
            }
          >
            {t("Reabrir")}
          </button>
        )}
        {onAlternarPainel && (
          <button
            type="button"
            className={cn(
              "hidden h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] text-ibx-muted transition-colors hover:bg-ibx-field hover:text-ibx-text focus-visible:outline-2 focus-visible:outline-ibx-accent lg:inline-flex",
              painelAberto && "bg-ibx-field text-ibx-text",
            )}
            onClick={onAlternarPainel}
            aria-pressed={painelAberto}
            aria-label={painelAberto ? t("Recolher painel do contato") : t("Abrir painel do contato")}
            title={painelAberto ? t("Recolher painel do contato") : t("Abrir painel do contato")}
          >
            <PanelRight size={17} aria-hidden />
          </button>
        )}
      </div>
      {/* O aviso pertence à operação automática; mora numa linha própria para
          não alargar a identidade. O testid é contrato (`escalacao-ciclo`). */}
      {motivo !== null && (
        <Badge
          variant="outline"
          className="h-5 w-fit max-w-full truncate border-ibx-note-border bg-ibx-note-bg px-2 text-[11px] text-ibx-note-text"
          title={t(ROTULO_DO_MOTIVO[motivo])}
          data-testid="badge-atendimento-humano"
        >
          {t(ROTULO_DO_MOTIVO[motivo])}
        </Badge>
      )}
      <ReassignDialog
        conversationId={conversation.id}
        open={reassignOpen}
        onOpenChange={setReassignOpen}
        numero={
          onAbrirConversa && c?.id
            ? {
                contactId: c.id,
                contactPhone: c.phone_number ?? null,
                channelSessionId: conversation.channel_session_id,
                onAbrirConversa,
              }
            : undefined
        }
      />
      <AlertDialog open={confirmFecharOpen} onOpenChange={setConfirmFecharOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Fechar esta conversa?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("O atendimento é encerrado. Se o cliente escrever de novo, você pode reabrir.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {/* A PERGUNTA QUE FALTAVA (#3313, item 1). A trava de humano fica no
              CONTATO: fechar a conversa não a solta, e a equipe descobria isso
              dias depois, com o cliente sem resposta. Só aparece com a trava
              ligada — sem ela não há o que perguntar, e fechar continua sendo
              só fechar (nenhuma chave nova viaja no corpo).

              Rádio nativo, e não um `Switch`: as duas opções são excludentes e
              o estado atual PRECISA estar visível na abertura, que é justamente
              o que o item pede ("padrão marcado"). */}
          {contatoTravadoComEquipe ? (
            <div className="space-y-2" data-testid="escolha-ao-fechar">
              <p className="text-sm font-medium">
                {t("Este contato está com a equipe. Ao fechar, o que acontece?")}
              </p>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="radio"
                  name="devolver-ao-fechar"
                  data-testid="fechar-devolver-ao-automatico"
                  checked={devolverAoFechar}
                  onChange={() => setDevolverAoFechar(true)}
                  className="mt-1 h-4 w-4 shrink-0 accent-primary"
                />
                <span className="space-y-1">
                  <span className="block text-sm font-medium">
                    {t("Devolver ao automático ao fechar")}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {t(
                      "A IA volta a atender este cliente na próxima mensagem dele. Se o contato estiver marcado como sempre atendimento humano, ele continua com a equipe.",
                    )}
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="radio"
                  name="devolver-ao-fechar"
                  data-testid="fechar-manter-com-a-equipe"
                  checked={!devolverAoFechar}
                  onChange={() => setDevolverAoFechar(false)}
                  className="mt-1 h-4 w-4 shrink-0 accent-primary"
                />
                <span className="space-y-1">
                  <span className="block text-sm font-medium">{t("Manter com a equipe")}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t(
                      "A conversa fecha e a IA continua calada para este cliente: a próxima mensagem dele espera uma pessoa.",
                    )}
                  </span>
                </span>
              </label>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                // A chave só entra no corpo quando a escolha existe: sem contato
                // travado a tela não pergunta nada, e o fechamento é o de sempre.
                const escolha: {
                  conversation_id: string;
                  expected_revision?: number;
                  devolver_ao_automatico?: boolean;
                } = {
                  conversation_id: conversation.id,
                  expected_revision: conversation.service_revision,
                };
                if (contatoTravadoComEquipe) {
                  escolha.devolver_ao_automatico = devolverAoFechar;
                }
                close.mutate(escolha);
              }}
            >
              {t("Fechar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* A confirmação precisa dizer o que ACONTECE, e o que acontece depende
          do estado. `fn_conversation_set_status` trata `archived` como
          terminal: encerra o atendimento (grava `service_closed_at`,
          incrementa a revisão) e, com isso, desfaz a pausa do automático. Um
          atendente que leia "arquivar = tirar da vista, volto depois"
          encerraria o atendimento sem saber — e o robô voltaria a responder
          no próximo "oi" do cliente. Por isso a descrição só aparece quando
          `!encerrada`: quando já está encerrada, arquivar não muda o
          atendimento, só o lugar onde a conversa mora. */}
      <AlertDialog open={confirmArquivarOpen} onOpenChange={setConfirmArquivarOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Arquivar esta conversa?")}</AlertDialogTitle>
            {!encerrada && (
              <AlertDialogDescription>
                {t(
                  "Arquivar encerra este atendimento e guarda a conversa no histórico. Se o cliente escrever de novo, ela volta.",
                )}
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                arquivar.mutate({
                  conversation_id: conversation.id,
                  expected_revision: conversation.service_revision,
                })
              }
            >
              {t("Arquivar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* A confirmação diz o que ACONTECE ao marcar: a conversa fecha e sai do
          atendente, e o contato fica inutilizado para envio — sem apagar nada.
          Desmarcar é direto no botão porque só relista o que já está lá. */}
      <AlertDialog open={confirmPessoalOpen} onOpenChange={setConfirmPessoalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Marcar este contato como pessoal?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "A conversa sai do inbox e o contato fica fora da operação: sem IA, sem follow-up, sem campanha e sem envio. O histórico continua no banco e volta à vista ao desmarcar; follow-ups e campanhas cancelados não voltam.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => marcarPessoal.mutate()}>
              {t("Marcar como pessoal")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
