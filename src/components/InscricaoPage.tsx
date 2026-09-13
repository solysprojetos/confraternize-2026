import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { ConvitePlayer, ConviteEmPreparacao } from "@/components/ConvitePlayer";
import { evento, temVideoConvite } from "@/config/evento";
import { digitosDoTelefone, formatarTelefone } from "@/lib/telefone";
import {
  enviarProgresso,
  iniciarSessao,
  lerEstadoSalvo,
  registrarInscricao,
  salvarEstado,
  type EstadoConvite,
} from "@/lib/conviteSessao";
import sgroupPng from "@/assets/logos/sgroup.png";
import sgroupWebp from "@/assets/logos/sgroup.webp";
import solysPng from "@/assets/logos/solys.png";
import solysWebp from "@/assets/logos/solys.webp";
import supportPng from "@/assets/logos/support.png";
import supportWebp from "@/assets/logos/support.webp";

type Grupo = {
  value: string;
  label: string;
  sigla: string;
  png: string | null;
  webp: string | null;
  /** A logo do Grupo Support é branca: precisa de fundo escuro para aparecer. */
  fundoEscuro: boolean;
};

const grupos: Grupo[] = [
  {
    value: "grupo_support",
    label: "Grupo Support",
    sigla: "GS",
    png: supportPng,
    webp: supportWebp,
    fundoEscuro: true,
  },
  {
    value: "sgroup",
    label: "SGroup Nacional",
    sigla: "SG",
    png: sgroupPng,
    webp: sgroupWebp,
    fundoEscuro: false,
  },
  {
    value: "solys",
    label: "Solys Gestão Administrativa",
    sigla: "SO",
    png: solysPng,
    webp: solysWebp,
    fundoEscuro: false,
  },
  {
    value: "parceiros",
    label: "Parceiros",
    sigla: "PA",
    png: null,
    webp: null,
    fundoEscuro: false,
  },
  {
    value: "convidados",
    label: "Convidados",
    sigla: "CO",
    png: null,
    webp: null,
    fundoEscuro: false,
  },
];

const schema = z.object({
  nome_completo: z.string().trim().min(3, "Informe seu nome completo").max(120),
  telefone: z
    .string()
    .trim()
    .refine((v) => digitosDoTelefone(v).length >= 10, "Informe um telefone com DDD")
    .refine((v) => digitosDoTelefone(v).length <= 11, "Telefone muito longo"),
  email: z.string().trim().email("Informe um e-mail válido").max(255),
  grupo: z.enum(["sgroup", "solys", "grupo_support", "parceiros", "convidados"], {
    message: "Selecione o seu grupo",
  }),
});

const IconeCalendario = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-full w-full">
    <path
      d="M7 3v3m10-3v3M3.5 9.5h17M5 5.5h14a1.5 1.5 0 011.5 1.5v12A1.5 1.5 0 0119 20.5H5A1.5 1.5 0 013.5 19V7A1.5 1.5 0 015 5.5z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
  </svg>
);

const IconeRelogio = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-full w-full">
    <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
    <path
      d="M12 7.5V12l3 1.8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
  </svg>
);

const IconeLocal = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-full w-full">
    <path
      d="M12 21s6.5-5.6 6.5-10.2A6.5 6.5 0 0012 4.3a6.5 6.5 0 00-6.5 6.5C5.5 15.4 12 21 12 21z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    />
    <circle cx="12" cy="10.6" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);

/** Logo oficial: WebP para quem suporta, PNG como reserva. */
function Logo({
  webp,
  png,
  alt,
  sigla,
  className,
}: {
  webp: string | null;
  png: string | null;
  alt: string;
  sigla: string;
  className: string;
}) {
  const [falhou, setFalhou] = useState(false);
  if (!png) return null;
  if (falhou) {
    return (
      <span className="text-sm font-semibold tracking-wide text-primary" aria-hidden="true">
        {sigla}
      </span>
    );
  }
  return (
    <picture>
      {webp && <source srcSet={webp} type="image/webp" />}
      <img
        src={png}
        alt={alt}
        className={className}
        loading="lazy"
        decoding="async"
        onError={() => setFalhou(true)}
      />
    </picture>
  );
}

