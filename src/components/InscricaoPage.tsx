import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { ConvitePlayer } from "@/components/ConvitePlayer";
import { evento, temVideoConvite } from "@/config/evento";
import {
  enviarProgresso,
  iniciarSessao,
  lerEstadoSalvo,
  registrarInscricao,
  salvarEstado,
  type EstadoConvite,
} from "@/lib/conviteSessao";
import sgroupLogo from "@/assets/logos/sgroup.png";
import solysLogo from "@/assets/logos/solys.png";
import supportLogo from "@/assets/logos/support.png";

const grupos = [
  {
    value: "grupo_support",
    label: "Grupo Support",
    sigla: "GS",
    logo: supportLogo,
    // Logo todo branco: fundo azul-marinho para aparecer
    bg: "bg-primary",
  },
  { value: "sgroup", label: "SGroup Nacional", sigla: "SG", logo: sgroupLogo, bg: "" },
  {
    value: "solys",
    label: "Solys Gestão Administrativa",
    sigla: "SO",
    logo: solysLogo,
    bg: "",
  },
  { value: "parceiros", label: "Parceiros", sigla: "PA", logo: null, bg: "" },
  { value: "convidados", label: "Convidados", sigla: "CO", logo: null, bg: "" },
];

const schema = z.object({
  nome_completo: z.string().trim().min(3, "Informe seu nome completo").max(120),
  telefone: z.string().trim().min(10, "Informe um telefone válido com DDD").max(20),
  email: z.string().trim().email("E-mail inválido").max(255),
  grupo: z.enum(["sgroup", "solys", "grupo_support", "parceiros", "convidados"], {
    message: "Selecione seu grupo",
  }),
});

// Grupos sem logo (Parceiros/Convidados) mostram apenas o nome; a sigla é a
// reserva caso a imagem não carregue
function GroupLogo({
  src,
  alt,
  sigla,
  bg,
}: {
  src: string | null;
  alt: string;
  sigla: string;
  bg: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!src) return null;
  if (failed) {
    return (
      <span className="flex h-10 w-20 shrink-0 items-center justify-center rounded-md bg-secondary text-sm font-semibold tracking-wide text-primary">
        {sigla}
      </span>
    );
  }
  return (
    <span
      className={`flex h-10 w-20 shrink-0 items-center justify-center overflow-hidden ${
        bg ? `rounded-md p-1.5 ${bg}` : ""
      }`}
    >
      <img
        src={src}
        alt={alt}
        className="max-h-full max-w-full object-contain"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </span>
  );
}

