// Sessão do convite: a liberação da inscrição é registrada no servidor
// (Supabase), não apenas no navegador. O servidor recebe os trechos
// efetivamente reproduzidos, acumula a cobertura e só aceita a inscrição
// quando ela atinge o mínimo exigido.
import { supabase } from "@/integrations/supabase/client";

const CHAVE = "confra2026:convite";

export type EstadoConvite = {
  sessao: string;
  concluido: boolean;
  blocos: number[];
  duracao: number;
};

type RespostaConvite = {
  sessao?: string;
  concluido?: boolean;
  segundos?: number;
  duracao?: number;
};

type ErroSupabase = { code?: string; message?: string } | null;

// As funções da liberação por vídeo vivem na migração
// 20260913120000_liberacao_por_video.sql e ainda não constam no arquivo de
// tipos gerado pelo Supabase — daí a chamada tipada à mão.
type ChamadaRpc = (
  nome: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: ErroSupabase }>;

const chamarRpc = (nome: string, args: Record<string, unknown>) =>
  (supabase.rpc as unknown as ChamadaRpc)(nome, args);

/** A migração da liberação por vídeo ainda não foi aplicada neste banco. */
function funcaoAusente(error: ErroSupabase): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST202" ||
    error.code === "404" ||
    /could not find the function|does not exist|schema cache/i.test(error.message ?? "")
  );
}

export function lerEstadoSalvo(): EstadoConvite | null {
  try {
    const bruto = sessionStorage.getItem(CHAVE);
    if (!bruto) return null;
    const dados = JSON.parse(bruto) as EstadoConvite;
    if (typeof dados?.sessao !== "string") return null;
    return {
      sessao: dados.sessao,
      concluido: Boolean(dados.concluido),
      blocos: Array.isArray(dados.blocos) ? dados.blocos : [],
      duracao: Number(dados.duracao) || 0,
    };
  } catch {
    return null;
  }
}

export function salvarEstado(estado: EstadoConvite): void {
  try {
    sessionStorage.setItem(CHAVE, JSON.stringify(estado));
  } catch {
    // Navegador sem armazenamento (navegação privada): a liberação continua
    // valendo enquanto a página estiver aberta.
  }
}

export function limparEstado(): void {
  try {
    sessionStorage.removeItem(CHAVE);
  } catch {
    /* ignora */
  }
}

/** Abre a sessão do convite no servidor. Devolve null se o servidor ainda não a suporta. */
export async function iniciarSessao(duracao: number): Promise<EstadoConvite | null> {
  const { data, error } = await chamarRpc("convite_iniciar", {
    p_duracao: Math.max(0, Math.floor(duracao)),
  });
  if (error) {
    if (funcaoAusente(error)) return null;
    throw error;
  }
  const resposta = (data ?? {}) as RespostaConvite;
  if (!resposta.sessao) return null;
  return {
    sessao: resposta.sessao,
    concluido: Boolean(resposta.concluido),
    blocos: [],
    duracao: Number(resposta.duracao) || duracao,
  };
}

/** Envia ao servidor os segundos do vídeo que foram realmente reproduzidos. */
export async function enviarProgresso(
  sessao: string,
  trechos: number[],
  duracao: number,
): Promise<{ concluido: boolean; segundos: number } | null> {
  const { data, error } = await chamarRpc("convite_progresso", {
    p_sessao: sessao,
    p_trechos: trechos,
    p_duracao: Math.max(0, Math.floor(duracao)),
  });
  if (error) {
    if (funcaoAusente(error)) return null;
    throw error;
  }
  const resposta = (data ?? {}) as RespostaConvite;
  return { concluido: Boolean(resposta.concluido), segundos: Number(resposta.segundos) || 0 };
}

export type DadosInscricao = {
  id: string;
  nome_completo: string;
  telefone: string;
  email: string;
  grupo: string;
};

/**
 * Grava a inscrição. O caminho normal é a função do banco, que rejeita a
 * inscrição quando a sessão do convite não está concluída. Enquanto a
 * migração não estiver aplicada, o site continua usando a inserção direta.
 */
export async function registrarInscricao(
  sessao: string | null,
  dados: DadosInscricao,
): Promise<{ error: ErroSupabase }> {
  if (sessao) {
    const { error } = await chamarRpc("convite_inscrever", {
      p_sessao: sessao,
      p_id: dados.id,
      p_nome: dados.nome_completo,
      p_telefone: dados.telefone,
      p_email: dados.email,
      p_grupo: dados.grupo,
    });
    if (!error) return { error: null };
    if (!funcaoAusente(error)) return { error };
  }
  const { error } = await supabase.from("inscricoes").insert(dados);
  return { error };
}
