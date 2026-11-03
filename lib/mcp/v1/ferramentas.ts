/**
 * O CATÁLOGO das ferramentas MCP v1 — o que uma conexão externa (Claude Code,
 * Claude Desktop, Cursor…) pode chamar em `/api/mcp`.
 *
 * Cada ferramenta declara:
 *   - EXATAMENTE UM escopo (`escopo`): é ele que decide se ela aparece em
 *     `tools/list` e se a chamada passa;
 *   - se ESCREVE (`escrita`): escrita cobra a cota de 300 por dia;
 *   - os RECURSOS que toca (`recursos`): é contra eles que a lista de bloqueio
 *     (`bloqueio.ts`) confere o catálogo inteiro num teste;
 *   - uma projeção FIXA de campos: nada de `select *` saindo para fora.
 *
 * Nenhuma ferramenta recebe `organization_id`: a organização vem da conexão.
 * Toda ferramenta reaproveita a camada de serviço que a tela e a API REST já
 * usam — a mesma validação, o mesmo audit, a mesma linha do tempo.
 *
 * Fora daqui, de propósito (ver `bloqueio.ts`): apagar, publicar fluxo,
 * disparar/pausar campanha, enviar mensagem, importar/exportar e edição em massa.
 */
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createContactHandler,
  getContactHandler,
  listContactsHandler,
  patchContactHandler,
} from "@/app/api/v1/contacts/_handler";
import {
  createLeadHandler,
  getLeadHandler,
  listLeadsHandler,
  moveLeadHandler,
  updateLeadHandler,
} from "@/app/api/v1/leads/_handler";
import { listMessagesHandler } from "@/app/api/v1/messages/_handler";
import { listPipelinesHandler } from "@/app/api/v1/pipelines/_handler";
import { ApiError } from "@/lib/api/types";
import type { Actor, HandlerCtx } from "@/lib/api/handlers/types";
import { COLUNAS_DA_CONTAGEM, contagemDasLinhas, progresso, taxasDaCampanha, type LinhaDaContagem } from "@/lib/campanhas/metricas";
import { codificarCursor, decodificarCursor } from "@/lib/campanhas/schemas";
import { audit } from "@/lib/audit";
import { patchFollowupFlowSchema } from "@/lib/followup/api-schemas";
import { rascunhoDoFluxo } from "@/lib/followup/rascunho";
import { salvarFluxo } from "@/lib/followup/salvar-fluxo";
import { crmManageTags } from "@/lib/mcp/tools/governance";
import type { McpContext } from "@/lib/mcp/types";
import { listarMarcadores } from "@/lib/operacao/marcadores-e-time";
import { contactCreateSchema, contactPatchSchema } from "@/lib/schemas/contacts";
import { createLeadSchema, updateLeadSchema } from "@/lib/schemas/leads";
import { conversationTagSchema } from "@/lib/schemas/messaging";
import { canonicalConversationTagsSchema } from "@/lib/schemas/settings";
import type { ConexaoResolvida } from "./conexao";
import type { Escopo } from "./escopos";
import { AVISO_DE_CONTEUDO, LIMITE_POR_PAGINA, contatoVisivel, naoConfiavel } from "./minimizacao";

export interface ContextoV1 {
  /** Client service-role: TODA consulta filtra `organization_id` da conexão. */
  db: SupabaseClient;
  conexao: ConexaoResolvida;
  requestId: string;
}

export interface Resposta {
  resultado: unknown;
  /** Quantos registros voltaram ou mudaram — vai para o registro da chamada. */
  registros: number;
}

export interface FerramentaV1<S extends z.ZodRawShape = z.ZodRawShape> {
  nome: string;
  escopo: Escopo;
  escrita: boolean;
  /** As tabelas/áreas que a ferramenta toca. Conferidas contra a lista de bloqueio. */
  recursos: readonly string[];
  descricao: string;
  entrada: S;
  executar: (input: z.infer<z.ZodObject<S>>, ctx: ContextoV1) => Promise<Resposta>;
}

function definir<S extends z.ZodRawShape>(f: FerramentaV1<S>): FerramentaV1 {
  return f as unknown as FerramentaV1;
}

