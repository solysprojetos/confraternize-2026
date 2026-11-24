import { useMemo, useState } from "react";
import { Check, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import {
  botaoPrimario,
  cartao,
  db,
  ehReserva,
  entrada,
  GRUPOS,
  NOME_GRUPO,
  normalizar,
  SEM_SETOR,
  type Grupo,
  type Inscricao,
} from "@/components/admin/comum";
import type { AcoesInscricao } from "@/components/admin/ListaInscricoes";

export function SetoresAba({
  pessoas,
  setores,
  acoes,
  onErro,
  onSetoresAlterados,
}: {
  /** Lista principal e cadastro reserva juntos. */
  pessoas: Inscricao[];
  setores: string[];
  acoes: AcoesInscricao;
  onErro: (mensagem: string) => void;
  /** Recarrega setores e pessoas depois de criar, renomear ou remover. */
  onSetoresAlterados: () => Promise<void> | void;
}) {
  const [escolhido, setEscolhido] = useState<string>(setores[0] ?? SEM_SETOR);
  const [novo, setNovo] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [nomeEditado, setNomeEditado] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [busca, setBusca] = useState("");
  const [empresa, setEmpresa] = useState<"todas" | Grupo>("todas");

  const setorDe = (i: Inscricao) => (i.setor && setores.includes(i.setor) ? i.setor : SEM_SETOR);
  const colunas = [...setores, SEM_SETOR];
  const atual = colunas.includes(escolhido) ? escolhido : (colunas[0] ?? SEM_SETOR);

  const contagem = useMemo(() => {
    const conta = new Map<string, number>();
    for (const i of pessoas) conta.set(setorDe(i), (conta.get(setorDe(i)) ?? 0) + 1);
    return conta;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pessoas, setores]);

  const doSetor = useMemo(() => {
    const termo = normalizar(busca);
    return pessoas
      .filter((i) => setorDe(i) === atual)
      .filter((i) => empresa === "todas" || i.grupo === empresa)
      .filter((i) => !termo || normalizar(`${i.nome_completo} ${i.email}`).includes(termo))
      .sort((a, b) => a.nome_completo.localeCompare(b.nome_completo, "pt-BR"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pessoas, atual, busca, empresa, setores]);

  async function chamar(funcao: string, parametros: Record<string, unknown>, falha: string) {
    onErro("");
    setSalvando(true);
    const { error } = await db.rpc(funcao, parametros);
    if (error) {
      setSalvando(false);
      onErro(error.code === "23505" ? "Já existe um setor com esse nome." : falha);
      return false;
    }
    await onSetoresAlterados();
    setSalvando(false);
    return true;
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    const nome = novo.trim();
    if (nome.length < 2) return;
    if (await chamar("admin_criar_setor", { p_nome: nome }, "Não foi possível criar o setor.")) {
      setNovo("");
      setEscolhido(nome);
    }
  }

  async function renomear(de: string) {
    const para = nomeEditado.trim();
    if (para.length < 2 || para === de) {
      setEditando(null);
      return;
    }
    if (
      await chamar(
        "admin_renomear_setor",
        { p_de: de, p_para: para },
        "Não foi possível renomear o setor.",
      )
    ) {
      setEditando(null);
      if (atual === de) setEscolhido(para);
    }
  }

  async function remover(nome: string) {
    const quantos = contagem.get(nome) ?? 0;
    const aviso =
      quantos > 0
        ? `Remover o setor "${nome}"? ${quantos} ${quantos === 1 ? "pessoa fica" : "pessoas ficam"} sem setor.`
        : `Remover o setor "${nome}"?`;
    if (!window.confirm(aviso)) return;
    if (
      await chamar("admin_remover_setor", { p_nome: nome }, "Não foi possível remover o setor.")
    ) {
      if (atual === nome) setEscolhido(SEM_SETOR);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
      {/* Lista de setores */}
      <section className={`${cartao} self-start`}>
        <div className="border-b border-border px-4 py-3.5">
          <h2 className="text-sm font-semibold text-foreground">Setores</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Escolha um setor para ver e mover as pessoas.
          </p>
        </div>
        <ul className="p-2">
          {colunas.map((s) => {
            const ativo = atual === s;
            const fixo = s === SEM_SETOR;
            if (editando === s) {
              return (
                <li key={s} className="px-1 py-1">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void renomear(s);
                    }}
                    className="flex items-center gap-1.5"
                  >
                    <input
                      autoFocus
                      value={nomeEditado}
                      onChange={(e) => setNomeEditado(e.target.value)}
                      maxLength={80}
                      aria-label={`Novo nome de ${s}`}
                      className={entrada}
                    />
                    <button
                      type="submit"
                      disabled={salvando}
                      aria-label="Salvar nome"
                      title="Salvar"
                      className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
                    >
                      <Check className="size-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditando(null)}
                      aria-label="Cancelar"
                      title="Cancelar"
                      className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent"
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  </form>
                </li>
              );
            }
            return (
              <li key={s} className="group flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setEscolhido(s)}
                  aria-pressed={ativo}
                  className={`flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                    ativo ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                  }`}
                >
                  <span
                    className={`truncate ${
                      ativo ? "font-semibold" : fixo ? "text-muted-foreground" : "text-foreground"
                    }`}
                  >
                    {s}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ${
                      ativo ? "bg-white/15" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {contagem.get(s) ?? 0}
                  </span>
                </button>
                {!fixo && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setEditando(s);
                        setNomeEditado(s);
                      }}
                      aria-label={`Renomear ${s}`}
                      title="Renomear"
                      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <Pencil className="size-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void remover(s)}
                      disabled={salvando}
                      aria-label={`Remover ${s}`}
                      title="Remover"
                      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
        <form onSubmit={criar} className="flex gap-2 border-t border-border p-3">
          <input
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            placeholder="Novo setor"
            aria-label="Nome do novo setor"
            maxLength={80}
            className={entrada}
          />
          <button
            type="submit"
            disabled={novo.trim().length < 2 || salvando}
            className={`${botaoPrimario} shrink-0`}
          >
            <Plus className="size-4" aria-hidden="true" />
            Criar
          </button>
        </form>
      </section>

      {/* Pessoas do setor escolhido */}
      <section className={cartao}>
        <div className="flex flex-col gap-3 border-b border-border px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{atual}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {doSetor.length} {doSetor.length === 1 ? "pessoa" : "pessoas"} · use a caixa ao lado
              do nome para mudar de setor
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative sm:w-56">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar pessoa"
                aria-label="Buscar pessoa no setor"
                className={`${entrada} pl-9`}
              />
            </div>
            <select
              value={empresa}
              onChange={(e) => setEmpresa(e.target.value as "todas" | Grupo)}
              aria-label="Filtrar por empresa"
              className={`${entrada} sm:w-52`}
            >
              <option value="todas">Todas as empresas</option>
              {GRUPOS.map((g) => (
                <option key={g} value={g}>
                  {NOME_GRUPO[g]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {doSetor.length === 0 ? (
          <p className="px-4 py-14 text-center text-sm text-muted-foreground">
            Ninguém neste setor{busca || empresa !== "todas" ? " com esses filtros" : ""}.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {doSetor.map((i) => (
              <li
                key={i.id}
                className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {i.nome_completo}
                    {ehReserva(i) && (
                      <span className="ml-2 rounded-full bg-gold-soft/60 px-2 py-0.5 text-[11px] font-medium text-gold-texto">
                        reserva
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{NOME_GRUPO[i.grupo]}</p>
                </div>
                <select
                  value={atual}
                  disabled={acoes.ocupado === i.id}
                  onChange={(e) =>
                    acoes.mudarSetor(i, e.target.value === SEM_SETOR ? null : e.target.value)
                  }
                  aria-label={`Mudar o setor de ${i.nome_completo}`}
                  className={`${entrada} shrink-0 sm:w-48`}
                >
                  {colunas.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
