/**
 * Busca e comparação de etiquetas no seletor do bloco Etiquetas (Fluxos).
 *
 * Duas réguas, de propósito:
 * - `chaveDeBusca` ignora caixa, acento e espaço nas pontas — é a que decide
 *   "esta etiqueta já existe" e evita criar `Lead` ao lado de `lead`;
 * - o filtro da lista usa a mesma chave, por `includes`, para `lead` achar
 *   `[LEAD-OUTBOUND-GOOGLE]`.
 */
export function chaveDeBusca(texto: string): string {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
}

export interface EtiquetaDaConta {
  nome: string;
  cor: string | null;
}

/** Junta nomes e cores numa lista única, sem repetir pela chave, em ordem alfabética. */
export function juntarEtiquetas(
  nomes: readonly string[],
  cores: readonly { tag: string; cor: string | null }[],
): EtiquetaDaConta[] {
  const porChave = new Map<string, EtiquetaDaConta>();
  // A grafia do vocabulário curado (com cor) vence a do uso, que vem minúscula.
  for (const { tag, cor } of cores) {
    const chave = chaveDeBusca(tag);
    if (chave) porChave.set(chave, { nome: tag.trim(), cor: cor ?? null });
  }
  for (const nome of nomes) {
    const chave = chaveDeBusca(nome);
    if (chave && !porChave.has(chave)) porChave.set(chave, { nome: nome.trim(), cor: null });
  }
  return [...porChave.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
}

/** As etiquetas da conta que contêm o texto digitado (vazio = todas). */
export function filtrarEtiquetas(lista: readonly EtiquetaDaConta[], texto: string): EtiquetaDaConta[] {
  const busca = chaveDeBusca(texto);
  if (!busca) return [...lista];
  return lista.filter((e) => chaveDeBusca(e.nome).includes(busca));
}

/** A etiqueta com exatamente o mesmo nome (pela chave), se existir. */
export function etiquetaIgual(lista: readonly EtiquetaDaConta[], texto: string): EtiquetaDaConta | null {
  const busca = chaveDeBusca(texto);
  if (!busca) return null;
  return lista.find((e) => chaveDeBusca(e.nome) === busca) ?? null;
}

/** `true` quando `nome` já está entre `escolhidas` (pela chave). */
export function contemEtiqueta(escolhidas: readonly string[], nome: string): boolean {
  const chave = chaveDeBusca(nome);
  return escolhidas.some((e) => chaveDeBusca(e) === chave);
}