/** A conexão age COMO o dono, com o papel ATUAL dele. */
function atorDaConexao(c: ConexaoResolvida): Actor {
  return { type: "user", id: c.donoId, role: c.donoPapel };
}

function handlerCtx(ctx: ContextoV1): HandlerCtx {
  return { organization_id: ctx.conexao.organizationId, actor: atorDaConexao(ctx.conexao), requestId: ctx.requestId };
}

/**
 * O contexto que as ferramentas internas (`lib/mcp/tools`) pedem. `apiTokenId`
 * fica AUSENTE: a conexão MCP não é um token de API (`dsk_`), e o audit grava
 * `actor_api_token_id` nulo quando o campo não vem (`entry.actorApiTokenId ?? null`).
 */
function contextoInterno(ctx: ContextoV1): McpContext {
  return {
    organizationId: ctx.conexao.organizationId,
    role: ctx.conexao.donoPapel,
    actor: atorDaConexao(ctx.conexao),
    apiTokenId: undefined as unknown as string,
    requestId: ctx.requestId,
    supabase: ctx.db,
  };
}

const limite = z.number().int().min(1).max(LIMITE_POR_PAGINA).default(20);
const cursor = z.string().max(500).optional().describe("Cursor opaco devolvido pela chamada anterior.");
const uuid = z.string().uuid();

// ---------------------------------------------------------------------------
// projeções
// ---------------------------------------------------------------------------

interface LinhaDeContato {
  id: string;
  name?: string | null;
  display_name?: string | null;
  phone_number?: string | null;
  email?: string | null;
  tags?: string[] | null;
  source?: string | null;
  is_blocked?: boolean;
  is_anonymized?: boolean;
  created_at?: string;
  last_activity_at?: string | null;
}

/** Nome de contato vem do perfil do WhatsApp — quem escreveu foi o cliente. */
function contatoProjetado(c: LinhaDeContato, comPii: boolean) {
  const { phone, email } = contatoVisivel({ phone: c.phone_number, email: c.email }, comPii);
  return {
    id: c.id,
    name: naoConfiavel(c.display_name || c.name || null),
    phone,
    email,
    tags: c.tags ?? [],
    source: c.source ?? null,
    is_blocked: c.is_blocked ?? false,
    is_anonymized: c.is_anonymized ?? false,
    created_at: c.created_at ?? null,
    last_activity_at: c.last_activity_at ?? null,
  };
}

function leadProjetado(l: Record<string, unknown>) {
  return {
    id: l.id,
    title: l.title ?? null,
    description: naoConfiavel((l.description as string | null) ?? null),
    status: l.status ?? null,
    pipeline_id: l.pipeline_id ?? null,
    stage_id: l.stage_id ?? null,
    contact_id: l.contact_id ?? null,
    value_cents: l.value_cents ?? null,
    currency: l.currency ?? null,
    owner_user_id: l.owner_user_id ?? null,
    tags: (l.tags as string[] | null) ?? [],
    expected_close_date: l.expected_close_date ?? null,
    lost_reason: l.lost_reason ?? null,
    created_at: l.created_at ?? null,
    updated_at: l.updated_at ?? null,
  };
}

const COLUNAS_DA_CAMPANHA =
  "id, name, status, mode, channel_session_id, flow_id, snapshot_total, snapshot_eligible, snapshot_excluded, " +
  "scheduled_at, started_at, paused_at, completed_at, cancelled_at, created_at";

// ---------------------------------------------------------------------------
// contatos
// ---------------------------------------------------------------------------

