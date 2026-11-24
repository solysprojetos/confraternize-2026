import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Inscricao = {
  id: string;
  nome_completo: string;
  telefone: string;
  email: string;
  grupo: "sgroup" | "solys" | "grupo_support" | "parceiros" | "convidados";
  created_at: string;
  comparecera?: boolean | null;
  cargo?: string | null;
  setor?: string | null;
  convite_enviado?: boolean | null;
  lembrete_semana_enviado?: boolean | null;
  lembrete_vespera_enviado?: boolean | null;
  coordenador_id?: string | null;
  cadastro_reserva?: boolean | null;
};

export type Grupo = Inscricao["grupo"];

// As funções e tabelas do admin vivem nas migrações e ainda não constam no
// arquivo de tipos gerado pelo Supabase — daí o cliente sem tipagem.
export const db = supabase as unknown as SupabaseClient;

export const NOME_GRUPO: Record<Grupo, string> = {
  grupo_support: "Grupo Support",
  sgroup: "SGroup Nacional",
  solys: "Solys Gestão Administrativa",
  parceiros: "Parceiros",
  convidados: "Convidados",
};

export const GRUPOS = Object.keys(NOME_GRUPO) as Grupo[];

/** Rótulo de quem não tem setor (convidados, parceiros, setor removido). */
export const SEM_SETOR = "Sem setor";

/** Quem não respondeu "não" conta como presença confirmada. */
export const vaiComparecer = (i: Inscricao) => i.comparecera !== false;
export const ehReserva = (i: Inscricao) => i.cadastro_reserva === true;
/** Confirmados da lista principal (fora do cadastro reserva). */
export const naListaPrincipal = (i: Inscricao) => vaiComparecer(i) && !ehReserva(i);

/** Tira acentos e caixa para a busca achar "joao" em "João". */
export const normalizar = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** Link do WhatsApp para o telefone digitado no formulário (DDD + número). */
export function linkWhatsApp(telefone: string): string | null {
  const digitos = telefone.replace(/\D/g, "");
  if (digitos.length < 10) return null;
  return `https://wa.me/${digitos.startsWith("55") ? digitos : `55${digitos}`}`;
}

export function dataCurta(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---- Estilos compartilhados do painel ----
export const cartao =
  "rounded-xl border border-border bg-card shadow-[0_1px_2px_rgb(15_23_42/0.04)]";

export const botao =
  "inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50";

export const botaoPrimario =
  "inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50";

export const entrada =
  "h-9 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30";

export const seletor =
  "h-8 max-w-full cursor-pointer rounded-md border border-transparent bg-transparent px-1.5 text-sm text-foreground outline-none transition-colors hover:border-border hover:bg-card focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-60";

export const rotuloSecao =
  "text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";
