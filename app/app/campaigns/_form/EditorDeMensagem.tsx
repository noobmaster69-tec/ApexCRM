"use client";
/**
 * O EDITOR DA MENSAGEM (passo 3): o texto é o mesmo `message_body` de sempre
 * (texto puro com `{variaveis}`), mas na tela cada variável vira um chip
 * atômico — o Backspace apaga o token inteiro, e ninguém quebra um `{nome}` no
 * meio. A barra traz negrito/itálico/riscado no formato do WhatsApp
 * (`*`, `_`, `~`), emoji e o contador de caracteres.
 *
 * O DOM é a fonte enquanto se digita: a cada `input` ele é lido de volta para
 * texto. Só quando o valor muda POR FORA (outro componente, carga inicial) o
 * DOM é redesenhado.
 */
import { Bold, Italic, Smile, Strikethrough, WandSparkles } from "lucide-react";
import { useEffect, useImperativeHandle, useRef, type RefObject } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface ApiDoEditor {
  inserir: (texto: string, comoToken?: boolean) => void;
}

const TOKEN = /\{\{[^{}\n]+\}\}|\{[^{}\n]+\}/g;
const INVISIVEL = /​/g;

const EMOJIS = ["😊", "😉", "😃", "🙂", "👍", "👏", "🙏", "👋", "✅", "✨", "🔥", "🎉", "📅", "⏰", "📍", "📞", "💬", "📩", "💡", "⭐", "❤️", "🤝", "🚀", "🎁"];

function desenhar(raiz: HTMLElement, valor: string) {
  raiz.replaceChildren();
  let desde = 0;
  for (const m of valor.matchAll(TOKEN)) {
    const i = m.index ?? 0;
    if (i > desde) raiz.append(document.createTextNode(valor.slice(desde, i)));
    raiz.append(chip(m[0]));
    desde = i + m[0].length;
  }
  if (desde < valor.length) raiz.append(document.createTextNode(valor.slice(desde)));
  if (valor.endsWith("\n")) raiz.append(document.createTextNode("​"));
}

function chip(token: string): HTMLSpanElement {
  const s = document.createElement("span");
  s.className = "cw-token";
  s.contentEditable = "false";
  s.dataset.var = token;
  s.textContent = token;
  return s;
}

/** O DOM do editor de volta para texto. */
export function lerTexto(no: Node): string {
  let saida = "";
  no.childNodes.forEach((filho, i) => {
    if (filho.nodeType === Node.TEXT_NODE) saida += (filho.nodeValue ?? "").replace(INVISIVEL, "");
    else if (filho instanceof HTMLElement) {
      if (filho.dataset.var) saida += filho.dataset.var;
      else if (filho.tagName === "BR") saida += "\n";
      else if (filho.tagName === "DIV" || filho.tagName === "P") saida += (i > 0 ? "\n" : "") + lerTexto(filho);
      else saida += lerTexto(filho);
    }
  });
  return saida;
}

