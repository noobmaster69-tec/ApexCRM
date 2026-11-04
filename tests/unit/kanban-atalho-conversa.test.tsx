import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * A conversa no card do funil.
 *
 * Até o card compacto (estilo Leona), o quadro tinha um `ConversaSlot` com o
 * atalho "Abrir no Inbox". Ele saiu: o clique no card abre o chat flutuante, e
 * a prévia, a hora e as não lidas moram no próprio card. O que continua valendo
 * é o elo de dados — a rota do quadro anexar a conversa MAIS RECENTE do contato
 * e o card de fato lê-la. Componente perfeito com dado que não chega é o
 * defeito que estes casos vigiam.
 */
describe("o elo que some sem barulho", () => {
  it("a rota do quadro anexa a conversa — sem isso o card nunca tem o que mostrar", () => {
    // O componente pode estar perfeito e nunca aparecer, porque o dado não
    // chega. Mesma classe do filtro por `tag`: o defeito mora no arquivo que
    // ninguém testou.
    const fonte = readFileSync("app/api/v1/pipelines/[id]/board/route.ts", "utf8");
    expect(fonte, "falta withConversas").toContain("withConversas");
    expect(fonte, "withConversas não foi chamada").toMatch(
      /leadsComConversa\s*=\s*await withConversas/,
    );
    // Chamar e não USAR o resultado é o defeito de verdade: a função roda, o
    // custo se paga, e a resposta sai sem a conversa. A primeira versão deste
    // caso só olhava a chamada e o sabote passou.
    //
    // A resposta não sai mais direto de `withConversas`: a cadeia é
    // withConversas → withMarcadoresDoContato → resposta. Exigir o texto
    // `leads: leadsComConversa.leads` reprovava quem acrescentava uma etapa
    // CERTA depois dela; o que importa é o resultado dela alimentar a próxima,
    // e a resposta sair da última.
    expect(
      fonte,
      "o resultado de withConversas não alimenta withMarcadoresDoContato (cadeia: withConversas → withMarcadoresDoContato → resposta)",
    ).toMatch(/withMarcadoresDoContato\(\s*supabase,[\s\S]*?leadsComConversa\.leads/);
    expect(
      fonte,
      "a resposta não sai da última etapa (cadeia: withConversas → withMarcadoresDoContato → resposta)",
    ).toMatch(/leads:\s*leadsComMarcadores\.leads/);
  });

  it("contato SEM conversa sai como `null`, não ausente — senão \"Abrir conversa\" nunca aparece (#1993)", () => {
    // O slot e o dossiê só pintam a ação com `conversa === null`; `undefined` é
    // "ainda não carregou" e fica mudo. A primeira versão do #2207 testava o
    // componente com `conversa={null}` direto, um valor que a rota não produzia:
    // ela fazia `...(conversa ? { conversa } : {})` e o campo saía AUSENTE. O
    // componente estava certo e o botão nunca aparecia no quadro de verdade.
    const fonte = readFileSync("app/api/v1/pipelines/[id]/board/route.ts", "utf8");
    const corpo = fonte.slice(fonte.indexOf("async function withConversas"));
    const daFuncao = corpo.slice(0, corpo.indexOf("\n}\n"));
    // Lead sem contato continua sem o campo: ele sai antes, e é ausência legítima.
    expect(daFuncao).toMatch(/if \(!lead\.contact_id\) return lead;/);
    expect(daFuncao, "contato sem conversa precisa virar `conversa: null`").toMatch(
      /conversa:\s*conversa\s*\?\?\s*null/,
    );
    expect(daFuncao, "espalhar condicional deixa o campo ausente (undefined)").not.toMatch(
      /\.\.\.\(conversa\s*\?/,
    );
  });

  it("a mais RECENTE por contato — não a primeira que o banco devolver", () => {
    const fonte = readFileSync("app/api/v1/pipelines/[id]/board/route.ts", "utf8");
    expect(fonte).toMatch(/order\("last_message_at",\s*\{\s*ascending:\s*false/);
  });

  it("o card lê a conversa — prévia, hora e não lidas vêm dela", () => {
    // Sem esta leitura a rota anexaria a conversa para ninguém: o card compacto
    // (estilo Leona) é quem a mostra, e o clique abre o chat por ela.
    const fonte = readFileSync("components/kanban/KanbanCard.tsx", "utf8");
    expect(fonte).toContain("lead.conversa?.preview");
    expect(fonte).toContain("lead.conversa?.last_message_at");
    expect(fonte).toContain("lead.conversa?.unread");
    expect(fonte).toMatch(/chats\.abrirChat\(lead\.conversa\.id/);
  });
});