function Etapas({ etapa }: { etapa: 1 | 2 }) {
  const itens = [
    { numero: 1, titulo: "Assistir ao convite" },
    { numero: 2, titulo: "Confirmar presença" },
  ];
  return (
    <ol className="flex items-center justify-center gap-3 text-xs sm:gap-4 sm:text-sm">
      {itens.map((item, i) => {
        const concluida = etapa > item.numero;
        const atual = etapa === item.numero;
        return (
          <li key={item.numero} className="flex items-center gap-3 sm:gap-4">
            <span className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold ${
                  concluida
                    ? "border-gold bg-gold text-white"
                    : atual
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground"
                }`}
                aria-hidden="true"
              >
                {concluida ? "✓" : item.numero}
              </span>
              <span
                className={
                  atual || concluida ? "font-medium text-foreground" : "text-muted-foreground"
                }
              >
                {item.titulo}
              </span>
            </span>
            {i === 0 && <span className="h-px w-6 bg-border sm:w-10" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}

export function InscricaoPage() {
  const [form, setForm] = useState({
    nome_completo: "",
    telefone: "",
    email: "",
    grupo: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [qrUrl, setQrUrl] = useState("");
  const [inscricaoId, setInscricaoId] = useState("");
  const [emailStatus, setEmailStatus] = useState<"" | "enviando" | "ok" | "erro">("");

  // Etapa 1 (convite) / etapa 2 (formulário)
  const [etapa, setEtapa] = useState<1 | 2>(1);
  const [liberado, setLiberado] = useState(false);
  const [acabouDeLiberar, setAcabouDeLiberar] = useState(false);
  const convite = useRef<EstadoConvite | null>(null);
  const filaTrechos = useRef<number[]>([]);
  const duracaoRef = useRef(0);
  const enviandoRef = useRef(false);
  const temVideo = temVideoConvite();

  function guardar(estado: EstadoConvite) {
    convite.current = estado;
    salvarEstado(estado);
  }

  // Retoma a liberação já obtida nesta mesma sessão do navegador
  useEffect(() => {
    const salvo = lerEstadoSalvo();
    if (salvo) {
      convite.current = salvo;
      duracaoRef.current = salvo.duracao;
      if (salvo.concluido) {
        setLiberado(true);
        setEtapa(2);
      }
      return;
    }
    // Sem vídeo publicado ainda: abre a sessão mesmo assim — quem decide se
    // isso libera a inscrição é o servidor.
    if (!temVideo) {
      iniciarSessao(0)
        .then((estado) => {
          if (!estado) {
            setLiberado(true);
            return;
          }
          guardar(estado);
          if (estado.concluido) setLiberado(true);
        })
        .catch(() => setLiberado(true));
    }
  }, [temVideo]);

  const abrirSessao = useCallback(async (duracao: number) => {
    duracaoRef.current = duracao;
    if (convite.current) return;
    try {
      const estado = await iniciarSessao(duracao);
      // Servidor sem a liberação por vídeo: a trava continua valendo no
      // navegador e a inscrição segue pelo caminho antigo.
      if (estado) guardar(estado);
    } catch {
      /* o progresso é reenviado nas próximas chamadas */
    }
  }, []);

  const mandarProgresso = useCallback(async (trechos: number[], duracao: number) => {
    duracaoRef.current = duracao || duracaoRef.current;
    filaTrechos.current.push(...trechos);
    const sessao = convite.current?.sessao;
    if (!sessao || enviandoRef.current || filaTrechos.current.length === 0) return;
    enviandoRef.current = true;
    const lote = filaTrechos.current;
    filaTrechos.current = [];
    try {
      const resposta = await enviarProgresso(sessao, lote, duracaoRef.current);
      if (resposta?.concluido && convite.current) {
        guardar({ ...convite.current, concluido: true });
      }
    } catch {
      // Recoloca o lote na fila para a próxima tentativa
      filaTrechos.current = [...lote, ...filaTrechos.current];
    } finally {
      enviandoRef.current = false;
    }
  }, []);

  const concluirConvite = useCallback(
    async (duracao: number) => {
      duracaoRef.current = duracao || duracaoRef.current;
      setLiberado(true);
      setAcabouDeLiberar(true);
      const sessao = convite.current?.sessao;
      if (!sessao) return;
      // Fecha a contagem no servidor com os últimos trechos reproduzidos
      await mandarProgresso([], duracaoRef.current);
      if (convite.current)
        guardar({ ...convite.current, concluido: true, duracao: duracaoRef.current });
    },
    [mandarProgresso],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return; // proteção contra cliques repetidos
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        next[String(issue.path[0])] = issue.message;
      }
      setErrors(next);
      return;
    }
    if (!liberado) {
      setEtapa(1);
      return;
    }
    setErrors({});
    setLoading(true);
    // O id é gerado aqui para servir de código do convite (QR) sem precisar
    // ler o registro de volta do banco
    const id = crypto.randomUUID();
    const { error } = await registrarInscricao(convite.current?.sessao ?? null, {
      ...parsed.data,
      id,
    });
    setLoading(false);
    if (error) {
      // 42501: o servidor não reconheceu o convite como assistido
      if (error.code === "42501") {
        setLiberado(false);
        setEtapa(1);
        setErrors({
          form: "Precisamos confirmar que o convite foi assistido até o final. Reproduza o vídeo novamente.",
        });
        return;
      }
      setErrors({
        form:
          error.code === "23505"
            ? "Este e-mail já está inscrito."
            : "Não foi possível enviar. Tente novamente.",
      });
      return;
    }
    setInscricaoId(id);
    const qr = await QRCode.toDataURL(`CONFRA2026:${id}`, { width: 480, margin: 2 });
    setQrUrl(qr);
    setDone(true);
    // Dispara o e-mail de convite com o QR code em segundo plano
    setEmailStatus("enviando");
    supabase.functions
      .invoke("enviar-convite", { body: { id } })
      .then(({ data, error: fnError }) => {
        const ok = !fnError && (data as { ok?: boolean } | null)?.ok === true;
        setEmailStatus(ok ? "ok" : "erro");
      })
      .catch(() => setEmailStatus("erro"));
  }

  function textoConvite() {
    const grupoNome = grupos.find((g) => g.value === form.grupo)?.label ?? "";
    return [
      "CONFRATERNIZAÇÃO 2026 - Convite confirmado",
      "",
      `Nome: ${form.nome_completo}`,
      `Grupo: ${grupoNome}`,
      "",
      ...(evento.dataExtenso ? [`Data: ${evento.dataExtenso}`] : []),
      `Local: ${evento.endereco}`,
      `Início às ${evento.horario}`,
      "",
      `Código do convite: ${inscricaoId}`,
      "Apresente o QR code na entrada.",
    ].join("\n");
  }

  function enviarEmail() {
    const assunto = "Convite - Confraternização 2026";
    window.location.href = `mailto:${encodeURIComponent(form.email)}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(textoConvite())}`;
  }

  function enviarWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(textoConvite())}`, "_blank");
  }

  function baixarQr() {
    const a = document.createElement("a");
    a.href = qrUrl;
    a.download = `convite-confraternizacao-2026-${(form.nome_completo.split(" ")[0] ?? "convidado").toLowerCase()}.png`;
    a.click();
  }

  const field =
    "w-full rounded-lg border border-border bg-card px-4 py-3 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-ring/25";

  const detalhes = (
    <dl className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
      {evento.dataExtenso && (
        <div className="px-5 py-4">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Data
          </dt>
          <dd className="mt-1 font-display text-xl leading-snug text-foreground">
            {evento.dataExtenso}
          </dd>
        </div>
      )}
      <div className="px-5 py-4">
        <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Local
        </dt>
        <dd className="mt-1 text-[15px] leading-relaxed text-foreground">{evento.endereco}</dd>
      </div>
      <div className="px-5 py-4">
        <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Início
        </dt>
        <dd className="mt-1 text-[15px] text-foreground">{evento.horario}</dd>
      </div>
    </dl>
  );

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-5xl px-5 py-12 sm:px-6 sm:py-16">
        <header className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-gold">
            Convite oficial
          </p>
          <h1 className="mx-auto mt-4 max-w-2xl font-display text-[1.75rem] leading-tight tracking-tight text-foreground sm:text-4xl">
            Confraternização 2026
          </h1>
          <span className="mx-auto mt-5 block h-px w-16 bg-gold-soft" aria-hidden="true" />
        </header>

        {!done && (
          <div className="mt-8">
            <Etapas etapa={etapa} />
          </div>
        )}

        {done ? (
          <section className="mx-auto mt-10 max-w-xl rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
            <h2 className="font-display text-2xl text-foreground">Inscrição confirmada</h2>
            <p className="mt-2 text-[15px] text-muted-foreground">
              Obrigado, {form.nome_completo.split(" ")[0]}. Nos vemos na Confraternização 2026.
            </p>

            {qrUrl && (
              <div className="mt-6 flex flex-col items-center gap-2">
                <img
                  src={qrUrl}
                  alt="QR code do convite"
                  className="h-44 w-44 rounded-xl border border-border bg-white p-2"
                />
                <p className="text-xs text-muted-foreground">
                  Este é o seu convite. Salve e apresente o QR code na entrada.
                </p>
                {emailStatus === "enviando" && (
                  <p className="text-xs text-muted-foreground">Enviando o convite por e-mail...</p>
                )}
                {emailStatus === "ok" && (
                  <p className="text-xs font-medium text-foreground">
                    Convite enviado para {form.email}.
                  </p>
                )}
              </div>
            )}

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <button
                type="button"
                onClick={baixarQr}
                className="rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                Baixar QR code
              </button>
              <button
                type="button"
                onClick={enviarEmail}
                className="rounded-lg border border-border bg-background px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
              >
                Enviar por e-mail
              </button>
              <button
                type="button"
                onClick={enviarWhatsApp}
                className="rounded-lg border border-border bg-background px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
              >
                Enviar no WhatsApp
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setForm({
                  nome_completo: "",
                  telefone: "",
                  email: "",
                  grupo: "",
                });
                setQrUrl("");
                setInscricaoId("");
                setEmailStatus("");
                setDone(false);
                setEtapa(1);
              }}
              className="mt-6 text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
            >
              Inscrever outra pessoa
            </button>
          </section>
        ) : etapa === 1 ? (
          <section className="mt-10">
            <h2 className="mx-auto max-w-2xl text-center font-display text-xl leading-snug text-foreground sm:text-2xl">
              Um momento especial merece a sua presença.
            </h2>

            <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-12">
              <div className="order-2 lg:order-1">
                <p className="text-[15px] leading-relaxed text-muted-foreground">
                  Reserve alguns minutos para o nosso convite. Ele conta o que preparamos para
                  celebrar mais um ano de trabalho ao lado de quem faz parte da nossa história.
                </p>
                <div className="mt-6">{detalhes}</div>
              </div>

              <div className="order-1 lg:order-2">
                {temVideo ? (
                  <ConvitePlayer
                    onTrechosAssistidos={mandarProgresso}
                    onConcluir={concluirConvite}
                    onDuracao={abrirSessao}
                    concluido={liberado}
                  />
                ) : (
                  <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-gold-soft bg-card px-6 text-center">
                    <p className="font-display text-lg text-foreground">
                      O convite em vídeo será publicado em breve.
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Enquanto isso, você já pode confirmar a sua presença.
                    </p>
                  </div>
                )}

                {liberado && temVideo ? (
                  <p className="mt-5 rounded-lg border border-gold-soft bg-gold-soft/20 px-4 py-3 text-center text-[15px] font-medium text-foreground">
                    Convite assistido! Agora confirme sua presença.
                  </p>
                ) : (
                  <p className="mt-5 text-center text-[15px] text-muted-foreground">
                    {temVideo
                      ? "Assista ao nosso convite até o final para liberar sua inscrição."
                      : "Confirme sua presença agora; o convite em vídeo chega em breve."}
                  </p>
                )}

                <button
                  type="button"
                  disabled={!liberado}
                  onClick={() => {
                    setEtapa(2);
                    setAcabouDeLiberar(false);
                  }}
                  className="mt-5 w-full rounded-lg bg-primary px-5 py-3.5 text-base font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-secondary disabled:text-muted-foreground"
                >
                  {liberado ? "Continuar para inscrição" : "Assista ao vídeo para continuar"}
                </button>

                {errors["form"] && (
                  <p className="mt-3 text-center text-sm text-destructive">{errors["form"]}</p>
                )}
              </div>
            </div>
          </section>
        ) : (
          <section className="mx-auto mt-10 max-w-xl">
            <div className="text-center">
              <h2 className="font-display text-2xl text-foreground">
                Vamos confirmar sua presença?
              </h2>
              <p className="mt-2 text-[15px] text-muted-foreground">
                Preencha seus dados e selecione o grupo do qual você faz parte.
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              className="mt-7 space-y-6 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8"
            >
              <div>
                <label htmlFor="nome" className="mb-2 block text-sm font-medium text-foreground">
                  Nome completo
                </label>
                <input
                  id="nome"
                  className={field}
                  value={form.nome_completo}
                  maxLength={120}
                  autoComplete="name"
                  placeholder="Seu nome completo"
                  onChange={(e) => setForm({ ...form, nome_completo: e.target.value })}
                />
                {errors["nome_completo"] && (
                  <p className="mt-1 text-sm text-destructive">{errors["nome_completo"]}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="telefone"
                  className="mb-2 block text-sm font-medium text-foreground"
                >
                  Telefone
                </label>
                <input
                  id="telefone"
                  type="tel"
                  className={field}
                  value={form.telefone}
                  maxLength={20}
                  autoComplete="tel"
                  placeholder="(85) 99999-9999"
                  onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                />
                {errors["telefone"] && (
                  <p className="mt-1 text-sm text-destructive">{errors["telefone"]}</p>
                )}
              </div>

              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-medium text-foreground">
                  E-mail
                </label>
                <input
                  id="email"
                  type="email"
                  className={field}
                  value={form.email}
                  maxLength={255}
                  autoComplete="email"
                  placeholder="voce@empresa.com.br"
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
                {errors["email"] && (
                  <p className="mt-1 text-sm text-destructive">{errors["email"]}</p>
                )}
              </div>

              <fieldset>
                <legend className="mb-3 text-sm font-medium text-foreground">
                  Você faz parte de qual grupo?
                </legend>
                <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Grupo">
                  {grupos.map((g, indice) => {
                    const active = form.grupo === g.value;
                    const ultimoSozinho = indice === grupos.length - 1 && grupos.length % 2 === 1;
                    return (
                      <button
                        key={g.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setForm({ ...form, grupo: g.value })}
                        className={`relative flex min-h-[104px] flex-col items-center justify-center gap-2 rounded-xl border px-3 py-4 text-center transition-colors ${
                          ultimoSozinho ? "col-span-2" : ""
                        } ${
                          active
                            ? "border-primary bg-accent ring-2 ring-ring/30"
                            : "border-border bg-background hover:border-gold-soft hover:bg-accent/60"
                        }`}
                      >
                        {active && (
                          <span
                            className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-gold text-[11px] font-bold text-white"
                            aria-hidden="true"
                          >
                            ✓
                          </span>
                        )}
                        <GroupLogo src={g.logo} alt={g.label} sigla={g.sigla} bg={g.bg} />
                        <span className="text-[13px] font-medium leading-snug text-foreground">
                          {g.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {errors["grupo"] && (
                  <p className="mt-2 text-sm text-destructive">{errors["grupo"]}</p>
                )}
              </fieldset>

              {errors["form"] && <p className="text-sm text-destructive">{errors["form"]}</p>}

              <button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3.5 text-base font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading && (
                  <span
                    className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground"
                    aria-hidden="true"
                  />
                )}
                {loading ? "Enviando sua inscrição..." : "Confirmar minha inscrição"}
              </button>

              {temVideo && (
                <button
                  type="button"
                  onClick={() => setEtapa(1)}
                  className="mx-auto block text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
                >
                  Rever o convite
                </button>
              )}
            </form>
          </section>
        )}

        <p className="sr-only" aria-live="polite">
          {acabouDeLiberar ? "Convite assistido! Agora confirme sua presença." : ""}
        </p>
      </div>
    </main>
  );
}
