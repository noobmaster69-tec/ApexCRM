import { execFileSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

/**
 * AS CONEXÕES MCP NÃO VAZAM — NEM ENTRE ORGANIZAÇÕES, NEM PARA QUEM NÃO É ADMIN
 * (migration 9023, fork jhoow).
 *
 * `mcp_connections` e `mcp_call_log` têm RLS de admin (`fn_role_at_least(...,
 * 'admin')`): a tela de MCP é só do admin, e a sessão de um atendente não lê nem
 * o nome nem o hash do token. `mcp_oauth_codes` e `mcp_oauth_tokens` têm RLS
 * ligada e NENHUMA política: só o servidor (service role) lê.
 *
 * 1. Controle positivo: o admin lê as conexões e o registro da própria org.
 * 2. Isolamento: zero linhas do vizinho, nos dois sentidos.
 * 3. Papel: o agent da MESMA organização lê zero (não só "do vizinho").
 * 4. Escrita cruzada recusada; códigos e tokens OAuth invisíveis à sessão.
 * 5. anon sem acesso.
 */

const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error("TEST_DB_CONTAINER not set — rode esta suíte via `pnpm test:db` (scripts/test-db.sh)");
}
const containerName: string = container;

function sql(script: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", containerName, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-f", "-"],
    { input: script, encoding: "utf8" },
  ).trim();
}

function sqlstate(script: string): string | null {
  try {
    sql(`\\set VERBOSITY verbose\n${script}`);
    return null;
  } catch (err) {
    const saida = String((err as { stderr?: string }).stderr ?? err);
    return /ERROR:\s+([0-9A-Z]{5})/.exec(saida)?.[1] ?? saida;
  }
}

function como(userId: string, consulta: string): number {
  const ultima =
    sql(`
    set role authenticated;
    select set_config('request.jwt.claims', '{"sub":"${userId}"}', false);
    ${consulta}
  `)
      .split("\n")
      .pop() ?? "";
  if (!/^\d+$/.test(ultima)) throw new Error(`saída inesperada do psql: ${ultima}`);
  return Number(ultima);
}

