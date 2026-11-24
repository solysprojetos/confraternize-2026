import { useEffect, useMemo, useRef, useState } from "react";
import { PartyPopper, RotateCcw, Trash2 } from "lucide-react";
import {
  cartao,
  entrada,
  GRUPOS,
  NOME_GRUPO,
  SEM_SETOR,
  type Grupo,
  type Inscricao,
} from "@/components/admin/comum";

type Publico = "principal" | "reserva" | "todos";

/** Índice aleatório sem viés perceptível, com o gerador seguro do navegador. */
function indiceAleatorio(tamanho: number): number {
  const aleatorio = new Uint32Array(1);
  crypto.getRandomValues(aleatorio);
  return (aleatorio[0] ?? 0) % tamanho;
}

export function Sorteio({
  principal,
  reserva,
  setores,
}: {
  principal: Inscricao[];
  reserva: Inscricao[];
  setores: string[];
}) {
  const [publico, setPublico] = useState<Publico>("principal");
  const [empresa, setEmpresa] = useState<"todas" | Grupo>("todas");
  const [setor, setSetor] = useState("todos");
  const [semRepetir, setSemRepetir] = useState(true);
  const [ganhadores, setGanhadores] = useState<Inscricao[]>([]);
  const [sorteado, setSorteado] = useState<Inscricao | null>(null);
  /** Nome que passa na tela enquanto o sorteio "gira". */
  const [girando, setGirando] = useState<string | null>(null);
  const temporizador = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (temporizador.current !== null) window.clearInterval(temporizador.current);
    },
    [],
  );

  const setorDe = (i: Inscricao) => (i.setor && setores.includes(i.setor) ? i.setor : SEM_SETOR);

  const participantes = useMemo(() => {
    const base =
      publico === "principal"
        ? principal
        : publico === "reserva"
          ? reserva
          : [...principal, ...reserva];
    const jaSorteados = new Set(ganhadores.map((g) => g.id));
    return base.filter((i) => {
      if (empresa !== "todas" && i.grupo !== empresa) return false;
      if (setor !== "todos" && setorDe(i) !== setor) return false;
      if (semRepetir && jaSorteados.has(i.id)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [principal, reserva, publico, empresa, setor, semRepetir, ganhadores, setores]);

  function sortear() {
    if (participantes.length === 0 || girando !== null) return;
    const escolhido = participantes[indiceAleatorio(participantes.length)];
    if (!escolhido) return;
    const concluir = () => {
      setGirando(null);
      setSorteado(escolhido);
      setGanhadores((atual) => [escolhido, ...atual]);
    };
    const semAnimacao =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (semAnimacao || participantes.length === 1) {
      concluir();
      return;
    }
    // Os nomes passam rápido por uns 2 segundos antes de revelar o sorteado
    setSorteado(null);
    let voltas = 0;
    temporizador.current = window.setInterval(() => {
      voltas += 1;
      setGirando(participantes[indiceAleatorio(participantes.length)]?.nome_completo ?? "");
      if (voltas >= 26) {
        if (temporizador.current !== null) window.clearInterval(temporizador.current);
        temporizador.current = null;
        concluir();
      }
    }, 80);
  }

  const detalhe = (i: Inscricao) =>
    [NOME_GRUPO[i.grupo], i.setor && setores.includes(i.setor) ? i.setor : null]
      .filter(Boolean)
      .join(" · ");

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-5">
        {/* Quem participa */}
        <section className={`${cartao} p-4`}>
          <p className="text-sm font-semibold text-foreground">Quem participa</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <select
              value={publico}
              onChange={(e) => setPublico(e.target.value as Publico)}
              aria-label="Lista que participa"
              className={entrada}
            >
              <option value="principal">Lista principal</option>
              <option value="reserva">Cadastro reserva</option>
              <option value="todos">Lista principal + reserva</option>
            </select>
            <select
              value={empresa}
              onChange={(e) => setEmpresa(e.target.value as "todas" | Grupo)}
              aria-label="Empresa que participa"
              className={entrada}
            >
              <option value="todas">Todas as empresas</option>
              {GRUPOS.map((g) => (
                <option key={g} value={g}>
                  {NOME_GRUPO[g]}
                </option>
              ))}
            </select>
            <select
              value={setor}
              onChange={(e) => setSetor(e.target.value)}
              aria-label="Setor que participa"
              className={entrada}
            >
              <option value="todos">Todos os setores</option>
              {[...setores, SEM_SETOR].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={semRepetir}
              onChange={(e) => setSemRepetir(e.target.checked)}
              className="size-4 accent-[var(--gold-deep)]"
            />
            Não repetir quem já foi sorteado
          </label>
        </section>

        {/* Palco do sorteio */}
        <section className="rounded-xl bg-navy-deep px-5 py-10 text-center text-primary-foreground sm:py-14">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-gold">
            {girando !== null ? "Sorteando..." : sorteado ? "Sorteado" : "Pronto para sortear"}
          </p>
          <div
            className="mt-5 flex min-h-[8.5rem] flex-col items-center justify-center"
            aria-live="polite"
          >
            {girando !== null ? (
              <p className="font-display text-[clamp(2rem,6vw,3.75rem)] leading-tight text-primary-foreground/50">
                {girando}
              </p>
            ) : sorteado ? (
              <>
                <p className="font-display text-[clamp(2.25rem,7vw,4.5rem)] leading-[1.05] text-gold">
                  {sorteado.nome_completo}
                </p>
                <p className="mt-3 text-sm text-primary-foreground/70">{detalhe(sorteado)}</p>
              </>
            ) : (
              <p className="max-w-sm text-sm text-primary-foreground/60">
                Escolha quem participa e clique em sortear. O nome aparece aqui, grande, para
                mostrar no telão.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={sortear}
            disabled={participantes.length === 0 || girando !== null}
            className="mt-6 inline-flex h-12 items-center justify-center gap-2.5 rounded-lg bg-gold px-8 text-base font-semibold text-navy-deep transition-transform hover:-translate-y-px active:translate-y-0 disabled:opacity-50"
          >
            <PartyPopper className="size-5" aria-hidden="true" />
            {sorteado ? "Sortear de novo" : "Sortear"}
          </button>
          <p className="mt-4 text-xs text-primary-foreground/50">
            {participantes.length === 0
              ? "Ninguém participa com esses filtros."
              : `${participantes.length} ${participantes.length === 1 ? "pessoa participa" : "pessoas participam"}`}
          </p>
        </section>
      </div>

      {/* Ganhadores desta sessão */}
      <section className={`${cartao} self-start`}>
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Sorteados</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Some ao sair ou recarregar a página.
            </p>
          </div>
          {ganhadores.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (!window.confirm("Limpar a lista de sorteados?")) return;
                setGanhadores([]);
                setSorteado(null);
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
              Limpar
            </button>
          )}
        </div>
        {ganhadores.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            Nenhum sorteio ainda.
          </p>
        ) : (
          <ol className="divide-y divide-border">
            {ganhadores.map((g, n) => (
              <li key={`${g.id}-${n}`} className="flex items-center gap-3 px-4 py-2.5">
                <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-gold text-xs font-semibold tabular-nums text-navy-deep">
                  {ganhadores.length - n}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{g.nome_completo}</p>
                  <p className="truncate text-xs text-muted-foreground">{detalhe(g)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setGanhadores((atual) => atual.filter((_, i) => i !== n))}
                  aria-label={`Tirar ${g.nome_completo} dos sorteados`}
                  title="Tirar da lista (volta a participar)"
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