const listContacts = definir({
  nome: "list_contacts",
  escopo: "contacts:read",
  escrita: false,
  recursos: ["contacts"],
  descricao:
    "Lista contatos da organização, do mais recente para o mais antigo, com busca por nome, e-mail ou telefone e filtro por tag. " +
    `No máximo ${LIMITE_POR_PAGINA} por página. Telefone e e-mail vêm mascarados quando a conexão não tem acesso a dados pessoais. ` +
    AVISO_DE_CONTEUDO,
  entrada: { search: z.string().min(1).max(200).optional(), tag: z.string().max(40).optional(), limit: limite, cursor },
  executar: async (input, ctx) => {
    const r = await listContactsHandler(ctx.db, handlerCtx(ctx), {
      search: input.search,
      tag: input.tag,
      limit: input.limit,
      cursor: input.cursor,
    });
    const contatos = r.contacts.map((c) => contatoProjetado(c as LinhaDeContato, ctx.conexao.mostrarDadosPessoais));
    return { resultado: { contacts: contatos, cursor: r.cursor, has_more: r.has_more }, registros: contatos.length };
  },
});

const getContact = definir({
  nome: "get_contact",
  escopo: "contacts:read",
  escrita: false,
  recursos: ["contacts"],
  descricao:
    "Retorna um contato pelo id. CPF nunca sai. Telefone e e-mail vêm mascarados sem acesso a dados pessoais. " + AVISO_DE_CONTEUDO,
  entrada: { contact_id: uuid },
  executar: async (input, ctx) => {
    const c = await getContactHandler(ctx.db, handlerCtx(ctx), { contactId: input.contact_id, decryptPurpose: null });
    if ((c as { organization_id?: string }).organization_id !== ctx.conexao.organizationId) throw new ApiError(404, "not_found", undefined, ctx.requestId);
    return { resultado: { contact: contatoProjetado(c as LinhaDeContato, ctx.conexao.mostrarDadosPessoais) }, registros: 1 };
  },
});

const createContact = definir({
  nome: "create_contact",
  escopo: "contacts:write",
  escrita: true,
  recursos: ["contacts"],
  descricao:
    "Cria um contato. Telefone em E.164 (+5511999998888). Recusa telefone que já pertence a outro contato. Tags são aplicadas por add_tag_to_contact.",
  entrada: {
    name: z.string().min(1).max(200).optional(),
    phone_number: z.string().max(20).optional(),
    email: z.string().email().max(200).optional(),
  },
  executar: async (input, ctx) => {
    const parsed = contactCreateSchema.parse({ ...input, source: "mcp" });
    const r = await createContactHandler(ctx.db, handlerCtx(ctx), parsed);
    return {
      resultado: { contact: contatoProjetado(r.contact as LinhaDeContato, ctx.conexao.mostrarDadosPessoais) },
      registros: 1,
    };
  },
});

const updateContact = definir({
  nome: "update_contact",
  escopo: "contacts:write",
  escrita: true,
  recursos: ["contacts"],
  descricao: "Atualiza nome, telefone ou e-mail de UM contato. Tags mudam por add_tag_to_contact e remove_tag_from_contact.",
  entrada: {
    contact_id: uuid,
    name: z.string().min(1).max(200).optional(),
    phone_number: z.string().max(20).optional(),
    email: z.string().email().max(200).optional(),
  },
  executar: async (input, ctx) => {
    const { contact_id, ...resto } = input;
    const parsed = contactPatchSchema.parse(resto);
    const c = await patchContactHandler(ctx.db, handlerCtx(ctx), contact_id, parsed);
    return { resultado: { contact: contatoProjetado(c as LinhaDeContato, ctx.conexao.mostrarDadosPessoais) }, registros: 1 };
  },
});

// ---------------------------------------------------------------------------
// negócios (leads)
// ---------------------------------------------------------------------------

const listLeads = definir({
  nome: "list_leads",
  escopo: "leads:read",
  escrita: false,
  recursos: ["crm_leads"],
  descricao: `Lista negócios (leads) filtrando por funil, etapa e status. No máximo ${LIMITE_POR_PAGINA} por página. ` + AVISO_DE_CONTEUDO,
  entrada: {
    pipeline_id: uuid.optional(),
    stage_id: uuid.optional(),
    status: z.enum(["open", "won", "lost"]).optional(),
    limit: limite,
    cursor,
  },
  executar: async (input, ctx) => {
    const r = await listLeadsHandler(ctx.db, handlerCtx(ctx), {
      pipeline_id: input.pipeline_id,
      stage_id: input.stage_id,
      status: input.status,
      limit: input.limit,
      cursor: input.cursor,
    });
    const leads = r.leads.map((l) => leadProjetado(l as unknown as Record<string, unknown>));
    return { resultado: { leads, cursor: r.cursor, has_more: r.has_more }, registros: leads.length };
  },
});

