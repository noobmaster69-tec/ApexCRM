/**
 * QUANDO A CAMPANHA TERMINA (fork jhoow, destaque "Enviando agora"): a
 * cadência vezes os contatos que faltam, respeitando a janela diária no fuso
 * da campanha. É uma PREVISÃO: o envio real sorteia ±20% em volta da cadência
 * e para nos tetos do número — o número da tela diz "por volta de".
 */
import { horarioDosMinutos, instanteDoHorarioLocal, camposDoInstante, proximaAbertura, type JanelaDiaria } from "./agendamento";

/** Dias que a conta percorre antes de desistir (uma previsão de um ano não informa nada). */
const DIAS_NO_MAXIMO = 366;

/** O fim da janela do dia de `instante` (no fuso), aceitando o "24:00". */
function fimDaJanelaNoDia(instante: Date, fuso: string, janela: JanelaDiaria): Date | null {
  const { data } = camposDoInstante(instante, fuso);
  if (janela.fim >= 1440) {
    const meiaNoite = instanteDoHorarioLocal(data, "00:00", fuso);
    return meiaNoite ? new Date(meiaNoite.getTime() + 24 * 3600_000) : null;
  }
  return instanteDoHorarioLocal(data, horarioDosMinutos(janela.fim), fuso);
}

export function previsaoDoFim(entrada: {
  agora: Date;
  restantes: number;
  cadenciaSegundos: number | null;
  janela: JanelaDiaria | null;
  fuso: string;
  /** Quando o próximo envio está marcado (a espera da janela ou da cota). */
  proximoEnvio?: Date | null;
  /** Máximo por dia (o teto), quando houver. */
  tetoDiario?: number | null;
}): Date | null {
  const { restantes, janela, fuso } = entrada;
  const passo = (entrada.cadenciaSegundos ?? 0) * 1000;
  if (!(restantes > 0) || !(passo > 0)) return null;
  let t = new Date(Math.max(entrada.agora.getTime(), entrada.proximoEnvio?.getTime() ?? 0));
  if (!janela) return new Date(t.getTime() + (restantes - 1) * passo);

  let falta = restantes;
  for (let dia = 0; dia < DIAS_NO_MAXIMO; dia += 1) {
    t = proximaAbertura(t, fuso, janela);
    const fim = fimDaJanelaNoDia(t, fuso, janela);
    if (!fim || fim.getTime() <= t.getTime()) {
      t = new Date(t.getTime() + 60_000);
      continue;
    }
    let cabem = Math.floor((fim.getTime() - 1 - t.getTime()) / passo) + 1;
    if (entrada.tetoDiario && entrada.tetoDiario > 0) cabem = Math.min(cabem, entrada.tetoDiario);
    if (falta <= cabem) return new Date(t.getTime() + (falta - 1) * passo);
    falta -= cabem;
    t = fim;
  }
  return null;
}

/** O fuso de quem olha, quando a campanha não tem o dela. */
export function fusoDoNavegador(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
