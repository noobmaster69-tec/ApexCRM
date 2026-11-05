/**
 * As contas do "Resumo do envio" (passo Ritmo): quantos por dia, de quanto em
 * quanto tempo, quantos dias e quando termina. Puras — a tela recalcula a cada
 * clique sem perguntar ao servidor. Sem dias da semana configuráveis na
 * plataforma, os dias de envio são corridos.
 */
import { janelaDosValores, modoDoRitmo, type ValoresDeRitmo } from "@/components/campanhas/CamposDeRitmo";
import { camposDoInstante, minutoDoDia } from "@/lib/campanhas/agendamento";

export interface ContaDoEnvio {
  porDia: number;
  /** Minutos entre um envio e o próximo dentro da janela. */
  intervaloMin: number;
  dias: number;
  /** "AAAA-MM-DD" do primeiro e do último dia de envio. */
  inicio: string;
  fim: string;
  janela: { inicio: number; fim: number };
}

/** Envios por dia que o ritmo escolhido permite. */
export function enviosPorDia(v: ValoresDeRitmo): number | null {
  const janela = janelaDosValores(v);
  if (!janela) return null;
  const minutos = janela.fim - janela.inicio;
  if (modoDoRitmo(v) === "cota") {
    const n = Number((v.cotaQuantidade ?? "").trim());
    if (!(n >= 1)) return null;
    const p = v.cotaPeriodo || "dia";
    if (p === "dia") return Math.floor(n);
    if (p === "hora") return Math.floor(n * (minutos / 60));
    if (p === "semana") return Math.max(1, Math.round(n / 7));
    return Math.max(1, Math.round(n / 30));
  }
  const min = Number(v.minIntervalo);
  const max = Number(v.maxIntervalo);
  if (!(min > 0) || !(max >= min)) return null;
  let n = Math.floor((minutos * 60) / ((min + max) / 2));
  const teto = Number(v.tetoDiario);
  if (v.tetoDiario.trim() && teto > 0) n = Math.min(n, teto);
  const porHora = Number(v.tetoHorario);
  if (v.tetoHorario.trim() && porHora > 0) n = Math.min(n, Math.floor(porHora * (minutos / 60)));
  return Math.max(0, n);
}

function somarDias(dia: string, n: number): string {
  const [a, m, d] = dia.split("-").map(Number);
  const x = new Date(Date.UTC(a!, m! - 1, d! + n, 12));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}-${String(x.getUTCDate()).padStart(2, "0")}`;
}

export function contaDoEnvio(v: ValoresDeRitmo, total: number, agora: Date, fuso: string): ContaDoEnvio | null {
  const janela = janelaDosValores(v);
  const porDia = enviosPorDia(v);
  if (!janela || !porDia || porDia < 1) return null;
  const intervaloMin = (janela.fim - janela.inicio) / porDia;
  const dias = Math.max(1, Math.ceil(Math.max(1, total) / porDia));
  let inicio: string;
  if (v.inicioModo === "agendar" && v.inicioData) {
    inicio = v.inicioData;
  } else {
    const hoje = camposDoInstante(agora, fuso).data;
    // Depois da janela de hoje, o primeiro envio é amanhã.
    inicio = minutoDoDia(agora, fuso) >= janela.fim ? somarDias(hoje, 1) : hoje;
  }
  return { porDia, intervaloMin, dias, inicio, fim: somarDias(inicio, dias - 1), janela };
}

/** "54 min", "1h30", "2h" — o intervalo para a frase. */
export function textoDoIntervalo(minutos: number): string {
  if (minutos < 1) return `${Math.max(1, Math.round(minutos * 60))} s`;
  if (minutos < 60) return `${Math.round(minutos)} min`;
  const h = Math.floor(minutos / 60);
  const m = Math.round(minutos - h * 60);
  return m === 0 ? `${h}h` : m === 60 ? `${h + 1}h` : `${h}h${String(m).padStart(2, "0")}`;
}

/** Onde cai cada envio do dia na régua (em % do dia), no máximo 60 marcas. */
export function marcasDoDia(janela: { inicio: number; fim: number }, porDia: number, maximo = 60): number[] {
  const n = Math.min(maximo, Math.max(0, porDia));
  const dur = janela.fim - janela.inicio;
  return Array.from({ length: n }, (_, i) => ((janela.inicio + ((i + 0.5) * dur) / porDia) / 1440) * 100).filter(
    (x) => x <= (janela.fim / 1440) * 100,
  );
}