const getLead = definir({
  nome: "get_lead",
  escopo: "leads:read",
  escrita: false,
  recursos: ["crm_leads"],
  descricao: "Retorna um negócio (lead) pelo id. " + AVISO_DE_CONTEUDO,
  entrada: { lead_id: uuid },
  executar: async (input, ctx) => {
    const l = (await getLeadHandler(ctx.db, handlerCtx(ctx), input.lead_id)) as unknown as Record<string, unknown>;
    if (l.organization_id !== ctx.conexao.organizationId) throw new ApiError(404, "not_found", undefined, ctx.requestId);
    return { resultado: { lead: leadProjetado(l) }, registros: 1 };
  },
});

const VALOR =
  "Valor × 100 em qualquer moeda: R$ 249,90 → 24990.";

const createLead = definir({
  nome: "create_lead",
  escopo: "leads:write",
  escrita: true,
  recursos: ["crm_leads"],
  descricao: "Cria um negócio (lead) numa etapa de um funil. A moeda padrão é a da organização.",
  entrada: {
    pipeline_id: uuid,
    stage_id: uuid,
    title: z.string().min(2).max(200),
    description: z.string().max(2000).optional(),
    contact_id: uuid.optional(),
    value_cents: z.number().int().nonnegative().optional().describe(VALOR),
    currency: z.string().length(3).optional(),
    expected_close_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  },
  executar: async (input, ctx) => {
    const parsed = createLeadSchema.parse({
      pipeline_id: input.pipeline_id,
      stage_id: input.stage_id,
      title: input.title,
      description: input.description ?? null,
      contact_id: input.contact_id ?? null,
      value_cents: input.value_cents ?? null,
      currency: input.currency,
      expected_close_date: input.expected_close_date ?? null,
      tags: [],
      source: "mcp",
    });
    const l = await createLeadHandler(ctx.db, handlerCtx(ctx), parsed);
    return { resultado: { lead: leadProjetado(l as unknown as Record<string, unknown>) }, registros: 1 };
  },
});

const updateLead = definir({
  nome: "update_lead",
  escopo: "leads:write",
  escrita: true,
  recursos: ["crm_leads"],
  descricao: "Atualiza título, descrição, valor, moeda ou previsão de fechamento de UM negócio. Mudar de etapa é move_lead_stage.",
  entrada: {
    lead_id: uuid,
    title: z.string().min(2).max(200).optional(),
    description: z.string().max(2000).optional(),
    value_cents: z.number().int().nonnegative().optional().describe(VALOR),
    currency: z.string().length(3).optional(),
    expected_close_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  },
  executar: async (input, ctx) => {
    const { lead_id, ...resto } = input;
    const parsed = updateLeadSchema.parse(resto);
    const l = await updateLeadHandler(ctx.db, handlerCtx(ctx), lead_id, parsed);
    return { resultado: { lead: leadProjetado(l as unknown as Record<string, unknown>) }, registros: 1 };
  },
});

const moveLeadStage = definir({
  nome: "move_lead_stage",
  escopo: "leads:write",
  escrita: true,
  recursos: ["crm_leads"],
  descricao:
    "Move UM negócio para outra etapa do MESMO funil. Etapas que exigem motivo de ganho ou campos obrigatórios recusam sem eles.",
  entrada: {
    lead_id: uuid,
    to_stage_id: uuid,
    reason: z.string().max(500).optional(),
    won_reason: z.string().max(500).optional(),
  },
  executar: async (input, ctx) => {
    const l = await moveLeadHandler(ctx.db, handlerCtx(ctx), input.lead_id, {
      to_stage_id: input.to_stage_id,
      reason: input.reason,
      won_reason: input.won_reason,
    });
    return { resultado: { lead: leadProjetado(l as unknown as Record<string, unknown>) }, registros: 1 };
  },
});

