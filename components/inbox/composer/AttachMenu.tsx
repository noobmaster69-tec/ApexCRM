"use client";
import { Paperclip as IconeDoClipe } from "@/components/inbox/icones";
import { BOTAO_DE_ICONE } from "@/components/inbox/estilo";
import { useRef } from "react";
import { useT } from "@/hooks/i18n/useT";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { FileText, ImageSquare, UserCircle } from "@/lib/ui/icons";

interface Props {
  disabled?: boolean;
  onPick: (file: File) => void;
  onPickContact?: () => void;
}

/** Menu do clipe 📎 do composer: Fotos e vídeos / Documento / Contato. */
export function AttachMenu({ disabled, onPick, onPickContact }: Props) {
  const t = useT();
  const mediaRef = useRef<HTMLInputElement | null>(null);
  const docRef = useRef<HTMLInputElement | null>(null);

  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onPick(file);
    e.target.value = ""; // permite re-selecionar o mesmo arquivo
  };

  return (
    <>
      {/* Provider LOCAL (1.99, #3296): o painel do inbox não tem TooltipProvider
          ancestral e o Radix lança sem ele. Os wrappers não criam nó no DOM: o
          botão do fork segue filho direto da linha de ações. */}
      <TooltipProvider delayDuration={200}>
        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <button type="button" className={BOTAO_DE_ICONE} aria-label={t("Anexar")} disabled={disabled}>
                  <IconeDoClipe size={16} aria-hidden />
                </button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>{t("Anexar")}</TooltipContent>
          </Tooltip>
          <PopoverContent align="start" side="top" className="w-52 p-1">
            <button
              type="button"
              className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted lg:min-h-0"
              onClick={() => mediaRef.current?.click()}
            >
              <ImageSquare size={18} weight="duotone" className="text-primary" aria-hidden />
              {t("Fotos e vídeos")}
            </button>
            <button
              type="button"
              className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted lg:min-h-0"
              onClick={() => docRef.current?.click()}
            >
              <FileText size={18} weight="duotone" className="text-primary" aria-hidden />
              {t("Documento")}
            </button>
            {onPickContact && (
              <button
                type="button"
                className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted lg:min-h-0"
                onClick={onPickContact}
              >
                <UserCircle size={18} weight="duotone" className="text-primary" aria-hidden />
                {t("Contato")}
              </button>
            )}
          </PopoverContent>
        </Popover>
      </TooltipProvider>
      {/* Os inputs vivem FORA do PopoverContent: o Radix desmonta o conteúdo do
          popover ao fechar, e um input desmontado no meio do clique perde o
          file picker ("nada acontece"). Aqui os refs seguem válidos após o
          fechamento — o .click() síncrono no onClick preserva o user-gesture. */}
      <input ref={mediaRef} type="file" accept="image/*,video/*" className="hidden" onChange={handle} />
      <input
        ref={docRef}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
        className="hidden"
        onChange={handle}
      />
    </>
  );
}
