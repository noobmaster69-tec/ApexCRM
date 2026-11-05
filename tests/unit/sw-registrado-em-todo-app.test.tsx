import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * O SW nasce em toda tela do app, e não só depois de a pessoa permitir os
 * avisos: é ele que responde a página neutra quando a navegação cai sem rede,
 * e é a primeira abertura do app depois de um deploy que troca o SW antigo.
 */
const registrar = vi.hoisted(() => vi.fn().mockResolvedValue(null));
vi.mock("@/lib/notifications/service_worker", () => ({ ensureNotifyServiceWorker: registrar }));
vi.mock("@/components/shell/Sidebar", () => ({ Sidebar: () => null, SidebarContent: () => null }));
vi.mock("@/components/shell/AvisoDePropostaEmDestaque", () => ({ AvisoDePropostaEmDestaque: () => null }));
vi.mock("@/components/shell/SonsDaCentral", () => ({ SonsDaCentral: () => null }));
vi.mock("@/components/shell/GavetaDaLateral", () => ({ GavetaDaLateral: () => null }));
// A casca do fork (jhoow) lê o tema para o atalho de claro/escuro.
vi.mock("@/lib/theme", () => ({ useTheme: () => ({ toggle: () => {} }) }));
vi.mock("@/components/shell/TopBar", () => ({ TopBar: () => null }));
vi.mock("@/components/shell/BarraDeProgressoNavegacao", () => ({ BarraDeProgressoNavegacao: () => null }));
vi.mock("@/hooks/atendimento/useSinalDePresenca", () => ({ useSinalDePresenca: () => {} }));
vi.mock("@/hooks/notifications/useInboundMessageAlerts", () => ({ useInboundMessageAlerts: () => {} }));
vi.mock("@/hooks/notifications/useCrmAlerts", () => ({ useCrmAlerts: () => {} }));
vi.mock("@/hooks/calls/useInboundCallAlerts", () => ({ useInboundCallAlerts: () => {} }));
vi.mock("@/lib/notifications/notify_open", () => ({ useNotifyOpenFromServiceWorker: () => {} }));

import { AppShell } from "@/app/app/_components/AppShell";
import { ProvedorDaOcupacaoDoRodape } from "@/lib/ui/rodape-ocupado";

// A lateral (fork jhoow) lê `matchMedia` para recolher na faixa estreita; o
// jsdom não o implementa.
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia;

describe("service worker em todo /app", () => {
  it("registra ao montar a casca, sem esperar a permissão de avisos", () => {
    expect(typeof Notification === "undefined" || Notification.permission !== "granted").toBe(true);
    render(
      <ProvedorDaOcupacaoDoRodape>
        <AppShell preferenciaDaLateral={null} podeAtender={false}>
          <p>conteúdo</p>
        </AppShell>
      </ProvedorDaOcupacaoDoRodape>,
    );
    expect(registrar).toHaveBeenCalledTimes(1);
  });
});