// ---------------------------------------------------------------------------
// funis
// ---------------------------------------------------------------------------

const listPipelines = definir({
  nome: "list_pipelines",
  escopo: "pipelines:read",
  escrita: false,
  recursos: ["crm_pipelines", "crm_stages"],
  descricao: "Lista os funis ativos da organização com as etapas de cada um, na ordem do quadro.",
  entrada: {},
  executar: async (_input, ctx) => {
    const { pipelines } = await listPipelinesHandler(ctx.db, handlerCtx(ctx));
    const ids = pipelines.map((p) => p.id);
    const { data: etapas, error } = ids.length
      ? await ctx.db
          .from("crm_stages")
          .select("id, pipeline_id, name, position, is_won, is_lost")
          .eq("organization_id", ctx.conexao.organizationId)
          .in("pipeline_id", ids)
          .order("position", { ascending: true })
      : { data: [], error: null };
    if (error) throw new ApiError(500, "internal_error", undefined, ctx.requestId, error.message);
    const porFunil = new Map<string, Array<Record<string, unknown>>>();
    for (const e of (etapas ?? []) as Array<Record<string, unknown> & { pipeline_id: string }>) {
      const { pipeline_id, ...etapa } = e;
      porFunil.set(pipeline_id, [...(porFunil.get(pipeline_id) ?? []), etapa]);
    }
    const resultado = pipelines.map((p) => ({
      id: p.id,
      name: p.name,
      is_default: p.is_default,
      position: p.position,
      stages: porFunil.get(p.id) ?? [],
    }));
    return { resultado: { pipelines: resultado }, registros: resultado.length };
  },
});

// ---------------------------------------------------------------------------
// tags
// ---------------------------------------------------------------------------

const listTags = definir({
  nome: "list_tags",
  escopo: "tags:read",
  escrita: false,
  recursos: ["conversations", "organizations.settings.canonical_conversation_tags"],
  descricao:
    "Lista as tags que a organização usa, com quantas conversas carregam cada uma e se ela é oficial. " +
    "Consulte antes de aplicar uma tag, para reaproveitar a que já existe.",
  entrada: {},
  executar: async (_input, ctx) => {
    const tags = await listarMarcadores(
      { supabase: ctx.db, organizationId: ctx.conexao.organizationId, actor: atorDaConexao(ctx.conexao), requestId: ctx.requestId },
      { limite: LIMITE_POR_PAGINA },
    );
    return { resultado: { tags }, registros: tags.length };
  },
});

async function mexerNaTagDoContato(
  ctx: ContextoV1,
  contactId: string,
  mudanca: { add?: string[]; remove?: string[] },
): Promise<Resposta> {
  const r = (await crmManageTags.handler(
    { target_kind: "contact", target_id: contactId, ...mudanca },
    contextoInterno(ctx),
  )) as { target_id: string; tags: string[] };
  return { resultado: { contact_id: r.target_id, tags: r.tags }, registros: 1 };
}

const addTagToContact = definir({
  nome: "add_tag_to_contact",
  escopo: "tags:write",
  escrita: true,
  recursos: ["contacts"],
  descricao: "Aplica UMA tag a UM contato. A tag é normalizada (minúsculas, até 40 caracteres); um contato tem até 20.",
  entrada: { contact_id: uuid, tag: z.string().min(1).max(40) },
  executar: (input, ctx) => mexerNaTagDoContato(ctx, input.contact_id, { add: [input.tag] }),
});

const removeTagFromContact = definir({
  nome: "remove_tag_from_contact",
  escopo: "tags:write",
  escrita: true,
  recursos: ["contacts"],
  descricao: "Tira UMA tag de UM contato.",
  entrada: { contact_id: uuid, tag: z.string().min(1).max(40) },
  executar: (input, ctx) => mexerNaTagDoContato(ctx, input.contact_id, { remove: [input.tag] }),
});

