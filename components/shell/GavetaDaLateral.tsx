"use client";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Menu } from "lucide-react";

import { useT } from "@/hooks/i18n/useT";

import { SidebarContent } from "./Sidebar";

/**
 * Abaixo de 1024px a lateral vira GAVETA (Etapa 7): um botão fixo no canto de
 * cada página (12px/12px) abre a lateral inteira, expandida, por cima do
 * conteúdo. É um diálogo do Radix: foco preso enquanto aberta, Esc e clique no
 * fundo fecham, e o foco volta ao botão. Fecha também ao navegar.
 *
 * Abrir e fechar não mexe na preferência recolhida/expandida — ela é da
 * lateral fixa, e a gaveta é sempre a lateral inteira.
 */
export function GavetaDaLateral() {
  const t = useT();
  const [aberta, setAberta] = useState(false);
  const pathname = usePathname();
  useEffect(() => setAberta(false), [pathname]);

  return (
    <Dialog.Root open={aberta} onOpenChange={setAberta}>
      <Dialog.Trigger asChild>
        <button type="button" className="sh-abrir-gaveta" aria-label={t("Abrir navegação")} data-testid="abrir-gaveta">
          <Menu size={18} aria-hidden />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content
          className="sh-gaveta fixed inset-y-0 left-0 z-50 flex h-full flex-col outline-none"
          aria-describedby={undefined}
          data-testid="gaveta-da-lateral"
        >
          <Dialog.Title className="sr-only">{t("Navegação principal")}</Dialog.Title>
          <div className="sh-side" data-pronta="true">
            <SidebarContent collapsed={false} showCollapseControl={false} onNavigate={() => setAberta(false)} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
