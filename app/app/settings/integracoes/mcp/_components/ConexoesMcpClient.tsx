"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import {
  useAcaoNaConexaoMcp,
  useCriarConexaoMcp,
  useDetalheMcp,
  useInterruptorMcp,
  usePainelMcp,
  type ConexaoMcp,
  type NovaConexaoMcp,
} from "@/hooks/integracoes/useConexoesMcp";
import { copyToClipboard } from "@/lib/clipboard";
import {
  ESCOPOS,
  ESCOPOS_DO_PERFIL,
  VALIDADES_EM_DIAS,
  VALIDADE_PADRAO,
  FRASE_DO_RESUMO,
  escoposDaConexao,
  resumoDosEscopos,
  type Escopo,
  type ItemDoResumo,
} from "@/lib/mcp/v1/escopos";

const ROTULO_DA_FERRAMENTA: Record<ConexaoMcp["tool"], string> = {
  claude_code: "Claude Code",
  claude_desktop: "Claude Desktop / claude.ai",
  cursor: "Cursor",
  outra: "Outra ferramenta",
};

const ROTULO_DO_PERFIL: Record<ConexaoMcp["profile"], string> = {
  somente_leitura: "Somente leitura",
  operacao_crm: "Operação de CRM",
  construtor_fluxos: "Construtor de fluxos",
  personalizado: "Personalizado",
};

const EXPLICACAO_DO_PERFIL: Record<ConexaoMcp["profile"], string> = {
  somente_leitura: "Lê contatos, negócios, funis, fluxos, etiquetas e campanhas. Não muda nada.",
  operacao_crm: "Lê o CRM e cria ou edita negócios e etiquetas.",
  construtor_fluxos: "Lê fluxos e edita rascunhos. Publicar continua sendo na tela.",
  personalizado: "Você escolhe cada permissão.",
};

const ROTULO_DO_STATUS: Record<ConexaoMcp["status"], string> = {
  ativa: "Ativa",
  suspensa: "Suspensa",
  expirada: "Expirada",
  revogada: "Revogada",
};

const ROTULO_DO_RESULTADO: Record<"ok" | "negado" | "erro", string> = {
  ok: "Concluída",
  negado: "Recusada",
  erro: "Com erro",
};

function corDoStatus(s: ConexaoMcp["status"]): "default" | "secondary" | "destructive" {
  if (s === "ativa") return "default";
  if (s === "suspensa" || s === "revogada") return "destructive";
  return "secondary";
}

// ---------------------------------------------------------------------------
// instruções por ferramenta
// ---------------------------------------------------------------------------

function comandoDoClaudeCode(url: string, token: string): string {
  return `claude mcp add --transport http apex ${url} --header "Authorization: Bearer ${token}"`;
}

function configJson(url: string, token: string): string {
  return JSON.stringify({ mcpServers: { apex: { url, headers: { Authorization: `Bearer ${token}` } } } }, null, 2);
}

function BlocoCopiavel({ texto, rotulo }: { texto: string; rotulo: string }) {
  const t = useT();
  return (
    <div className="space-y-2">
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted p-3 text-xs">
        {texto}
      </pre>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => {
          void copyToClipboard(texto).then((ok) => {
            if (ok) toast.success(t("Copiado."));
            else toast.error(t("Não foi possível copiar — selecione o texto acima."));
          });
        }}
      >
        {rotulo}
      </Button>
    </div>
  );
}