/**
 * Criar uma tag = pôr no vocabulário OFICIAL da organização
 * (`settings.canonical_conversation_tags`) — a mesma lista que a tela de Tags
 * lê (`fn_vocabulario_de_tags`), que o seletor da Inbox sugere e que
 * `list_tags` marca como `oficial`. A tela opera renomear/juntar/excluir; criar
 * é o que faltava, e excluir continua só na tela. Normaliza pela mesma
 * régua da escrita e devolve a que já existe em vez de duplicar.
 */
const createTag = definir({
  nome: "create_tag",
  escopo: "tags:write",
  escrita: true,
  recursos: ["organizations.settings.canonical_conversation_tags"],
  descricao:
    "Inclui UMA tag no vocabulário oficial da organização (o que a Inbox sugere). Se ela já existe, devolve a existente sem duplicar. Até 50 tags oficiais.",
  entrada: { tag: z.string().min(1).max(40) },
  executar: async (input, ctx) => {
    const tag = conversationTagSchema.parse(input.tag);
    const org = ctx.conexao.organizationId;
    const { data, error } = await ctx.db.from("organizations").select("settings").eq("id", org).maybeSingle();
    if (error || !data) throw new ApiError(500, "internal_error", undefined, ctx.requestId, error?.message);
    const settings = ((data as { settings?: Record<string, unknown> | null }).settings ?? {}) as Record<string, unknown>;
    const oficiais = canonicalConversationTagsSchema.parse(settings.canonical_conversation_tags ?? []);
    if (oficiais.includes(tag)) return { resultado: { tag, created: false }, registros: 0 };
    if (oficiais.length >= 50) throw new ApiError(422, "validation_failed", undefined, ctx.requestId, "O vocabulário oficial já tem 50 tags.");

    const proximo = [...oficiais, tag];
    const { error: updErr } = await ctx.db
      .from("organizations")
      .update({ settings: { ...settings, canonical_conversation_tags: proximo } })
      .eq("id", org);
    if (updErr) throw new ApiError(500, "internal_error", undefined, ctx.requestId, updErr.message);
    void audit({
      action: "tag_vocabulary.changed",
      actorUserId: ctx.conexao.donoId,
      organizationId: org,
      resourceType: "organization",
      resourceId: org,
      requestId: ctx.requestId,
      metadata: { acao: "criar", tag },
    });
    return { resultado: { tag, created: true }, registros: 1 };
  },
});

// ---------------------------------------------------------------------------
// fluxos
// ---------------------------------------------------------------------------

const listFlows = definir({
  nome: "list_flows",
  escopo: "flows:read",
  escrita: false,
  recursos: ["followup_flow_pointers"],
  descricao: `Lista os fluxos da organização (nome, status, se tem versão no ar). No máximo ${LIMITE_POR_PAGINA}.`,
  entrada: { limit: limite },
  executar: async (input, ctx) => {
    const { data, error } = await ctx.db
      .from("followup_flow_pointers")
      .select("id, name, status, surface, active_version_id, created_at, updated_at")
      .eq("organization_id", ctx.conexao.organizationId)
      .order("updated_at", { ascending: false })
      .limit(input.limit);
    if (error) throw new ApiError(500, "internal_error", undefined, ctx.requestId, error.message);
    const fluxos = ((data ?? []) as Array<Record<string, unknown>>).map(({ active_version_id, ...f }) => ({
      ...f,
      published: active_version_id !== null,
    }));
    return { resultado: { flows: fluxos }, registros: fluxos.length };
  },
});

const getFlow = definir({
  nome: "get_flow",
  escopo: "flows:read",
  escrita: false,
  recursos: ["followup_flow_pointers", "followup_flow_versions"],
  descricao:
    "Retorna um fluxo com o RASCUNHO do grafo (blocos e ligações). Sem rascunho, vem o grafo da versão no ar. " + AVISO_DE_CONTEUDO,
  entrada: { flow_id: uuid },
  executar: async (input, ctx) => {
    const org = ctx.conexao.organizationId;
    const { data, error } = await ctx.db
      .from("followup_flow_pointers")
      .select("id, name, status, surface, active_version_id, draft_graph, trigger_config, handoff_policy, updated_at")
      .eq("id", input.flow_id)
      .eq("organization_id", org)
      .maybeSingle();
    if (error) throw new ApiError(500, "internal_error", undefined, ctx.requestId, error.message);
    if (!data) throw new ApiError(404, "not_found", undefined, ctx.requestId, "Fluxo não encontrado.");
    const linha = data as Record<string, unknown> & { draft_graph: unknown; active_version_id: string | null };
    const grafo = await rascunhoDoFluxo(ctx.db, linha, org);
    const { draft_graph: _ignorado, active_version_id, ...resto } = linha;
    return {
      resultado: { flow: { ...resto, published: active_version_id !== null, draft_graph: grafo } },
      registros: 1,
    };
  },
});