export function EditorDeMensagem({
  id,
  valor,
  onChange,
  apiRef,
  rotulo,
  placeholder,
  invalido,
  textos,
}: {
  id: string;
  valor: string;
  onChange: (v: string) => void;
  apiRef?: RefObject<ApiDoEditor | null>;
  rotulo: string;
  placeholder: string;
  invalido?: boolean;
  textos: {
    negrito: string;
    italico: string;
    riscado: string;
    emoji: string;
    melhorar: string;
    emBreve: string;
    caracteres: string;
  };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const ultimo = useRef<string | null>(null);
  const selecao = useRef<Range | null>(null);

  // Redesenha só quando o valor veio de fora.
  useEffect(() => {
    if (!ref.current || valor === ultimo.current) return;
    desenhar(ref.current, valor);
    ultimo.current = valor;
  }, [valor]);

  // Guarda onde estava o cursor: clicar num chip de variável tira o foco do editor.
  useEffect(() => {
    const guardar = () => {
      const s = document.getSelection();
      if (s && s.rangeCount > 0 && ref.current?.contains(s.getRangeAt(0).commonAncestorContainer)) {
        selecao.current = s.getRangeAt(0).cloneRange();
      }
    };
    document.addEventListener("selectionchange", guardar);
    return () => document.removeEventListener("selectionchange", guardar);
  }, []);

  const emitir = () => {
    if (!ref.current) return;
    const texto = lerTexto(ref.current);
    ultimo.current = texto;
    onChange(texto);
  };

  /** O intervalo onde inserir: o cursor guardado, ou o fim do texto. */
  const alcance = (): Range | null => {
    const raiz = ref.current;
    if (!raiz) return null;
    if (selecao.current && raiz.contains(selecao.current.commonAncestorContainer)) return selecao.current;
    const r = document.createRange();
    r.selectNodeContents(raiz);
    r.collapse(false);
    return r;
  };

  const colocarCursor = (depois: Node) => {
    const r = document.createRange();
    r.setStartAfter(depois);
    r.collapse(true);
    const s = document.getSelection();
    s?.removeAllRanges();
    s?.addRange(r);
    selecao.current = r.cloneRange();
  };

  const inserir = (texto: string, comoToken = false) => {
    const raiz = ref.current;
    const r = alcance();
    if (!raiz || !r) return;
    r.deleteContents();
    if (comoToken) {
      const c = chip(texto);
      const depois = document.createTextNode("​");
      r.insertNode(depois);
      r.insertNode(c);
      colocarCursor(c);
    } else {
      const no = document.createTextNode(texto);
      r.insertNode(no);
      if (texto.endsWith("\n") && !no.nextSibling) no.after(document.createTextNode("​"));
      colocarCursor(no);
    }
    raiz.focus();
    emitir();
  };

  useImperativeHandle(apiRef, () => ({ inserir }));

  const envolver = (marca: string) => {
    const raiz = ref.current;
    const r = alcance();
    if (!raiz || !r) return;
    const fim = r.cloneRange();
    fim.collapse(false);
    const fecha = document.createTextNode(marca);
    fim.insertNode(fecha);
    const inicio = r.cloneRange();
    inicio.collapse(true);
    inicio.insertNode(document.createTextNode(marca));
    colocarCursor(fecha);
    raiz.focus();
    emitir();
  };

  return (
    <div className="cw-editor" data-invalido={invalido || undefined}>
      <div
        ref={ref}
        id={id}
        className="cw-editor-area"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={rotulo}
        aria-invalid={invalido || undefined}
        data-placeholder={placeholder}
        onInput={emitir}
        onBlur={() => {
          // O `{variavel}` digitado à mão vira chip quando o foco sai.
          if (ref.current && TOKEN.test(valor)) desenhar(ref.current, valor);
          TOKEN.lastIndex = 0;
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            inserir("\n");
          }
        }}
        onPaste={(e) => {
          e.preventDefault();
          const texto = e.clipboardData.getData("text/plain");
          if (texto) inserir(texto.replace(/\r\n?/g, "\n"));
        }}
        onDrop={(e) => e.preventDefault()}
      />
      <div className="cw-ferramentas">
        <button type="button" className="cw-ferramenta" title={textos.negrito} aria-label={textos.negrito} onMouseDown={(e) => e.preventDefault()} onClick={() => envolver("*")}>
          <Bold size={15} aria-hidden />
        </button>
        <button type="button" className="cw-ferramenta" title={textos.italico} aria-label={textos.italico} onMouseDown={(e) => e.preventDefault()} onClick={() => envolver("_")}>
          <Italic size={15} aria-hidden />
        </button>
        <button type="button" className="cw-ferramenta" title={textos.riscado} aria-label={textos.riscado} onMouseDown={(e) => e.preventDefault()} onClick={() => envolver("~")}>
          <Strikethrough size={15} aria-hidden />
        </button>
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className="cw-ferramenta" title={textos.emoji} aria-label={textos.emoji} onMouseDown={(e) => e.preventDefault()}>
              <Smile size={15} aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent className="cw-portal w-auto border-0 bg-transparent p-0 shadow-none" align="start">
            <div className="cw-emojis">
              {EMOJIS.map((e) => (
                <button key={e} type="button" onMouseDown={(x) => x.preventDefault()} onClick={() => inserir(e)}>
                  {e}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <span className="cw-ferramentas-divisor" aria-hidden />
        <button type="button" className="cw-ia" disabled title={textos.emBreve}>
          <WandSparkles size={14} aria-hidden />
          {textos.melhorar}
        </button>
        <span className="cw-contador">{`${valor.length} ${textos.caracteres}`}</span>
      </div>
    </div>
  );
}