export function InstrucoesDaFerramenta({ tool, url, token }: { tool: ConexaoMcp["tool"]; url: string; token: string | null }) {
  const t = useT();
  if (tool === "claude_desktop") {
    return (
      <div className="space-y-3 text-sm">
        <p>{t("No Claude Desktop ou no claude.ai, abra Configurações › Conectores › Adicionar conector personalizado e cole este endereço:")}</p>
        <BlocoCopiavel texto={url} rotulo={t("Copiar endereço")} />
        <p className="text-muted-foreground">
          {t("O Claude abre uma página deste CRM para você entrar e aprovar. Ali você escolhe o perfil de permissões; a conexão aparece nesta lista e pode ser revogada a qualquer momento.")}
        </p>
      </div>
    );
  }
  if (!token) return null;
  return (
    <div className="space-y-3 text-sm">
      <Label>{t("Token")}</Label>
      <BlocoCopiavel texto={token} rotulo={t("Copiar token")} />
      {tool === "claude_code" ? (
        <>
          <p>{t("No terminal, rode:")}</p>
          <BlocoCopiavel texto={comandoDoClaudeCode(url, token)} rotulo={t("Copiar comando")} />
        </>
      ) : (
        <>
          <p>{t("Na configuração MCP da ferramenta (no Cursor, o arquivo .cursor/mcp.json), use:")}</p>
          <BlocoCopiavel texto={configJson(url, token)} rotulo={t("Copiar configuração")} />
        </>
      )}
      <p className="text-xs text-muted-foreground">
        {t("Guarde o token agora: ele não aparece de novo. Se perder, renove a conexão.")}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// escolha de permissões (passo 2 do assistente e tela de consentimento)
// ---------------------------------------------------------------------------

export interface EscolhaDePermissoes {
  profile: ConexaoMcp["profile"];
  scopes: Escopo[];
  validity_days: number;
  allowed_ips: string;
  show_pii: boolean;
}

export const ESCOLHA_INICIAL: EscolhaDePermissoes = {
  profile: "somente_leitura",
  scopes: [],
  validity_days: VALIDADE_PADRAO,
  allowed_ips: "",
  show_pii: false,
};

export function listaDeIps(texto: string): string[] {
  return texto
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function EscolhaDePermissoesForm({
  valor,
  onChange,
}: {
  valor: EscolhaDePermissoes;
  onChange: (v: EscolhaDePermissoes) => void;
}) {
  const t = useT();
  const escopos = escoposDaConexao(valor.profile, valor.scopes, valor.show_pii);
  const resumo = resumoDosEscopos(escopos);
  const temContatos = escopos.includes("contacts:read");
  const marcar = (e: Escopo) =>
    onChange({ ...valor, scopes: valor.scopes.includes(e) ? valor.scopes.filter((x) => x !== e) : [...valor.scopes, e] });

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {(Object.keys(ROTULO_DO_PERFIL) as ConexaoMcp["profile"][]).map((p) => (
          <button
            key={p}
            type="button"
            data-testid={`perfil-${p}`}
            onClick={() =>
              onChange({ ...valor, profile: p, scopes: p === "personalizado" ? [...(valor.profile === "personalizado" ? valor.scopes : ESCOPOS_DO_PERFIL.somente_leitura)] : [] })
            }
            className={`rounded-md border p-3 text-left text-sm ${valor.profile === p ? "border-primary bg-primary/10" : "border-border"}`}
          >
            <span className="font-medium">{t(ROTULO_DO_PERFIL[p])}</span>
            <span className="mt-1 block text-xs text-muted-foreground">{t(EXPLICACAO_DO_PERFIL[p])}</span>
          </button>
        ))}
      </div>

      {valor.profile === "personalizado" ? (
        <fieldset className="space-y-1 rounded-md border p-3">
          <legend className="px-1 text-xs text-muted-foreground">{t("Permissões")}</legend>
          {ESCOPOS.filter((e) => e !== "contacts:pii").map((e) => (
            <label key={e} className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={valor.scopes.includes(e)} onChange={() => marcar(e)} className="mt-1" />
              <span>
                {t(FRASE_DO_RESUMO[e])} <code className="text-xs text-muted-foreground">{e}</code>
                {e === "conversations:read" ? (
                  <span className="block text-xs text-destructive">
                    {t("LGPD: mensagens são conversas pessoais dos seus clientes. Libere só se a ferramenta realmente precisar lê-las.")}
                  </span>
                ) : null}
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}

      <div className="flex items-start justify-between gap-3 rounded-md border p-3">
        <div className="text-sm">
          <Label htmlFor="mcp-pii">{t("Mostrar telefone e e-mail")}</Label>
          <p className="text-xs text-muted-foreground">
            {t("Desligado, telefone e e-mail saem mascarados. Ligar envia dados pessoais (LGPD) à ferramenta de IA — faça isso só com base legal e se a ferramenta precisar deles.")}
          </p>
          {!temContatos ? <p className="text-xs text-muted-foreground">{t("Só vale com a permissão de ler contatos.")}</p> : null}
        </div>
        <Switch
          id="mcp-pii"
          checked={valor.show_pii}
          onCheckedChange={(v) => onChange({ ...valor, show_pii: v })}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="mcp-validade">{t("Validade")}</Label>
          <select
            id="mcp-validade"
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={valor.validity_days}
            onChange={(e) => onChange({ ...valor, validity_days: Number(e.target.value) })}
          >
            {VALIDADES_EM_DIAS.map((d) => (
              <option key={d} value={d}>
                {t("{n} dias").replace("{n}", String(d))}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="mcp-ips">{t("IPs permitidos (opcional)")}</Label>
          <Textarea
            id="mcp-ips"
            rows={2}
            value={valor.allowed_ips}
            onChange={(e) => onChange({ ...valor, allowed_ips: e.target.value })}
            placeholder="203.0.113.10, 198.51.100.0/24"
          />
          <p className="text-xs text-muted-foreground">{t("Vazio aceita qualquer IP. Aceita IP solto ou faixa CIDR.")}</p>
        </div>
      </div>

      <div className="grid gap-3 rounded-md border p-3 text-sm sm:grid-cols-2" data-testid="resumo-de-permissoes">
        <div>
          <p className="font-medium">{t("Pode")}</p>
          <ul className="mt-1 list-disc pl-4 text-xs">
            {resumo.pode.length === 0 ? <li>{t("Nada ainda — escolha ao menos uma permissão.")}</li> : null}
            {resumo.pode.map((p) => (
              <li key={p}>{t(FRASE_DO_RESUMO[p])}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-medium">{t("Não pode")}</p>
          <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
            {resumo.naoPode.map((p) => (
              <li key={p}>{t(FRASE_DO_RESUMO[p])}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// assistente de criação
// ---------------------------------------------------------------------------

function AssistenteDeConexao({ aberto, onFechar, url }: { aberto: boolean; onFechar: () => void; url: string }) {
  const t = useT();
  const criar = useCriarConexaoMcp();
  const [passo, setPasso] = useState<1 | 2 | 3>(1);
  const [nome, setNome] = useState("");
  const [ferramenta, setFerramenta] = useState<ConexaoMcp["tool"]>("claude_code");
  const [escolha, setEscolha] = useState<EscolhaDePermissoes>(ESCOLHA_INICIAL);
  const [token, setToken] = useState<string | null>(null);

  const fechar = () => {
    setPasso(1);
    setNome("");
    setFerramenta("claude_code");
    setEscolha(ESCOLHA_INICIAL);
    setToken(null);
    onFechar();
  };

  const semEscopos = escoposDaConexao(escolha.profile, escolha.scopes, escolha.show_pii).length === 0;

  const concluir = async () => {
    const entrada: NovaConexaoMcp = {
      name: nome.trim(),
      tool: ferramenta,
      profile: escolha.profile,
      scopes: escolha.scopes,
      validity_days: escolha.validity_days,
      allowed_ips: listaDeIps(escolha.allowed_ips),
      show_pii: escolha.show_pii,
    };
    try {
      const r = await criar.mutateAsync(entrada);
      setToken(r.data.token ?? null);
      setPasso(3);
    } catch {
      /* o toast já saiu em showApiError */
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => (!o ? fechar() : undefined)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("Nova conexão MCP")}</DialogTitle>
          <DialogDescription>{t("Passo {n} de 3").replace("{n}", String(passo))}</DialogDescription>
        </DialogHeader>

        {passo === 1 ? (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="mcp-nome">{t("Nome da conexão")}</Label>
              <Input
                id="mcp-nome"
                value={nome}
                maxLength={80}
                onChange={(e) => setNome(e.target.value)}
                placeholder={t("Ex.: Claude Code do time de vendas")}
              />
            </div>
            <div className="space-y-1">
              <Label>{t("Ferramenta")}</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {(Object.keys(ROTULO_DA_FERRAMENTA) as ConexaoMcp["tool"][]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    data-testid={`ferramenta-${f}`}
                    onClick={() => setFerramenta(f)}
                    className={`rounded-md border p-3 text-left text-sm ${ferramenta === f ? "border-primary bg-primary/10" : "border-border"}`}
                  >
                    {t(ROTULO_DA_FERRAMENTA[f])}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {passo === 2 && ferramenta !== "claude_desktop" ? <EscolhaDePermissoesForm valor={escolha} onChange={setEscolha} /> : null}
        {passo === 2 && ferramenta === "claude_desktop" ? (
          <p className="text-sm">
            {t("O Claude Desktop e o claude.ai conectam por login (OAuth): você escolhe as permissões na página de aprovação que o Claude abre. No próximo passo está o endereço para colar no Claude.")}
          </p>
        ) : null}
        {passo === 3 ? <InstrucoesDaFerramenta tool={ferramenta} url={url} token={token} /> : null}

        <DialogFooter>
          {passo === 1 ? (
            <>
              <Button type="button" variant="ghost" onClick={fechar}>
                {t("Cancelar")}
              </Button>
              <Button type="button" disabled={nome.trim().length === 0} onClick={() => setPasso(2)}>
                {t("Continuar")}
              </Button>
            </>
          ) : null}
          {passo === 2 ? (
            <>
              <Button type="button" variant="ghost" onClick={() => setPasso(1)}>
                {t("Voltar")}
              </Button>
              {ferramenta === "claude_desktop" ? (
                <Button type="button" onClick={() => setPasso(3)}>
                  {t("Continuar")}
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={criar.isPending || semEscopos}
                  title={semEscopos ? t("Escolha ao menos uma permissão.") : undefined}
                  onClick={() => void concluir()}
                >
                  {t("Criar conexão")}
                </Button>
              )}
            </>
          ) : null}
          {passo === 3 ? (
            <Button type="button" onClick={fechar}>
              {t("Concluir")}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// detalhe
// ---------------------------------------------------------------------------

function DetalheDaConexao({ id, onFechar, url }: { id: string | null; onFechar: () => void; url: string }) {
  const t = useT();
  const tagDoIdioma = useTagDeIdioma();
  const { data, isLoading } = useDetalheMcp(id);
  const acao = useAcaoNaConexaoMcp();
  const [confirmarRevogar, setConfirmarRevogar] = useState(false);
  const [tokenNovo, setTokenNovo] = useState<string | null>(null);
  const d = data?.data;
  const c = d?.connection;
  const dataHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString(tagDoIdioma) : "—");

  const fazer = async (qual: "revogar" | "renovar" | "reativar") => {
    if (!c) return;
    try {
      const r = await acao.mutateAsync({ id: c.id, acao: qual });
      if (qual === "renovar") setTokenNovo(r.data.token ?? null);
      if (qual === "revogar") toast.success(t("Conexão revogada."));
      if (qual === "reativar") toast.success(t("Conexão reativada."));
      setConfirmarRevogar(false);
    } catch {
      /* toast em showApiError */
    }
  };

  const fechar = () => {
    setConfirmarRevogar(false);
    setTokenNovo(null);
    onFechar();
  };

  return (
    <Dialog open={id !== null} onOpenChange={(o) => (!o ? fechar() : undefined)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{c?.name ?? t("Conexão MCP")}</DialogTitle>
          <DialogDescription>
            {c ? `${t(ROTULO_DA_FERRAMENTA[c.tool])} · ${t(ROTULO_DO_PERFIL[c.profile])} · ${t(ROTULO_DO_STATUS[c.status])}` : null}
          </DialogDescription>
        </DialogHeader>
        {isLoading || !d || !c ? (
          <p className="text-sm text-muted-foreground">{t("Carregando…")}</p>
        ) : (
          <div className="space-y-4 text-sm">
            {tokenNovo ? <InstrucoesDaFerramenta tool={c.tool} url={url} token={tokenNovo} /> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="font-medium">{t("Pode")}</p>
                <ul className="mt-1 list-disc pl-4 text-xs">
                  {(d.can as ItemDoResumo[]).map((p) => (
                    <li key={p}>{t(FRASE_DO_RESUMO[p])}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="font-medium">{t("Não pode")}</p>
                <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
                  {(d.cannot as ItemDoResumo[]).map((p) => (
                    <li key={p}>{t(FRASE_DO_RESUMO[p])}</li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("Telefone e e-mail")}: {c.show_pii ? t("visíveis") : t("mascarados")} · {t("IPs permitidos")}:{" "}
              {c.allowed_ips.length ? c.allowed_ips.join(", ") : t("qualquer")} · {t("Expira")}: {dataHora(c.expires_at)}
            </p>
            <div>
              <p className="mb-1 font-medium">{t("Últimas chamadas")}</p>
              {d.calls.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("Nenhuma chamada ainda.")}</p>
              ) : (
                <div className="max-h-72 overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("Quando")}</TableHead>
                        <TableHead>{t("Ferramenta")}</TableHead>
                        <TableHead>{t("Resultado")}</TableHead>
                        <TableHead>{t("Registros")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {d.calls.map((ch) => (
                        <TableRow key={ch.id}>
                          <TableCell className="text-xs">{dataHora(ch.created_at)}</TableCell>
                          <TableCell className="text-xs">
                            <code>{ch.tool}</code>
                          </TableCell>
                          <TableCell className="text-xs">
                            <Badge variant={ch.result === "ok" ? "secondary" : "destructive"}>{t(ROTULO_DO_RESULTADO[ch.result])}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">{ch.records}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
            {confirmarRevogar ? (
              <div className="rounded-md border border-destructive p-3" role="alert">
                <p>{t("Revogar corta o acesso na hora e não tem volta. Para usar de novo, crie outra conexão.")}</p>
                <div className="mt-2 flex gap-2">
                  <Button type="button" variant="destructive" disabled={acao.isPending} onClick={() => void fazer("revogar")}>
                    {t("Sim, revogar")}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setConfirmarRevogar(false)}>
                    {t("Cancelar")}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        )}
        <DialogFooter>
          {c && c.status === "suspensa" ? (
            <Button type="button" variant="secondary" disabled={acao.isPending} onClick={() => void fazer("reativar")}>
              {t("Reativar")}
            </Button>
          ) : null}
          {c && c.status !== "revogada" && c.auth_kind === "token" ? (
            <Button type="button" variant="secondary" disabled={acao.isPending} onClick={() => void fazer("renovar")}>
              {t("Renovar token")}
            </Button>
          ) : null}
          {c && c.status !== "revogada" ? (
            <Button type="button" variant="destructive" onClick={() => setConfirmarRevogar(true)}>
              {t("Revogar")}
            </Button>
          ) : null}
          <Button type="button" variant="ghost" onClick={fechar}>
            {t("Fechar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// a tela
// ---------------------------------------------------------------------------

export function ConexoesMcpClient() {
  const t = useT();
  const tagDoIdioma = useTagDeIdioma();
  const { data, isLoading } = usePainelMcp();
  const interruptor = useInterruptorMcp();
  const [assistente, setAssistente] = useState(false);
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const painel = data?.data;
  const conexoes = useMemo(() => painel?.connections ?? [], [painel]);
  const dataCurta = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(tagDoIdioma) : "—");

  if (isLoading || !painel) return <p className="text-sm text-muted-foreground">{t("Carregando…")}</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 rounded-md border p-4">
        <div>
          <Label htmlFor="mcp-ligado" className="text-base">
            {t("Permitir conexões MCP")}
          </Label>
          <p className="text-sm text-muted-foreground">
            {t("Desligado, nenhuma ferramenta de IA acessa o CRM por MCP — nem as conexões que já existem.")}
          </p>
        </div>
        <Switch
          id="mcp-ligado"
          data-testid="mcp-interruptor"
          checked={painel.enabled}
          disabled={interruptor.isPending}
          onCheckedChange={(v) => interruptor.mutate(v)}
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {t("Endereço do servidor")}: <code className="text-xs">{painel.server_url}</code>
        </p>
        <Button
          type="button"
          disabled={!painel.enabled}
          title={!painel.enabled ? t("Ligue \"Permitir conexões MCP\" para criar conexões.") : undefined}
          onClick={() => setAssistente(true)}
        >
          {t("Nova conexão")}
        </Button>
      </div>

      {conexoes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("Nenhuma conexão criada ainda.")}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Nome")}</TableHead>
                <TableHead>{t("Ferramenta")}</TableHead>
                <TableHead>{t("Perfil")}</TableHead>
                <TableHead>{t("Criada por")}</TableHead>
                <TableHead>{t("Expira")}</TableHead>
                <TableHead>{t("Último uso")}</TableHead>
                <TableHead>{t("Situação")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {conexoes.map((c) => (
                <TableRow key={c.id} data-testid="mcp-conexao-linha">
                  <TableCell>
                    <button type="button" className="font-medium underline-offset-2 hover:underline" onClick={() => setDetalhe(c.id)}>
                      {c.name}
                    </button>
                  </TableCell>
                  <TableCell className="text-sm">{t(ROTULO_DA_FERRAMENTA[c.tool])}</TableCell>
                  <TableCell className="text-sm">{t(ROTULO_DO_PERFIL[c.profile])}</TableCell>
                  <TableCell className="text-sm">
                    {c.created_by_name ?? "—"}
                    <span className="block text-xs text-muted-foreground">{dataCurta(c.created_at)}</span>
                  </TableCell>
                  <TableCell className="text-sm">{dataCurta(c.expires_at)}</TableCell>
                  <TableCell className="text-sm">
                    {dataCurta(c.last_used_at)}
                    {c.last_used_ip ? <span className="block text-xs text-muted-foreground">{c.last_used_ip}</span> : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant={corDoStatus(c.status)}>{t(ROTULO_DO_STATUS[c.status])}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-sm">
        <Link href="/app/settings/integracoes/mcp/como-funciona" className="underline underline-offset-2">
          {t("Como funciona")}
        </Link>
      </p>

      <AssistenteDeConexao aberto={assistente} onFechar={() => setAssistente(false)} url={painel.server_url} />
      <DetalheDaConexao id={detalhe} onFechar={() => setDetalhe(null)} url={painel.server_url} />
    </div>
  );
}