const updateFlowDraft = definir({
  nome: "update_flow_draft",
  escopo: "flows:write",
  escrita: true,
  recursos: ["followup_flow_pointers"],
  descricao:
    "Substitui o RASCUNHO do grafo de UM fluxo (o mesmo que o construtor salva). Não publica: o que está no ar não muda até alguém publicar pela tela. " +
    "Passa pela mesma validação do construtor, inclusive um único bloco de Início. Leia com get_flow antes e mande o grafo inteiro.",
  entrada: { flow_id: uuid, draft_graph: z.record(z.string(), z.unknown()) },
  executar: async (input, ctx) => {
    const patch = patchFollowupFlowSchema.parse({ draft_graph: input.draft_graph });
    const salvo = await salvarFluxo(ctx.db, ctx.conexao.organizationId, input.flow_id, patch);
    if (!salvo.ok) {
      const mensagens: Record<string, [number, string, string]> = {
        nao_encontrado: [404, "not_found", "Fluxo não encontrado."],
        sem_inicio: [422, "validation_failed", "O fluxo precisa de um bloco de Início."],
        inicio_a_mais: [422, "validation_failed", "Um fluxo tem um único bloco de Início."],
        nome_repetido: [409, "conflict", "Já existe um fluxo com este nome."],
        gatilho_recusado: [422, "validation_failed", "Gatilho recusado para este tipo de fluxo."],
      };
      const [status, code, msg] = mensagens[salvo.motivo] ?? [500, "internal_error", salvo.detalhe ?? "erro ao salvar"];
      throw new ApiError(status, code, undefined, ctx.requestId, msg);
    }
    if (salvo.mudou) {
      void audit({
        action: "followup_flow.updated",
        actorUserId: ctx.conexao.donoId,
        organizationId: ctx.conexao.organizationId,
        resourceType: "followup_flow_pointer",
        resourceId: input.flow_id,
        requestId: ctx.requestId,
        metadata: { fields_changed: ["draft_graph"] },
      });
    }
    return { resultado: { flow_id: input.flow_id, saved: true, updated_at: salvo.fluxo.updated_at ?? null }, registros: 1 };
  },
});

// ---------------------------------------------------------------------------
// campanhas
// ---------------------------------------------------------------------------

