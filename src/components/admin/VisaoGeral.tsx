import { CalendarDays, ChevronRight, ClipboardList, Hourglass, Mail } from "lucide-react";
import {
  cartao,
  GRUPOS,
  NOME_GRUPO,
  SEM_SETOR,
  type Grupo,
  type Inscricao,
} from "@/components/admin/comum";

export function VisaoGeral({
  principal,
  reserva,
  setores,
  dias,
  onAbrirLista,
}: {
  principal: Inscricao[];
  reserva: Inscricao[];
  setores: string[];
  dias: number;
  onAbrirLista: (lista: "principal" | "reserva", empresa?: Grupo | null) => void;
}) {
  const enviados = principal.filter((i) => i.convite_enviado).length;
  const naFila = principal.length - enviados;

  const porEmpresa = GRUPOS.map((g) => ({
    grupo: g,
    lista: principal.filter((i) => i.grupo === g).length,
    reserva: reserva.filter((i) => i.grupo === g).length,
  }));
  const maiorEmpresa = Math.max(1, ...porEmpresa.map((e) => e.lista));

  const porSetor = [...setores, SEM_SETOR]
    .map((s) => ({
      setor: s,
      quantos: principal.filter((i) =>
        s === SEM_SETOR ? !i.setor || !setores.includes(i.setor) : i.setor === s,
      ).length,
    }))
    .filter((s) => s.quantos > 0);
  const maiorSetor = Math.max(1, ...porSetor.map((s) => s.quantos));

  const indicadores = [
    {
      rotulo: "Lista principal",
      valor: principal.length,
      detalhe: "presenças confirmadas",
      icone: ClipboardList,
      destaque: true,
      aoClicar: () => onAbrirLista("principal"),
    },
    {
      rotulo: "Cadastro reserva",
      valor: reserva.length,
      detalhe: "aguardando vaga",
      icone: Hourglass,
      destaque: false,
      aoClicar: () => onAbrirLista("reserva"),
    },
    {
      rotulo: "Convites por e-mail",
      valor: enviados,
      detalhe: naFila > 0 ? `${naFila} na fila de reenvio` : "todos enviados",
      icone: Mail,
      destaque: false,
      aoClicar: undefined,
    },
    {
      rotulo: "Dias para o evento",
      valor: dias,
      detalhe: "19 de dezembro · 16h30",
      icone: CalendarDays,
      destaque: false,
      aoClicar: undefined,
    },
  ];

  return (
    <div className="space-y-5">
      {/* Indicadores */}
      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {indicadores.map(({ rotulo, valor, detalhe, icone: Icone, destaque, aoClicar }) => {
          const conteudo = (
            <>
              <div className="flex items-center justify-between gap-2">
                <p
                  className={`text-xs font-medium sm:text-sm ${destaque ? "text-primary-foreground/70" : "text-muted-foreground"}`}
                >
                  {rotulo}
                </p>
                <Icone
                  className={`size-4 shrink-0 ${destaque ? "text-gold" : "text-muted-foreground/60"}`}
                  aria-hidden="true"
                />
              </div>
              <p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight sm:text-4xl">
                {valor}
              </p>
              <p
                className={`mt-1 text-xs ${destaque ? "text-primary-foreground/60" : "text-muted-foreground"}`}
              >
                {detalhe}
              </p>
            </>
          );
          const classe = `${
            destaque ? "rounded-xl bg-primary text-primary-foreground" : `${cartao} text-foreground`
          } p-4 text-left sm:p-5`;
          return aoClicar ? (
            <button
              key={rotulo}
              type="button"
              onClick={aoClicar}
              className={`${classe} transition-shadow hover:shadow-md`}
            >
              {conteudo}
            </button>
          ) : (
            <div key={rotulo} className={classe}>
              {conteudo}
            </div>
          );
        })}
      </section>

      <div className="grid gap-5 xl:grid-cols-5">
        {/* Por empresa */}
        <section className={`${cartao} xl:col-span-3`}>
          <div className="flex items-baseline justify-between gap-3 border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold text-foreground">Confirmados por empresa</h2>
            <p className="text-xs text-muted-foreground">Clique para abrir a lista</p>
          </div>
          <ul className="p-2">
            {porEmpresa.map(({ grupo, lista, reserva: emReserva }) => (
              <li key={grupo}>
                <button
                  type="button"
                  onClick={() => onAbrirLista("principal", grupo)}
                  className="group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 rounded-lg px-3 py-3 text-left transition-colors hover:bg-accent sm:grid-cols-[13rem_minmax(0,1fr)_auto]"
                >
                  <span className="truncate text-sm font-medium text-foreground">
                    {NOME_GRUPO[grupo]}
                  </span>
                  <span className="order-last col-span-2 h-2 overflow-hidden rounded-full bg-muted sm:order-none sm:col-span-1">
                    <span
                      className="block h-full rounded-full bg-navy-soft"
                      style={{ width: `${(lista / maiorEmpresa) * 100}%` }}
                    />
                  </span>
                  <span className="flex items-center gap-2 text-sm tabular-nums">
                    <span className="font-semibold text-foreground">{lista}</span>
                    {emReserva > 0 && (
                      <span className="rounded-full bg-gold-soft/60 px-2 py-0.5 text-[11px] font-medium text-gold-texto">
                        +{emReserva} reserva
                      </span>
                    )}
                    <ChevronRight
                      className="size-4 text-muted-foreground/50 group-hover:text-foreground"
                      aria-hidden="true"
                    />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <div className="space-y-5 xl:col-span-2">
          {/* Por setor */}
          <section className={cartao}>
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-sm font-semibold text-foreground">Lista principal por setor</h2>
            </div>
            <ul className="space-y-3 p-5">
              {porSetor.map(({ setor, quantos }) => (
                <li key={setor}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span
                      className={setor === SEM_SETOR ? "text-muted-foreground" : "text-foreground"}
                    >
                      {setor}
                    </span>
                    <span className="font-semibold tabular-nums text-foreground">{quantos}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${setor === SEM_SETOR ? "bg-muted-foreground/40" : "bg-gold-deep"}`}
                      style={{ width: `${(quantos / maiorSetor) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* Lembretes */}
          <section className={cartao}>
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-sm font-semibold text-foreground">Lembretes automáticos</h2>
            </div>
            <ul className="divide-y divide-border px-5">
              {(
                [
                  [
                    "12/12",
                    "Uma semana antes",
                    principal.filter((i) => i.lembrete_semana_enviado).length,
                  ],
                  ["18/12", "Véspera", principal.filter((i) => i.lembrete_vespera_enviado).length],
                ] as const
              ).map(([dia, texto, quantos]) => (
                <li key={dia} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <span className="flex items-center gap-3">
                    <span className="rounded-md bg-muted px-2 py-1 text-xs font-semibold tabular-nums text-foreground">
                      {dia}
                    </span>
                    <span className="text-foreground">{texto}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {quantos > 0 ? `${quantos} enviados` : "Agendado"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="px-5 pb-4 pt-1 text-xs text-muted-foreground">
              Por e-mail, só para a lista principal.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