function Etapas({ etapa }: { etapa: 1 | 2 }) {
  const itens = [
    { numero: 1 as const, titulo: "Assistir ao convite" },
    { numero: 2 as const, titulo: "Confirmar presença" },
  ];
  return (
    <ol className="flex items-center gap-3 text-xs sm:text-[13px]">
      {itens.map((item, i) => {
        const concluida = etapa > item.numero;
        const atual = etapa === item.numero;
        return (
          <li key={item.numero} className="flex items-center gap-3">
            <span className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${
                  concluida
                    ? "bg-gold text-navy-deep"
                    : atual
                      ? "bg-white text-navy"
                      : "border border-white/30 text-white/60"
                }`}
                aria-hidden="true"
              >
                {concluida ? "✓" : item.numero}
              </span>
              <span className={atual || concluida ? "text-white" : "text-white/55"}>
                {item.titulo}
              </span>
            </span>
            {i === 0 && <span className="h-px w-6 bg-white/25 sm:w-10" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}

function FaixaLogos() {
  return (
    <section className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-5 py-8 sm:px-8">
        <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
          Uma realização
        </p>
        <ul className="flex flex-wrap items-center justify-center gap-3 sm:gap-5">
          {grupos
            .filter((g) => g.png)
            .map((g) => (
              <li
                key={g.value}
                className={`flex h-[4.5rem] w-40 items-center justify-center rounded-xl px-4 sm:h-24 sm:w-52 ${
                  g.fundoEscuro ? "bg-navy" : "bg-background ring-1 ring-border"
                }`}
              >
                <Logo
                  webp={g.webp}
                  png={g.png}
                  alt={g.label}
                  sigla={g.sigla}
                  className="max-h-12 w-auto max-w-full object-contain sm:max-h-16"
                />
              </li>
            ))}
        </ul>
      </div>
    </section>
  );
}

function InformacoesEvento({ compacto = false }: { compacto?: boolean }) {
  if (compacto) {
    return (
      <p className="text-sm text-white/75">
        {evento.dataExtenso} · Início às {evento.horario} · {evento.bairro}
      </p>
    );
  }
  const itens = [
    { Icone: IconeCalendario, rotulo: "Data", valor: evento.dataExtenso, destaque: true },
    { Icone: IconeRelogio, rotulo: "Início", valor: `${evento.horario}` },
    { Icone: IconeLocal, rotulo: "Local", valor: evento.endereco },
  ];
  return (
    <dl className="mt-8 space-y-4 border-t border-white/12 pt-6">
      {itens.map(({ Icone, rotulo, valor, destaque }) => (
        <div key={rotulo} className="flex gap-4">
          <span className="mt-0.5 h-5 w-5 shrink-0 text-gold" aria-hidden="true">
            <Icone />
          </span>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/50">
              {rotulo}
            </dt>
            <dd
              className={
                destaque
                  ? "mt-1 font-display text-lg leading-snug text-white sm:text-xl"
                  : "mt-1 max-w-xs text-pretty text-[15px] leading-relaxed text-white/85"
              }
            >
              {valor}
            </dd>
          </div>
        </div>
      ))}
    </dl>
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

  const [etapa, setEtapa] = useState<1 | 2>(1);
  const [liberado, setLiberado] = useState(false);
  const convite = useRef<EstadoConvite | null>(null);
  const filaTrechos = useRef<number[]>([]);
  const duracaoRef = useRef(0);
  const enviandoRef = useRef(false);
  const tituloFormulario = useRef<HTMLHeadingElement>(null);
  const temVideo = temVideoConvite();

  function guardar(estado: EstadoConvite) {
    convite.current = estado;
    salvarEstado(estado);
  }

  // Retoma a liberação já obtida nesta mesma sessão do navegador
  useEffect(() => {
    const salvo = lerEstadoSalvo();
    if (!salvo) return;
    convite.current = salvo;
    duracaoRef.current = salvo.duracao;
    if (salvo.concluido) setLiberado(true);
  }, []);

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
      filaTrechos.current = [...lote, ...filaTrechos.current];
    } finally {
      enviandoRef.current = false;
    }
  }, []);

  const concluirConvite = useCallback(
    async (duracao: number) => {
      duracaoRef.current = duracao || duracaoRef.current;
      setLiberado(true);
      if (!convite.current?.sessao) return;
      await mandarProgresso([], duracaoRef.current);
      if (convite.current) {
        guardar({ ...convite.current, concluido: true, duracao: duracaoRef.current });
      }
    },
    [mandarProgresso],
  );

  function irParaFormulario() {
    setEtapa(2);
    window.requestAnimationFrame(() => {
      tituloFormulario.current?.focus();
      tituloFormulario.current?.scrollIntoView({ block: "center" });
    });
  }

  function validarCampo(campo: keyof typeof form) {
    const parsed = schema.safeParse(form);
    const problema = parsed.success
      ? undefined
      : parsed.error.issues.find((i) => i.path[0] === campo);
    setErrors((atuais) => {
      const proximos = { ...atuais };
      if (problema) proximos[campo] = problema.message;
      else delete proximos[campo];
      return proximos;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return; // proteção contra cliques repetidos
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] = issue.message;
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
            : "Não foi possível confirmar sua presença agora. Tente novamente.",
      });
      return;
    }
    setInscricaoId(id);
    // A biblioteca do QR code só é baixada quando a presença é confirmada
    const { default: QRCode } = await import("qrcode");
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

  const nomeDoGrupo = grupos.find((g) => g.value === form.grupo)?.label ?? "";

  function textoConvite() {
    return [
      "CONFRATERNIZAÇÃO 2026 - Presença confirmada",
      "",
      `Nome: ${form.nome_completo}`,
      `Grupo: ${nomeDoGrupo}`,
      "",
      `Data: ${evento.dataExtenso}`,
      `Início às ${evento.horario}`,
      `Local: ${evento.endereco}`,
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

  const campo =
    "w-full rounded-lg border bg-card px-4 py-3 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-ring/20";
  const campoErro = "border-destructive/70";
  const campoOk = "border-border";

  const mostrarConvite = !done && etapa === 1;

  return (
    <main className="min-h-screen bg-background">
      {/* Abertura em azul-marinho */}
      <section className="sobre-escuro relative overflow-hidden bg-navy text-white">
        <span
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(85% 65% at 78% 8%, color-mix(in oklab, var(--navy-soft) 92%, transparent) 0%, transparent 58%)",
          }}
          aria-hidden="true"
        />
        <span
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-gold/45 to-transparent"
          aria-hidden="true"
        />

        <div
          className={`relative mx-auto w-full max-w-6xl px-5 sm:px-8 ${
            mostrarConvite ? "py-12 sm:py-16" : "py-10 sm:py-12"
          }`}
        >
          {!done && <Etapas etapa={etapa} />}

          {mostrarConvite ? (
            <div className="mt-10 grid items-center gap-10 lg:mt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-gold">
                  Convite oficial
                </p>
                <h1 className="mt-4 font-display text-[2.15rem] leading-[1.08] tracking-tight text-white sm:text-5xl">
                  {evento.nome}
                </h1>
                <p className="mt-5 font-display text-xl leading-snug text-white/90 sm:text-[1.6rem]">
                  {evento.chamada}
                </p>
                <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-white/70">
                  Chegamos ao fim de mais um ano de trabalho lado a lado. Preparamos um encontro
                  para celebrar o caminho que percorremos juntos e agradecer a cada pessoa que faz
                  parte dele. Sua presença é o que dá sentido a esta noite.
                </p>
                <InformacoesEvento />
              </div>

              <div className="lg:pl-2">
                {temVideo ? (
                  <ConvitePlayer
                    onTrechosAssistidos={mandarProgresso}
                    onConcluir={concluirConvite}
                    onDuracao={abrirSessao}
                    concluido={liberado}
                  />
                ) : (
                  <ConviteEmPreparacao />
                )}

                <p
                  className={`mt-6 text-center text-[15px] ${
                    liberado ? "text-gold" : "text-white/70"
                  }`}
                  aria-live="polite"
                >
                  {!temVideo
                    ? "O convite em vídeo será publicado em breve."
                    : liberado
                      ? "Convite assistido. Agora confirme a sua presença."
                      : "Assista ao convite para liberar sua inscrição."}
                </p>

                <button
                  type="button"
                  disabled={!liberado}
                  onClick={irParaFormulario}
                  className={`mt-4 w-full rounded-full px-6 py-3.5 text-base font-semibold transition-all duration-300 ${
                    liberado
                      ? "surgir bg-gold text-navy-deep shadow-[0_14px_30px_-16px_rgba(201,162,39,0.9)] hover:brightness-105"
                      : "cursor-not-allowed bg-white/10 text-white/45"
                  }`}
                >
                  Confirmar minha presença
                </button>

                {errors["form"] && (
                  <p className="mt-3 text-center text-sm text-gold" role="alert">
                    {errors["form"]}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-8">
              <h1 className="font-display text-2xl leading-tight text-white sm:text-3xl">
                {evento.nome}
              </h1>
              <div className="mt-2">
                <InformacoesEvento compacto />
              </div>
            </div>
          )}
        </div>
      </section>

      {mostrarConvite && <FaixaLogos />}

      {/* Formulário */}
      {!done && etapa === 2 && (
        <section className="surgir mx-auto w-full max-w-2xl px-5 py-12 sm:px-8 sm:py-16">
          <h2
            ref={tituloFormulario}
            tabIndex={-1}
            className="font-display text-[1.75rem] leading-tight text-foreground sm:text-4xl"
          >
            Vamos confirmar sua presença?
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
            Preencha seus dados e selecione o grupo do qual você faz parte.
          </p>

          <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="nome" className="mb-2 block text-sm font-medium text-foreground">
                  Nome completo
                </label>
                <input
                  id="nome"
                  className={`${campo} ${errors["nome_completo"] ? campoErro : campoOk}`}
                  value={form.nome_completo}
                  maxLength={120}
                  autoComplete="name"
                  placeholder="Como você quer ser chamado no convite"
                  aria-invalid={Boolean(errors["nome_completo"])}
                  aria-describedby={errors["nome_completo"] ? "erro-nome" : undefined}
                  onChange={(e) => setForm({ ...form, nome_completo: e.target.value })}
                  onBlur={() => validarCampo("nome_completo")}
                />
                {errors["nome_completo"] && (
                  <p id="erro-nome" className="mt-1.5 text-sm text-destructive">
                    {errors["nome_completo"]}
                  </p>
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
                  inputMode="tel"
                  className={`${campo} ${errors["telefone"] ? campoErro : campoOk}`}
                  value={form.telefone}
                  maxLength={16}
                  autoComplete="tel"
                  placeholder="(85) 99999-8888"
                  aria-invalid={Boolean(errors["telefone"])}
                  aria-describedby={errors["telefone"] ? "erro-telefone" : undefined}
                  onChange={(e) => setForm({ ...form, telefone: formatarTelefone(e.target.value) })}
                  onBlur={() => validarCampo("telefone")}
                />
                {errors["telefone"] && (
                  <p id="erro-telefone" className="mt-1.5 text-sm text-destructive">
                    {errors["telefone"]}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-medium text-foreground">
                  E-mail
                </label>
                <input
                  id="email"
                  type="email"
                  className={`${campo} ${errors["email"] ? campoErro : campoOk}`}
                  value={form.email}
                  maxLength={255}
                  autoComplete="email"
                  placeholder="voce@empresa.com.br"
                  aria-invalid={Boolean(errors["email"])}
                  aria-describedby={errors["email"] ? "erro-email" : undefined}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  onBlur={() => validarCampo("email")}
                />
                {errors["email"] && (
                  <p id="erro-email" className="mt-1.5 text-sm text-destructive">
                    {errors["email"]}
                  </p>
                )}
              </div>
            </div>

            <fieldset>
              <legend className="mb-3 text-sm font-medium text-foreground">
                Você faz parte de qual grupo?
              </legend>
              <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Grupo">
                {grupos.map((g, indice) => {
                  const ativo = form.grupo === g.value;
                  const ultimoSozinho = indice === grupos.length - 1 && grupos.length % 2 === 1;
                  return (
                    <button
                      key={g.value}
                      type="button"
                      role="radio"
                      aria-checked={ativo}
                      onClick={() => {
                        setForm({ ...form, grupo: g.value });
                        setErrors((atuais) => {
                          const proximos = { ...atuais };
                          delete proximos["grupo"];
                          return proximos;
                        });
                      }}
                      className={`relative flex min-h-[72px] items-center gap-4 rounded-xl border px-4 py-3 text-left transition-colors ${
                        ultimoSozinho ? "sm:col-span-2" : ""
                      } ${
                        ativo
                          ? "border-primary bg-accent shadow-[inset_0_0_0_1px_var(--primary)]"
                          : "border-border bg-card hover:border-gold-soft hover:bg-accent/50"
                      }`}
                    >
                      {g.png ? (
                        <span
                          className={`flex h-12 w-20 shrink-0 items-center justify-center rounded-lg px-2 ${
                            g.fundoEscuro ? "bg-navy" : "bg-background ring-1 ring-border/70"
                          }`}
                        >
                          <Logo
                            webp={g.webp}
                            png={g.png}
                            alt={g.label}
                            sigla={g.sigla}
                            className="max-h-9 w-auto max-w-full object-contain"
                          />
                        </span>
                      ) : (
                        <span
                          className="flex h-12 w-20 shrink-0 items-center justify-center rounded-lg bg-secondary font-display text-lg text-primary"
                          aria-hidden="true"
                        >
                          {g.sigla}
                        </span>
                      )}
                      <span className="text-[15px] font-medium leading-snug text-foreground">
                        {g.label}
                      </span>
                      <span
                        className={`ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold ${
                          ativo
                            ? "border-gold-deep bg-gold-deep text-white"
                            : "border-border bg-transparent text-transparent"
                        }`}
                        aria-hidden="true"
                      >
                        ✓
                      </span>
                    </button>
                  );
                })}
              </div>
              {errors["grupo"] && (
                <p className="mt-2 text-sm text-destructive">{errors["grupo"]}</p>
              )}
            </fieldset>

            {errors["form"] && (
              <p
                className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
                role="alert"
              >
                {errors["form"]}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3.5 text-base font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading && (
                <span
                  className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground"
                  aria-hidden="true"
                />
              )}
              {loading ? "Confirmando presença..." : "Confirmar minha presença"}
            </button>

            <button
              type="button"
              onClick={() => setEtapa(1)}
              className="mx-auto block text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Voltar ao convite
            </button>
          </form>
        </section>
      )}

      {/* Confirmação */}
      {done && (
        <section className="surgir mx-auto w-full max-w-2xl px-5 py-12 sm:px-8 sm:py-16">
          <div className="text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gold/15 text-gold-deep">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-7 w-7">
                <path
                  d="M5 12.5l4.5 4.5L19 7.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <h2 className="mt-5 font-display text-[1.75rem] leading-tight text-foreground sm:text-4xl">
              Presença confirmada!
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
              Obrigado, {form.nome_completo.split(" ")[0]}. Guardamos o seu lugar na {evento.nome}.
            </p>
          </div>

          <div className="mt-8 overflow-hidden rounded-2xl border border-border bg-card">
            <dl className="divide-y divide-border">
              {[
                { rotulo: "Nome", valor: form.nome_completo },
                { rotulo: "Grupo", valor: nomeDoGrupo },
                { rotulo: "Data", valor: evento.dataExtenso },
                { rotulo: "Início", valor: evento.horario },
                { rotulo: "Local", valor: evento.endereco },
              ].map((linha) => (
                <div key={linha.rotulo} className="flex flex-wrap gap-x-6 gap-y-1 px-5 py-3.5">
                  <dt className="w-20 shrink-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {linha.rotulo}
                  </dt>
                  <dd className="flex-1 text-[15px] leading-relaxed text-foreground">
                    {linha.valor}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {qrUrl && (
            <div className="mt-8 flex flex-col items-center gap-3">
              <img
                src={qrUrl}
                alt="QR code do convite"
                className="h-40 w-40 rounded-xl border border-border bg-white p-2"
              />
              <p className="text-center text-xs text-muted-foreground">
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

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={baixarQr}
              className="rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Baixar QR code
            </button>
            <button
              type="button"
              onClick={enviarEmail}
              className="rounded-full border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
            >
              Enviar por e-mail
            </button>
            <button
              type="button"
              onClick={enviarWhatsApp}
              className="rounded-full border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
            >
              Enviar no WhatsApp
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setForm({ nome_completo: "", telefone: "", email: "", grupo: "" });
              setQrUrl("");
              setInscricaoId("");
              setEmailStatus("");
              setDone(false);
              setEtapa(1);
            }}
            className="mx-auto mt-8 block text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Inscrever outra pessoa
          </button>
        </section>
      )}

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-5 py-8 text-center text-xs text-muted-foreground sm:px-8">
          {evento.nome} · {evento.dataExtenso} · Início às {evento.horario}
        </div>
      </footer>
    </main>
  );
}