const listCampaigns = definir({
  nome: "list_campaigns",
  escopo: "campaigns:read",
  escrita: false,
  recursos: ["campaigns"],
  descricao: `Lista as campanhas da organização, da mais nova para a mais antiga. No máximo ${LIMITE_POR_PAGINA} por página. Só leitura.`,
  entrada: { status: z.string().max(20).optional(), limit: limite, cursor },
  executar: async (input, ctx) => {
    let q = ctx.db
      .from("campaigns")
      .select(COLUNAS_DA_CAMPANHA)
      .eq("organization_id", ctx.conexao.organizationId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(input.limit + 1);
    if (input.status) q = q.eq("status", input.status);
    if (input.cursor) {
      const c = decodificarCursor(input.cursor);
      if (!c) throw new ApiError(400, "invalid_cursor", undefined, ctx.requestId, "Cursor inválido.");
      q = q.or(`created_at.lt.${c.created_at},and(created_at.eq.${c.created_at},id.lt.${c.id})`);
    }
    const { data, error } = await q;
    if (error) throw new ApiError(500, "internal_error", undefined, ctx.requestId, error.message);
    const linhas = (data ?? []) as unknown as Array<{ created_at: string; id: string }>;
    const temMais = linhas.length > input.limit;
    const pagina = temMais ? linhas.slice(0, input.limit) : linhas;
    const ultima = pagina[pagina.length - 1];
    return {
      resultado: { campaigns: pagina, cursor: temMais && ultima ? codificarCursor(ultima) : null, has_more: temMais },
      registros: pagina.length,
    };
  },
});

const getCampaign = definir({
  nome: "get_campaign",
  escopo: "campaigns:read",
  escrita: false,
  recursos: ["campaigns", "campaign_recipients"],
  descricao: "Retorna uma campanha com o funil de entrega (enviados, entregues, lidos, responderam) e as taxas. Só leitura.",
  entrada: { campaign_id: uuid },
  executar: async (input, ctx) => {
    const org = ctx.conexao.organizationId;
    const { data } = await ctx.db
      .from("campaigns")
      .select(COLUNAS_DA_CAMPANHA)
      .eq("organization_id", org)
      .eq("id", input.campaign_id)
      .maybeSingle();
    if (!data) throw new ApiError(404, "not_found", undefined, ctx.requestId, "Campanha não encontrada.");
    const TETO = 20_000;
    const { data: linhas, error } = await ctx.db
      .from("campaign_recipients")
      .select(COLUNAS_DA_CONTAGEM)
      .eq("organization_id", org)
      .eq("campaign_id", input.campaign_id)
      .limit(TETO);
    if (error) throw new ApiError(500, "internal_error", undefined, ctx.requestId, error.message);
    const lidas = (linhas ?? []) as unknown as LinhaDaContagem[];
    const c = contagemDasLinhas(lidas);
    return {
      resultado: {
        campaign: data,
        metrics: { counts: c, rates: taxasDaCampanha(c), progress: progresso(c), partial: lidas.length >= TETO },
      },
      registros: 1,
    };
  },
});

// ---------------------------------------------------------------------------
// conversas
// ---------------------------------------------------------------------------

const listConversationMessages = definir({
  nome: "list_conversation_messages",
  escopo: "conversations:read",
  escrita: false,
  recursos: ["messages"],
  descricao:
    `Retorna as últimas ${LIMITE_POR_PAGINA} mensagens de UMA conversa, da mais antiga para a mais nova. Só leitura: esta conexão não envia mensagens. ` +
    AVISO_DE_CONTEUDO,
  entrada: { conversation_id: uuid, cursor },
  executar: async (input, ctx) => {
    const r = await listMessagesHandler(ctx.db, handlerCtx(ctx), input.conversation_id, {
      limit: LIMITE_POR_PAGINA,
      cursor: input.cursor,
    });
    const mensagens = r.messages.map((m) => {
      const linha = m as unknown as Record<string, unknown>;
      return {
        id: linha.id,
        direction: linha.direction,
        type: linha.type,
        status: linha.status,
        sent_at: linha.sent_at,
        body: naoConfiavel((linha.body as string | null) ?? null),
        has_media: Boolean(linha.media_url || linha.media_storage_path),
      };
    });
    return { resultado: { messages: mensagens, cursor: r.cursor, has_more: r.has_more }, registros: mensagens.length };
  },
});

/** O catálogo inteiro, na ordem em que `tools/list` o devolve. */
export const FERRAMENTAS_V1: readonly FerramentaV1[] = [
  listContacts,
  getContact,
  createContact,
  updateContact,
  listLeads,
  getLead,
  createLead,
  updateLead,
  moveLeadStage,
  listPipelines,
  listTags,
  addTagToContact,
  removeTagFromContact,
  createTag,
  listFlows,
  getFlow,
  updateFlowDraft,
  listCampaigns,
  getCampaign,
  listConversationMessages,
];

export const FERRAMENTA_POR_NOME: ReadonlyMap<string, FerramentaV1> = new Map(FERRAMENTAS_V1.map((f) => [f.nome, f]));

/** As ferramentas que a conexão enxerga com os escopos que valem agora. */
export function ferramentasVisiveis(escopos: ReadonlySet<Escopo>): FerramentaV1[] {
  return FERRAMENTAS_V1.filter((f) => escopos.has(f.escopo));
}
