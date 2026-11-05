/**
 * Um dublê MÍNIMO do client do Supabase, em memória, para os testes das
 * conexões MCP (`lib/mcp/v1`). Cobre só a parte do construtor de consultas que
 * aquele código usa: `select` (com `count`/`head`), `insert`, `update`,
 * `delete`, os filtros `eq/neq/is/in/gt/gte/lt/lte/or` (o `or` só com termos
 * simples `col.op.valor`), `order`, `limit`, `single` e `maybeSingle`.
 *
 * Não é um Postgres: não há RLS, constraint nem tipo. O que os testes provam
 * com ele é o que o CÓDIGO pede ao banco — filtro de organização inclusive,
 * porque uma consulta sem `.eq("organization_id", …)` devolve a linha de outra
 * organização aqui, exatamente como o service role devolveria.
 */
type Linha = Record<string, unknown>;
type Filtro = (l: Linha) => boolean;

function comparar(a: unknown, b: unknown): number {
  const x = typeof a === "string" && typeof b === "string" ? a : Number(a);
  const y = typeof a === "string" && typeof b === "string" ? b : Number(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

function termoDoOr(termo: string): Filtro {
  const [col, op, ...resto] = termo.split(".");
  const valor = resto.join(".");
  return (l) => {
    const v = l[col!];
    if (op === "is") return valor === "null" ? v === null || v === undefined : String(v) === valor;
    if (op === "eq") return String(v) === valor;
    if (op === "lt") return v !== null && v !== undefined && comparar(v, valor) < 0;
    if (op === "gt") return v !== null && v !== undefined && comparar(v, valor) > 0;
    throw new Error(`or: operador não suportado no dublê: ${op}`);
  };
}

class Consulta implements PromiseLike<{ data: unknown; error: null; count?: number | null }> {
  private filtros: Filtro[] = [];
  private ordens: Array<{ col: string; asc: boolean }> = [];
  private teto: number | null = null;
  private modo: "select" | "insert" | "update" | "delete" = "select";
  private patch: Linha | null = null;
  private novas: Linha[] = [];
  private retorna = false;
  private unico: "single" | "maybe" | null = null;
  private contar = false;
  private soCabeca = false;

  constructor(
    private readonly banco: BancoEmMemoria,
    private readonly tabela: string,
  ) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.modo === "select") {
      this.contar = Boolean(opts?.count);
      this.soCabeca = Boolean(opts?.head);
    } else this.retorna = true;
    return this;
  }
  insert(linhas: Linha | Linha[]) {
    this.modo = "insert";
    this.novas = (Array.isArray(linhas) ? linhas : [linhas]).map((l) => ({ ...l }));
    return this;
  }
  update(patch: Linha) {
    this.modo = "update";
    this.patch = patch;
    return this;
  }
  delete() {
    this.modo = "delete";
    return this;
  }
  eq(col: string, v: unknown) {
    this.filtros.push((l) => l[col] === v);
    return this;
  }
  neq(col: string, v: unknown) {
    this.filtros.push((l) => l[col] !== v);
    return this;
  }
  is(col: string, v: null) {
    this.filtros.push((l) => (v === null ? l[col] === null || l[col] === undefined : l[col] === v));
    return this;
  }
  in(col: string, vs: unknown[]) {
    this.filtros.push((l) => vs.includes(l[col]));
    return this;
  }
  gt(col: string, v: unknown) {
    this.filtros.push((l) => l[col] != null && comparar(l[col], v) > 0);
    return this;
  }
  gte(col: string, v: unknown) {
    this.filtros.push((l) => l[col] != null && comparar(l[col], v) >= 0);
    return this;
  }
  lt(col: string, v: unknown) {
    this.filtros.push((l) => l[col] != null && comparar(l[col], v) < 0);
    return this;
  }
  lte(col: string, v: unknown) {
    this.filtros.push((l) => l[col] != null && comparar(l[col], v) <= 0);
    return this;
  }
  or(expr: string) {
    const termos = expr.split(",").map(termoDoOr);
    this.filtros.push((l) => termos.some((t) => t(l)));
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.ordens.push({ col, asc: opts?.ascending !== false });
    return this;
  }
  limit(n: number) {
    this.teto = n;
    return this;
  }
  single() {
    this.unico = "single";
    return this;
  }
  maybeSingle() {
    this.unico = "maybe";
    return this;
  }

  private executar(): { data: unknown; error: null | { message: string; code?: string }; count?: number | null } {
    const tabela = this.banco.tabela(this.tabela);
    let afetadas: Linha[];
    if (this.modo === "insert") {
      for (const n of this.novas) {
        if (!("id" in n)) n.id = `${this.tabela}-${++this.banco.sequencia}`;
        if (!("created_at" in n)) n.created_at = new Date().toISOString();
      }
      tabela.push(...this.novas);
      afetadas = this.novas;
      if (!this.retorna && !this.unico) return { data: null, error: null };
    } else {
      afetadas = tabela.filter((l) => this.filtros.every((f) => f(l)));
      for (const o of [...this.ordens].reverse()) {
        afetadas.sort((a, b) => (o.asc ? 1 : -1) * comparar(a[o.col], b[o.col]));
      }
      if (this.teto !== null) afetadas = afetadas.slice(0, this.teto);
      if (this.modo === "update") for (const l of afetadas) Object.assign(l, this.patch);
      if (this.modo === "delete") {
        const fora = new Set(afetadas);
        this.banco.tabelas.set(this.tabela, tabela.filter((l) => !fora.has(l)));
      }
      if (this.modo !== "select" && !this.retorna && !this.unico) return { data: null, error: null };
    }
    if (this.contar) return { data: this.soCabeca ? null : afetadas, error: null, count: afetadas.length };
    const copia = afetadas.map((l) => ({ ...l }));
    if (this.unico === "maybe") return { data: copia[0] ?? null, error: null };
    if (this.unico === "single") {
      return copia.length === 1
        ? { data: copia[0], error: null }
        : { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" } };
    }
    return { data: copia, error: null };
  }

  then<R1 = { data: unknown; error: null; count?: number | null }, R2 = never>(
    ok?: ((v: { data: unknown; error: null; count?: number | null }) => R1 | PromiseLike<R1>) | null,
    falha?: ((e: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve()
      .then(() => this.executar() as { data: unknown; error: null; count?: number | null })
      .then(ok, falha);
  }
}

export class BancoEmMemoria {
  readonly tabelas = new Map<string, Linha[]>();
  sequencia = 0;
  /** Nomes que `auth.admin.getUserById` devolve. */
  readonly nomes = new Map<string, string>();

  tabela(nome: string): Linha[] {
    if (!this.tabelas.has(nome)) this.tabelas.set(nome, []);
    return this.tabelas.get(nome)!;
  }

  linhas(nome: string): Linha[] {
    return this.tabela(nome);
  }

  from(nome: string) {
    return new Consulta(this, nome);
  }

  readonly auth = {
    admin: {
      getUserById: async (id: string) => ({
        data: { user: { id, user_metadata: { full_name: this.nomes.get(id) ?? null } } },
        error: null,
      }),
    },
  };

  /** O client como o código o recebe. */
  comoCliente<T>(): T {
    return this as unknown as T;
  }
}