const ORG_A = "9c900000-0000-4000-8000-00000000000a";
const ORG_B = "9c900000-0000-4000-8000-00000000000b";
const ADMIN_A = "9c900000-1111-4000-8000-00000000000a";
const AGENT_A = "9c900000-1111-4000-8000-00000000000c";
const ADMIN_B = "9c900000-1111-4000-8000-00000000000b";
const CONEXAO_A = "9c900000-2222-4000-8000-00000000000a";
const CONEXAO_B = "9c900000-2222-4000-8000-00000000000b";

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${ADMIN_A}', 'mcp-admin-a@invariant.test'),
      ('${AGENT_A}', 'mcp-agent-a@invariant.test'),
      ('${ADMIN_B}', 'mcp-admin-b@invariant.test')
      on conflict (id) do nothing;

    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'mcp-inv-a', 'MCP Invariant A', 'MCP A'),
      ('${ORG_B}', 'mcp-inv-b', 'MCP Invariant B', 'MCP B')
      on conflict (id) do nothing;

    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${ADMIN_A}', '${ORG_A}', 'admin', now()),
      ('${AGENT_A}', '${ORG_A}', 'agent', now()),
      ('${ADMIN_B}', '${ORG_B}', 'admin', now())
      on conflict do nothing;

    insert into public.mcp_connections
      (id, organization_id, name, tool, profile, scopes, token_hash, created_by_user_id, expires_at) values
      ('${CONEXAO_A}', '${ORG_A}', 'Conexão A', 'claude_code', 'somente_leitura', '{contacts:read}',
       decode(md5('a') || md5('a'), 'hex'), '${ADMIN_A}', now() + interval '90 days'),
      ('${CONEXAO_B}', '${ORG_B}', 'Conexão B', 'cursor', 'somente_leitura', '{contacts:read}',
       decode(md5('b') || md5('b'), 'hex'), '${ADMIN_B}', now() + interval '90 days')
      on conflict (id) do nothing;

    insert into public.mcp_call_log (organization_id, connection_id, owner_user_id, tool, result)
    select v.org, v.con, v.dono, 'list_contacts', 'ok'
      from (values ('${ORG_A}'::uuid, '${CONEXAO_A}'::uuid, '${ADMIN_A}'::uuid),
                   ('${ORG_B}'::uuid, '${CONEXAO_B}'::uuid, '${ADMIN_B}'::uuid)) as v(org, con, dono)
     where not exists (select 1 from public.mcp_call_log l where l.connection_id = v.con);

    insert into public.mcp_oauth_tokens
      (organization_id, connection_id, access_hash, access_expires_at, refresh_hash, refresh_expires_at)
    select '${ORG_A}', '${CONEXAO_A}', decode(md5('acc'), 'hex'), now() + interval '1 hour',
           decode(md5('ref'), 'hex'), now() + interval '90 days'
     where not exists (select 1 from public.mcp_oauth_tokens t where t.connection_id = '${CONEXAO_A}');
  `);
});

describe("mcp_connections e mcp_call_log — leitura", () => {
  it("controle positivo: o admin lê a conexão e o registro da própria organização", () => {
    expect(como(ADMIN_A, `select count(*) from public.mcp_connections where organization_id = '${ORG_A}';`)).toBe(1);
    expect(como(ADMIN_A, `select count(*) from public.mcp_call_log where organization_id = '${ORG_A}';`)).toBeGreaterThan(0);
  });

  it("isolamento: zero linhas do vizinho, nos dois sentidos", () => {
    expect(como(ADMIN_A, `select count(*) from public.mcp_connections where organization_id = '${ORG_B}';`)).toBe(0);
    expect(como(ADMIN_B, `select count(*) from public.mcp_connections where organization_id = '${ORG_A}';`)).toBe(0);
    expect(como(ADMIN_A, `select count(*) from public.mcp_call_log where organization_id = '${ORG_B}';`)).toBe(0);
  });

  it("o agent da MESMA organização não lê conexão nem registro (a tela é só do admin)", () => {
    expect(como(AGENT_A, `select count(*) from public.mcp_connections;`)).toBe(0);
    expect(como(AGENT_A, `select count(*) from public.mcp_call_log;`)).toBe(0);
  });

  it("anon não tem acesso", () => {
    expect(sqlstate(`set role anon; select count(*) from public.mcp_connections;`)).toBe("42501");
    expect(sqlstate(`set role anon; select count(*) from public.mcp_call_log;`)).toBe("42501");
  });
});

describe("mcp_connections — escrita", () => {
  it("o admin do vizinho não revoga nem renomeia a conexão de outra organização", () => {
    sql(`
      set role authenticated;
      select set_config('request.jwt.claims', '{"sub":"${ADMIN_B}"}', false);
      update public.mcp_connections set revoked_at = now(), name = 'tomada' where id = '${CONEXAO_A}';
      delete from public.mcp_connections where id = '${CONEXAO_A}';
    `);
    expect(sql(`select name || ':' || (revoked_at is null) from public.mcp_connections where id = '${CONEXAO_A}'`)).toBe(
      "Conexão A:true",
    );
  });

  it("o agent não cria conexão na própria organização", () => {
    expect(
      sqlstate(`set role authenticated;
                select set_config('request.jwt.claims', '{"sub":"${AGENT_A}"}', false);
                insert into public.mcp_connections (organization_id, name, tool, profile, token_hash, created_by_user_id, expires_at)
                values ('${ORG_A}', 'do agent', 'outra', 'somente_leitura', decode(md5('x'), 'hex'), '${AGENT_A}', now() + interval '30 days');`),
    ).toBe("42501");
  });

  it("escopo fora da lista fechada é recusado pelo banco", () => {
    expect(
      sqlstate(`insert into public.mcp_connections (organization_id, name, tool, profile, scopes, token_hash, created_by_user_id, expires_at)
                values ('${ORG_A}', 'escopo inventado', 'outra', 'personalizado', '{billing:read}', decode(md5('y'), 'hex'), '${ADMIN_A}', now() + interval '30 days');`),
    ).toBe("23514");
  });
});

describe("mcp_oauth_codes e mcp_oauth_tokens — só o servidor", () => {
  it("nem o admin da própria organização lê token OAuth pela sessão", () => {
    expect(sqlstate(`set role authenticated;
                     select set_config('request.jwt.claims', '{"sub":"${ADMIN_A}"}', false);
                     select count(*) from public.mcp_oauth_tokens;`)).toBe("42501");
    expect(sqlstate(`set role authenticated;
                     select set_config('request.jwt.claims', '{"sub":"${ADMIN_A}"}', false);
                     select count(*) from public.mcp_oauth_codes;`)).toBe("42501");
  });

  it("controle positivo: a linha existe para o servidor", () => {
    expect(Number(sql(`select count(*) from public.mcp_oauth_tokens where connection_id = '${CONEXAO_A}'`))).toBe(1);
  });
});
