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
  /** O banco sabe registrar quem avisa que não poderá comparecer. */
  aceitaResposta: boolean;
};

type RespostaConvite = {
  sessao?: string;
  concluido?: boolean;
  segundos?: number;
  duracao?: number;
  aceita_resposta?: boolean;
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
      aceitaResposta: Boolean(dados.aceitaResposta),
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
    aceitaResposta: resposta.aceita_resposta === true,
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
  /** true = confirma presença; false = avisou que não poderá comparecer. */
  comparecera: boolean;
  /** Cargo de quem é do grupo; vazio para parceiros e convidados. */
  cargo: string;
};

/** O banco desta instalação ainda não conhece a resposta "não poderei ir". */
function campoAusente(error: ErroSupabase): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST204" ||
    error.code === "42703" ||
    /comparecera|cargo/i.test(error.message ?? "")
  );
}

/**
 * Grava a resposta ao convite. O caminho normal é a função do banco, que
 * rejeita quem não assistiu ao convite. Enquanto as migrações não estiverem
 * aplicadas, o site cai para a inserção direta — e, se nem a coluna da
 * resposta existir, só consegue registrar quem confirma presença.
 */
export async function registrarInscricao(
  sessao: string | null,
  dados: DadosInscricao,
): Promise<{ error: ErroSupabase }> {
  const { comparecera, cargo, ...basico } = dados;

  if (sessao) {
    const { error } = await chamarRpc("convite_inscrever", {
      p_sessao: sessao,
      p_id: dados.id,
      p_nome: dados.nome_completo,
      p_telefone: dados.telefone,
      p_email: dados.email,
      p_grupo: dados.grupo,
      p_comparecera: comparecera,
      p_cargo: cargo || null,
    });
    if (!error) return { error: null };
    if (!funcaoAusente(error)) return { error };

    // Banco sem a coluna do cargo: tenta a versão anterior da função
    const { error: erroSemCargo } = await chamarRpc("convite_inscrever", {
      p_sessao: sessao,
      p_id: dados.id,
      p_nome: dados.nome_completo,
      p_telefone: dados.telefone,
      p_email: dados.email,
      p_grupo: dados.grupo,
      p_comparecera: comparecera,
    });
    if (!erroSemCargo) return { error: null };
    if (!funcaoAusente(erroSemCargo)) return { error: erroSemCargo };

    // Banco com a versão anterior da função, que ainda não recebe a resposta
    if (comparecera) {
      const { error: erroAntigo } = await chamarRpc("convite_inscrever", {
        p_sessao: sessao,
        p_id: dados.id,
        p_nome: dados.nome_completo,
        p_telefone: dados.telefone,
        p_email: dados.email,
        p_grupo: dados.grupo,
      });
      if (!erroAntigo) return { error: null };
      if (!funcaoAusente(erroAntigo)) return { error: erroAntigo };
    }
  }

  // A coluna comparecera ainda não consta no arquivo de tipos gerado pelo
  // Supabase, por isso a inserção com ela passa por uma tabela sem tipagem.
  const tabelaSemTipo = supabase.from("inscricoes") as unknown as {
    insert: (linha: Record<string, unknown>) => Promise<{ error: ErroSupabase }>;
  };
  const { error } = await tabelaSemTipo.insert({
    ...basico,
    comparecera,
    ...(cargo ? { cargo } : {}),
  });
  if (!error) return { error: null };
  if (!campoAusente(error)) return { error };

  // Sem a coluna do cargo, tenta gravar ao menos o resto
  if (cargo) {
    const { error: erroSemCargo } = await tabelaSemTipo.insert({ ...basico, comparecera });
    if (!erroSemCargo) return { error: null };
    if (!campoAusente(erroSemCargo)) return { error: erroSemCargo };
  }

  // Sem a coluna da resposta no banco: uma confirmação ainda pode ser gravada,
  // mas uma recusa não tem onde ser registrada — melhor avisar do que fingir.
  if (!comparecera) {
    return {
      error: {
        code: "SEM_COLUNA_RESPOSTA",
        message: "Ainda não conseguimos registrar respostas negativas.",
      },
    };
  }
  return await supabase.from("inscricoes").insert(basico);
}
