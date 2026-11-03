"use client";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useHotkeys } from "react-hotkeys-hook";
import { Sidebar } from "@/components/shell/Sidebar";
import { GavetaDaLateral } from "@/components/shell/GavetaDaLateral";
import { AvisoDePropostaEmDestaque } from "@/components/shell/AvisoDePropostaEmDestaque";
import { SonsDaCentral } from "@/components/shell/SonsDaCentral";
import { BarraDeProgressoNavegacao } from "@/components/shell/BarraDeProgressoNavegacao";
import { useLateral, type PreferenciaDaLateral } from "@/components/shell/estado-da-lateral";
import { lateralForcadaRecolhida } from "@/components/shell/lateral-forcada";
import { useSinalDePresenca } from "@/hooks/atendimento/useSinalDePresenca";
import { useInboundMessageAlerts } from "@/hooks/notifications/useInboundMessageAlerts";
import { useInboundCallAlerts } from "@/hooks/calls/useInboundCallAlerts";
import { useCrmAlerts } from "@/hooks/notifications/useCrmAlerts";
import { useNotifyOpenFromServiceWorker } from "@/lib/notifications/notify_open";
import { useTheme } from "@/lib/theme";
import { estiloDaReserva, useOcupacaoDoRodape } from "@/lib/ui/rodape-ocupado";

interface AppShellProps {
  /** A escolha salva, lida do cookie no servidor; `null` = a largura decide. */
  preferenciaDaLateral?: PreferenciaDaLateral | null;
  /**
   * A pessoa pode atender (agent+)? Vem do papel resolvido no layout, e não de
   * uma consulta desta casca.
   *
   * Só quem atende emite o sinal de presença: o roster que a tela Equipe mostra
   * é agent+, e a rota do sinal exige o mesmo papel. `viewer` batendo colheria
   * 403 a cada minuto em nome de ninguém.
   */
  podeAtender: boolean;
  /**
   * Faixas de aviso (suporte em andamento, conexão caída): no topo da área de
   * conteúdo, acima do título da página — a barra do topo, onde elas ficavam
   * por cima de tudo, saiu (Etapa 7).
   */
  faixas?: ReactNode;
  children: ReactNode;
}

/**
 * A CASCA (Etapa 7): lateral à esquerda e conteúdo ocupando a altura inteira
 * da janela — sem barra no topo. Cada página rola dentro do `<main>`; a
 * lateral nunca rola junto (só a navegação dela, quando não cabe).
 */
export function AppShell({ preferenciaDaLateral = null, podeAtender, faixas, children }: AppShellProps) {
  useInboundMessageAlerts();
  useInboundCallAlerts();
  useCrmAlerts();
  useNotifyOpenFromServiceWorker();
  // O SINAL DE PRESENÇA (issue #996) sai daqui porque presença é "esta aba
  // está aberta" — não "a pessoa está na tela Equipe".
  useSinalDePresenca(podeAtender);
  // O atalho de tema (era do botão do topo): uma vez só, na casca — o botão do
  // rodapé existe duas vezes quando a gaveta está aberta.
  const { toggle } = useTheme();
  useHotkeys("mod+shift+l", toggle, { preventDefault: true }, [toggle]);
  // O que as peças fixas do rodapé declararam ocupar agora (issue #1305). Sem
  // chamada nenhuma é ZERO, e aí o `<main>` fica exatamente como sempre foi.
  // Com o painel de chamada na tela, é ele que decide a faixa que o conteúdo
  // perde, e ninguém mais mede isso por fora.
  const ocupacaoDoRodape = useOcupacaoDoRodape();

  const pathname = usePathname();
  const lateral = useLateral(preferenciaDaLateral);
  const forcada = lateralForcadaRecolhida(pathname);
  const [pronta, setPronta] = useState(false);
  // Só depois do primeiro quadro a troca de largura anima.
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setPronta(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  return (
    <div className="sh-app" data-testid="casca">
      <Sidebar
        collapsed={forcada || lateral.recolhida}
        automatica={!forcada && lateral.automatica}
        pronta={pronta}
        onToggle={forcada ? undefined : lateral.alternar}
      />
      <GavetaDaLateral />
      {/*
        `min-w-0` (em `.sh-coluna`) é o que permite a coluna de conteúdo
        ENCOLHER: um flex item nasce com `min-width: auto` e nunca fica menor
        que o conteúdo — qualquer bloco largo empurrava a página inteira para o
        lado em vez de rolar dentro da própria caixa.
      */}
      <div className="sh-coluna">
        {/* A barra de progresso da navegação: linha fina no topo do conteúdo. */}
        <BarraDeProgressoNavegacao />
        <div className="sh-faixas">{faixas}</div>
        {/*
          O RODAPÉ DESCONTA O QUE AS PEÇAS FIXAS OCUPAM (issue #1305).

          `estiloDaReserva` devolve `undefined` quando não há peça registrada —
          nenhum estilo, o respiro de sempre —, e um `padding-bottom` que consome
          `--rodape-ocupado` quando há. O que ele descontou está também no
          atributo `data-rodape-ocupado`: é por ali que o gate mede esta faixa
          sem depender de o jsdom computar `var()` (ele não computa).
        */}
        <main className="sh-main" style={estiloDaReserva(ocupacaoDoRodape)} data-rodape-ocupado={ocupacaoDoRodape}>
          {children}
        </main>
      </div>
      {/* Cartão fixo de proposta pronta (portal) e o som da Central: eram do
          sino do topo, e precisam existir uma vez só, em toda tela. */}
      <AvisoDePropostaEmDestaque />
      <SonsDaCentral />
    </div>
  );
}
