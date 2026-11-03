"use server";
import { cookies } from "next/headers";
import { cookieSecure } from "@/lib/supabase/cookie-secure";

/**
 * Guarda no cookie a escolha de lateral recolhida/expandida, para o servidor já
 * desenhar a casca no tamanho certo (sem piscar). A fonte da escolha é o
 * `localStorage` do navegador (`components/shell/estado-da-lateral.ts`); este
 * cookie é só o espelho que o servidor consegue ler. Sem `revalidatePath`: a
 * lateral já mudou na tela, e recarregar o layout só repintaria o mesmo.
 */
export async function gravarLateral(recolhida: boolean): Promise<void> {
  const store = await cookies();
  store.set("sidebar_collapsed", recolhida ? "1" : "0", {
    httpOnly: true,
    sameSite: "strict",
    secure: cookieSecure(),
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
