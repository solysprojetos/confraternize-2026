import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { ConvitePlayer, ConviteEmPreparacao } from "@/components/ConvitePlayer";
import { Button } from "@/components/ui/button";
import { evento, temVideoConvite } from "@/config/evento";
import { useRevelar } from "@/hooks/useRevelar";
import { digitosDoTelefone, formatarTelefone } from "@/lib/telefone";
import {
  enviarProgresso,
  iniciarSessao,
  limparEstado,
  lerEstadoSalvo,
  registrarInscricao,
  salvarEstado,
  type EstadoConvite,
} from "@/lib/conviteSessao";
import sgroupPng from "@/assets/logos/sgroup.png";
import sgroupWebp from "@/assets/logos/sgroup.webp";
import solysPng from "@/assets/logos/solys.png";
import solysWebp from "@/assets/logos/solys.webp";
import supportPng from "@/assets/logos/support-escuro.png";
import supportWebp from "@/assets/logos/support-escuro.webp";

/** Rola até o elemento e leva o foco junto, respeitando movimento reduzido. */
function irAte(elemento: HTMLElement | null | undefined) {
  if (!elemento) return;
  const semMovimento =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  elemento.scrollIntoView({ behavior: semMovimento ? "auto" : "smooth", block: "start" });
  elemento.focus({ preventScroll: true });
}

/** As empresas continuam gravadas na coluna "grupo" do banco. */
const empresas = [
  { value: "grupo_support", label: "Grupo Support" },
  { value: "sgroup", label: "SGroup Nacional" },
  { value: "solys", label: "Solys Gestão Administrativa" },
  { value: "parceiros", label: "Parceiros" },
  { value: "convidados", label: "Convidados" },
];

/**
 * As três logos que assinam o convite. A arte do Grupo Support veio em
 * branco, então usamos a versão em marinho: assim as três ficam no mesmo
 * padrão, sobre o mesmo fundo claro e sem caixa atrás de nenhuma.
 */
const logos = [
  { label: "Grupo Support", png: supportPng, webp: supportWebp },
  { label: "SGroup Nacional", png: sgroupPng, webp: sgroupWebp },
  { label: "Solys Gestão Administrativa", png: solysPng, webp: solysWebp },
];

const schema = z.object({
  nome_completo: z.string().trim().min(3, "Informe seu nome completo").max(120),
  grupo: z.enum(["sgroup", "solys", "grupo_support", "parceiros", "convidados"], {
    message: "Selecione a sua empresa",
  }),
  telefone: z
    .string()
    .trim()
    .refine((v) => digitosDoTelefone(v).length >= 10, "Informe um telefone com DDD")
    .refine((v) => digitosDoTelefone(v).length <= 11, "Telefone muito longo"),
  email: z.string().trim().email("Informe um e-mail válido").max(255),
});

function Logo({
  webp,
  png,
  alt,
  className,
}: {
  webp: string;
  png: string;
  alt: string;
  className: string;
}) {
  return (
    <picture>
      <source srcSet={webp} type="image/webp" />
      <img src={png} alt={alt} className={className} loading="lazy" decoding="async" />
    </picture>
  );
}

function ContagemRegressiva() {
  const calcular = useCallback(() => {
    const restante = Math.max(0, new Date(evento.inicioIso).getTime() - Date.now());
    const minutos = Math.floor(restante / 60000);
    return {
      dias: Math.floor(minutos / 1440),
      horas: Math.floor((minutos % 1440) / 60),
      minutos: minutos % 60,
    };
  }, []);
  const [tempoRestante, setTempoRestante] = useState(calcular);

  useEffect(() => {
    const id = window.setInterval(() => setTempoRestante(calcular()), 30000);
    return () => window.clearInterval(id);
  }, [calcular]);

  return (
    <div className="grid grid-cols-3 divide-x divide-gold/25 border-y border-gold/25 py-4 text-center sm:py-5">
      {[
        [tempoRestante.dias, "dias"],
        [tempoRestante.horas, "horas"],
        [tempoRestante.minutos, "minutos"],
      ].map(([valor, unidade]) => (
        <div key={unidade} className="px-3">
          <strong className="block font-display text-2xl font-normal tabular-nums text-primary-foreground sm:text-3xl">
            {String(valor).padStart(2, "0")}
          </strong>
          <span className="mt-1 block text-[9px] font-medium uppercase tracking-[0.2em] text-primary-foreground/55">
            {unidade}
          </span>
        </div>
      ))}
    </div>
  );
}

export function InscricaoPage() {
  const [form, setForm] = useState({
    nome_completo: "",
    grupo: "",
    telefone: "",
    email: "",
  });
  const [resposta, setResposta] = useState<"sim" | "nao">("sim");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [confirmou, setConfirmou] = useState(true);
  const [qrUrl, setQrUrl] = useState("");
  const [inscricaoId, setInscricaoId] = useState("");
  const [emailStatus, setEmailStatus] = useState<"" | "enviando" | "ok" | "erro">("");

  const [liberado, setLiberado] = useState(false);
  // Só perguntamos "sim ou não" quando o banco sabe registrar a recusa
  const [aceitaResposta, setAceitaResposta] = useState(false);
  const [abriuFormulario, setAbriuFormulario] = useState(false);
  // Muda a cada convite novo: força o player a recomeçar do zero
  const [tentativa, setTentativa] = useState(0);
  const convite = useRef<EstadoConvite | null>(null);
  const filaTrechos = useRef<number[]>([]);
  const duracaoRef = useRef(0);
  const enviandoRef = useRef(false);
  const secaoConfirmacao = useRef<HTMLDivElement>(null);
  const destinoConfirmacao = useRef<HTMLDivElement>(null);
  const secaoConvite = useRef<HTMLElement>(null);
  const temVideo = temVideoConvite();

  useRevelar(`${abriuFormulario}-${done}-${liberado}`);

  function guardar(estado: EstadoConvite) {
    convite.current = estado;
    setAceitaResposta(estado.aceitaResposta);
    salvarEstado(estado);
  }

  // Leva o foco para a seção certa quando a página troca de momento. Precisa
  // ser um efeito: no clique, o destino ainda não foi montado pelo React.
  const momentoAnterior = useRef({ done: false, abriu: false });
  useEffect(() => {
    const antes = momentoAnterior.current;
    if (done && !antes.done) irAte(destinoConfirmacao.current);
    else if (!done && antes.done) irAte(secaoConvite.current);
    else if (!abriuFormulario && antes.abriu) irAte(secaoConvite.current);
    momentoAnterior.current = { done, abriu: abriuFormulario };
  }, [done, abriuFormulario]);

  // Retoma a liberação já obtida nesta mesma sessão do navegador
  useEffect(() => {
    const salvo = lerEstadoSalvo();
    if (!salvo) return;
    convite.current = salvo;
    duracaoRef.current = salvo.duracao;
    setAceitaResposta(salvo.aceitaResposta);
    if (salvo.concluido) setLiberado(true);
  }, []);

  const abrirSessao = useCallback(async (duracao: number) => {
    duracaoRef.current = duracao;
    if (convite.current) return;
    try {
      const estado = await iniciarSessao(duracao);
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
      const retorno = await enviarProgresso(sessao, lote, duracaoRef.current);
      if (retorno?.concluido && convite.current) {
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

  /** Recomeça o convite do zero: sessão nova no servidor e player remontado. */
  function reiniciarConvite() {
    limparEstado();
    convite.current = null;
    filaTrechos.current = [];
    duracaoRef.current = 0;
    setLiberado(false);
    setAceitaResposta(false);
    setAbriuFormulario(false);
    setTentativa((n) => n + 1);
  }

  function abrirConfirmacao() {
    setAbriuFormulario(true);
    window.requestAnimationFrame(() => {
      secaoConfirmacao.current?.scrollIntoView({
        behavior:
          typeof window.matchMedia === "function" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
        block: "start",
      });
      secaoConfirmacao.current?.querySelector<HTMLInputElement>("#nome")?.focus({
        preventScroll: true,
      });
    });
  }

  function validarCampo(campo: keyof typeof form) {
    const analise = schema.safeParse(form);
    const problema = analise.success
      ? undefined
      : analise.error.issues.find((i) => i.path[0] === campo);
    setErrors((atuais) => {
      const proximos = { ...atuais };
      if (problema) proximos[campo] = problema.message;
      else delete proximos[campo];
      return proximos;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return; // protege contra cliques repetidos
    const analise = schema.safeParse(form);
    if (!analise.success) {
      const proximos: Record<string, string> = {};
      for (const issue of analise.error.issues) proximos[String(issue.path[0])] = issue.message;
      setErrors(proximos);
      // Leva o foco ao primeiro campo com problema
      const ordem = ["nome_completo", "telefone", "email", "grupo"] as const;
      const primeiro = ordem.find((campo) => proximos[campo]);
      const seletor =
        primeiro === "grupo"
          ? 'input[name="empresa"]'
          : primeiro === "nome_completo"
            ? "#nome"
            : `#${primeiro}`;
      window.requestAnimationFrame(() =>
        document.querySelector<HTMLElement>(seletor)?.focus({ preventScroll: false }),
      );
      return;
    }
    if (!liberado) {
      setAbriuFormulario(false);
      return;
    }
    setErrors({});
    setLoading(true);
    const comparecera = !aceitaResposta || resposta === "sim";
    // O id é gerado aqui para virar o código do convite (QR) sem precisar ler
    // o registro de volta do banco
    const id = crypto.randomUUID();
    const { error } = await registrarInscricao(convite.current?.sessao ?? null, {
      ...analise.data,
      id,
      comparecera,
    });
    setLoading(false);
    if (error) {
      if (error.code === "42501") {
        const jaUsada = /já registrou/i.test(error.message ?? "");
        reiniciarConvite();
        setErrors({
          form: jaUsada
            ? "Este convite já registrou uma resposta. Para responder por outra pessoa, assista ao convite novamente."
            : "Precisamos confirmar que o convite foi assistido até o fim. Reproduza o vídeo novamente.",
        });
        return;
      }
      setErrors({
        form:
          error.code === "23505"
            ? "Este e-mail já respondeu ao convite."
            : error.code === "SEM_COLUNA_RESPOSTA"
              ? "Não conseguimos registrar sua resposta agora. Avise a organização por outro caminho."
              : "Não foi possível registrar sua resposta agora. Tente novamente.",
      });
      return;
    }
    setInscricaoId(id);
    setConfirmou(comparecera);
    // A sessão do convite é de uso único: depois de aceita, não serve de novo
    limparEstado();
    if (comparecera) {
      // A biblioteca do QR code só é baixada quando há presença confirmada
      const { default: QRCode } = await import("qrcode");
      setQrUrl(await QRCode.toDataURL(`CONFRA2026:${id}`, { width: 480, margin: 2 }));
      setEmailStatus("enviando");
      supabase.functions
        .invoke("enviar-convite", { body: { id } })
        .then(({ data, error: erroFn }) => {
          const ok = !erroFn && (data as { ok?: boolean } | null)?.ok === true;
          setEmailStatus(ok ? "ok" : "erro");
        })
        .catch(() => setEmailStatus("erro"));
    }
    setDone(true);
  }

  const nomeDaEmpresa = empresas.find((e) => e.value === form.grupo)?.label ?? "";

  function textoConvite() {
    return [
      "CONFRATERNIZAÇÃO 2026 — Presença confirmada",
      "",
      `Nome: ${form.nome_completo}`,
      `Empresa: ${nomeDaEmpresa}`,
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
    const assunto = "Convite — Confraternização 2026";
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

  const rotulo = "block text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground";
  const campo =
    "mt-2.5 w-full border-0 border-b bg-transparent px-0 py-2.5 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground/75 focus:border-gold-deep";
  const campoOk = "border-b-border";
  const campoErro = "border-b-destructive/70";

  return (
    <main
      className={`relative min-h-screen overflow-x-clip bg-background ${liberado && !done ? "pb-24 sm:pb-0" : ""}`}
    >
      {/* ================= O CONVITE ================= */}
      <section
        ref={secaoConvite}
        tabIndex={-1}
        className="relative bg-transparent text-foreground outline-none"
      >
        <div className="relative mx-auto w-full max-w-[1240px] px-6 sm:px-10 lg:px-14">
          {/* Papel timbrado: quem assina o convite abre a página */}
          <header className="border-b border-border py-5 text-center sm:py-6">
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              Uma realização
            </p>
            <ul className="mx-auto mt-4 grid max-w-[35rem] grid-cols-3 items-center gap-4 sm:mt-5 sm:gap-10">
              {logos.map((logo) => (
                <li key={logo.label} className="flex min-w-0 items-center justify-center">
                  <Logo
                    webp={logo.webp}
                    png={logo.png}
                    alt={logo.label}
                    className="h-12 w-full max-w-[5.25rem] object-contain sm:h-16 sm:max-w-[7rem]"
                  />
                </li>
              ))}
            </ul>
          </header>

          {/* Abertura */}
          <div className="mx-auto max-w-4xl pb-10 pt-9 text-center sm:pb-12 sm:pt-14">
            <p className="revelar text-[10px] font-medium uppercase tracking-[0.42em] text-gold-texto">
              Convite oficial
            </p>
            <h1
              className="revelar mt-5 font-display text-[clamp(2rem,7vw,4.25rem)] font-normal uppercase leading-[1.02] tracking-[0.015em]"
              style={{ "--atraso": "60ms" } as React.CSSProperties}
            >
              Confraternização <span className="italic text-gold-texto">2026</span>
            </h1>

            <p
              className="revelar mx-auto mt-6 max-w-2xl font-display text-[clamp(1.15rem,3vw,1.55rem)] leading-snug text-muted-foreground"
              style={{ "--atraso": "120ms" } as React.CSSProperties}
            >
              Um encontro para celebrar nossas conquistas e quem faz parte dessa história.
            </p>
            {/* Só a informação: sem caixa, sem riscos e sem ícones */}
            <p
              className="revelar mx-auto mt-8 text-[12px] uppercase leading-[1.9] tracking-[0.14em] text-muted-foreground sm:text-[13px] sm:tracking-[0.16em]"
              style={{ "--atraso": "180ms" } as React.CSSProperties}
            >
              <span className="block whitespace-nowrap">19 de dezembro de 2026</span>{" "}
              <span className="mt-1 block">
                <span className="whitespace-nowrap">{evento.horario}</span>
                <span className="mx-3" aria-hidden="true">
                  ·
                </span>
                <span className="whitespace-nowrap">{evento.bairro}</span>
              </span>
            </p>
          </div>

          {/* Painel do convite em vídeo: cartão claro, borda fina, cantos
              suaves e sombra discreta. O vídeo é o destaque da abertura. */}
          <div
            className="revelar mx-auto w-full max-w-[68rem]"
            style={{ "--atraso": "60ms" } as React.CSSProperties}
          >
            <div className="border border-border bg-card px-4 py-7 shadow-[0_22px_60px_-42px_color-mix(in_oklab,var(--navy-deep)_55%,transparent)] sm:px-8 sm:py-10 lg:px-12">
              <p className="text-center text-[10px] font-medium uppercase tracking-[0.32em] text-gold-texto">
                Convite em vídeo
              </p>
              <h2 className="mx-auto mt-3 max-w-2xl text-center font-display text-[clamp(1.45rem,4.4vw,2.5rem)] font-normal uppercase leading-[1.12] tracking-[0.015em] text-foreground">
                Uma mensagem especial para você
              </h2>
              <p className="mx-auto mt-3 max-w-[32rem] text-center text-[14px] leading-relaxed text-muted-foreground sm:text-[15px]">
                Dê o play e descubra o que preparamos para esse momento.
              </p>

              <span
                className="filete mx-auto mt-6 block h-px w-10 bg-gold-deep/40"
                aria-hidden="true"
              />

              {/* O convite foi gravado na vertical: a largura é limitada pela
                  altura da tela para o quadro inteiro caber sem rolar. */}
              <div className="mx-auto mt-7 w-full max-w-[27rem] sm:mt-8">
                {temVideo ? (
                  <ConvitePlayer
                    key={tentativa}
                    onTrechosAssistidos={mandarProgresso}
                    onConcluir={concluirConvite}
                    onDuracao={abrirSessao}
                    concluido={liberado}
                  />
                ) : (
                  <ConviteEmPreparacao />
                )}
              </div>
            </div>
          </div>

          {/* Etapas e chamada para a confirmação */}
          <div className="mx-auto w-full max-w-[940px] pb-14 pt-7 sm:pb-20 sm:pt-9">
            <p
              className={`mb-5 text-center text-[15px] leading-relaxed ${liberado ? "text-foreground" : "text-muted-foreground"}`}
              aria-live="polite"
            >
              {done
                ? confirmou
                  ? "Sua presença está confirmada. O convite fica logo abaixo."
                  : "Sua resposta foi registrada. Obrigado por avisar."
                : liberado
                  ? "Agora confirme sua presença. Vamos celebrar juntos!"
                  : "Assista ao vídeo para liberar sua confirmação de presença."}
            </p>

            <div className="flex justify-center">
              <Button
                type="button"
                aria-disabled={!liberado}
                aria-label={
                  liberado
                    ? undefined
                    : "Confirmar minha presença. Disponível depois de assistir ao convite."
                }
                onClick={() => {
                  if (!liberado) return;
                  if (done) irAte(destinoConfirmacao.current);
                  else abrirConfirmacao();
                }}
                className={`min-h-[56px] w-full max-w-sm rounded-sm px-8 py-4 text-[11px] font-semibold uppercase tracking-[0.2em] transition-all duration-300 active:scale-[0.99] ${
                  done
                    ? "border border-gold/40 bg-card text-foreground hover:border-gold-deep hover:bg-surface"
                    : liberado
                      ? "border border-navy-deep bg-navy-deep text-primary-foreground shadow-[0_18px_40px_-24px_color-mix(in_oklab,var(--navy-deep)_80%,transparent)] hover:border-gold hover:bg-gold hover:text-navy-deep"
                      : "cursor-not-allowed border border-border bg-card/60 text-muted-foreground"
                }`}
              >
                {done ? "Ver minha resposta" : "Confirmar minha presença"}
              </Button>
            </div>

            {errors["form"] && !abriuFormulario && (
              <p className="mt-5 text-center text-sm text-destructive" role="alert">
                {errors["form"]}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ================= CONFIRMAÇÃO ================= */}
      <div ref={secaoConfirmacao}>
        {done ? (
          <section className="abrir textura-papel textura-papel--clara relative border-b border-border">
            <div
              ref={destinoConfirmacao}
              tabIndex={-1}
              className="mx-auto w-full max-w-[1240px] px-6 py-16 outline-none sm:px-10 sm:py-24 lg:px-14"
            >
              <div className="mx-auto max-w-2xl">
                <p className="text-[10px] font-medium uppercase tracking-[0.42em] text-gold-texto">
                  {confirmou ? "Presença confirmada" : "Resposta registrada"}
                </p>
                <span
                  className="filete mt-5 block h-px w-full max-w-[140px] bg-gold-deep/40"
                  aria-hidden="true"
                />
                <h2 className="mt-6 font-display text-[clamp(1.9rem,5vw,2.9rem)] font-normal leading-[1.1] text-foreground">
                  {confirmou ? "Presença confirmada." : "Obrigado por avisar."}
                </h2>
                <p className="mt-5 text-[15px] leading-relaxed text-muted-foreground">
                  {confirmou
                    ? "Será uma alegria celebrar este momento com você."
                    : "Sentiremos sua falta. Sua resposta foi registrada com a organização."}
                </p>

                <dl className="mt-12 border-t border-border">
                  {[
                    { rotulo: "Nome", valor: form.nome_completo },
                    { rotulo: "Empresa", valor: nomeDaEmpresa },
                    ...(confirmou
                      ? [
                          { rotulo: "Data", valor: evento.dataExtenso },
                          { rotulo: "Início", valor: evento.horario },
                          { rotulo: "Local", valor: evento.endereco },
                        ]
                      : []),
                  ].map((linha) => (
                    <div
                      key={linha.rotulo}
                      className="flex flex-wrap gap-x-10 gap-y-1 border-b border-border py-4"
                    >
                      <dt className="w-20 shrink-0 pt-1 text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                        {linha.rotulo}
                      </dt>
                      <dd className="flex-1 text-[15px] leading-relaxed text-foreground">
                        {linha.valor}
                      </dd>
                    </div>
                  ))}
                </dl>

                {confirmou && qrUrl && (
                  <div className="mt-12">
                    <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-8">
                      <img
                        src={qrUrl}
                        alt="QR code do convite"
                        className="h-36 w-36 border border-border bg-white p-2"
                      />
                      <div className="text-[13px] leading-relaxed text-muted-foreground">
                        <p className="text-foreground">Este é o seu convite.</p>
                        <p className="mt-1">Salve a imagem e apresente o código na entrada.</p>
                        {emailStatus === "enviando" && (
                          <p className="mt-3">Enviando o convite por e-mail...</p>
                        )}
                        {emailStatus === "ok" && (
                          <p className="mt-3 text-foreground">
                            Enviamos uma cópia para {form.email}.
                          </p>
                        )}
                        {emailStatus === "erro" && (
                          <p className="mt-3">
                            Não conseguimos enviar o e-mail agora, mas sua presença está confirmada.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="mt-8 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={baixarQr}
                        className="border border-primary bg-primary px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary-foreground transition-colors hover:bg-transparent hover:text-primary"
                      >
                        Baixar convite
                      </button>
                      <button
                        type="button"
                        onClick={enviarEmail}
                        className="border border-border px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-foreground transition-colors hover:border-gold-deep"
                      >
                        Enviar por e-mail
                      </button>
                      <button
                        type="button"
                        onClick={enviarWhatsApp}
                        className="border border-border px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-foreground transition-colors hover:border-gold-deep"
                      >
                        Enviar no WhatsApp
                      </button>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    // A sessão do convite é de uso único: quem responde agora
                    // precisa assistir ao convite outra vez.
                    reiniciarConvite();
                    setForm({ nome_completo: "", grupo: "", telefone: "", email: "" });
                    setResposta("sim");
                    setQrUrl("");
                    setInscricaoId("");
                    setEmailStatus("");
                    setErrors({});
                    setDone(false);
                  }}
                  className="mt-12 text-[11px] uppercase tracking-[0.24em] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Responder por outra pessoa
                </button>
              </div>
            </div>
          </section>
        ) : (
          abriuFormulario && (
            <section className="abrir textura-papel textura-papel--clara relative border-b border-border">
              <div className="mx-auto w-full max-w-[1240px] px-6 py-16 sm:px-10 sm:py-24 lg:px-14">
                <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
                  <div className="lg:col-span-4">
                    <p className="text-[10px] font-medium uppercase tracking-[0.42em] text-gold-texto">
                      Etapa 02
                    </p>
                    <span
                      className="filete mt-5 block h-px w-full max-w-[140px] bg-gold-deep/40"
                      aria-hidden="true"
                    />
                    <h2 className="mt-6 font-display text-[clamp(1.8rem,4.4vw,2.6rem)] font-normal leading-[1.1] text-foreground">
                      Podemos contar com você?
                    </h2>
                  </div>

                  <form onSubmit={handleSubmit} noValidate className="lg:col-span-8">
                    <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <label htmlFor="nome" className={rotulo}>
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
                          aria-describedby="erro-nome"
                          onChange={(e) => setForm({ ...form, nome_completo: e.target.value })}
                          onBlur={() => validarCampo("nome_completo")}
                        />
                        <p
                          id="erro-nome"
                          role="alert"
                          className="mt-2 min-h-[1.25rem] text-sm text-destructive"
                        >
                          {errors["nome_completo"] ?? ""}
                        </p>
                      </div>

                      <div>
                        <label htmlFor="telefone" className={rotulo}>
                          Telefone ou WhatsApp
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
                          aria-describedby="erro-telefone"
                          onChange={(e) =>
                            setForm({ ...form, telefone: formatarTelefone(e.target.value) })
                          }
                          onBlur={() => validarCampo("telefone")}
                        />
                        {errors["telefone"] && (
                          <p
                            id="erro-telefone"
                            role="alert"
                            className="mt-2 text-sm text-destructive"
                          >
                            {errors["telefone"]}
                          </p>
                        )}
                      </div>

                      <div>
                        <label htmlFor="email" className={rotulo}>
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
                          aria-describedby="erro-email"
                          onChange={(e) => setForm({ ...form, email: e.target.value })}
                          onBlur={() => validarCampo("email")}
                        />
                        <p
                          id="erro-email"
                          role="alert"
                          className="mt-2 min-h-[1.25rem] text-sm text-destructive"
                        >
                          {errors["email"] ?? ""}
                        </p>
                      </div>
                    </div>

                    <fieldset className="mt-10">
                      <legend className={rotulo}>Empresa</legend>
                      <div className="mt-3 border-t border-border">
                        {empresas.map((empresa) => {
                          const ativa = form.grupo === empresa.value;
                          return (
                            <label
                              key={empresa.value}
                              className="flex min-h-[56px] cursor-pointer items-center gap-4 border-b border-border transition-colors hover:bg-surface has-[:focus-visible]:bg-surface has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-gold-deep"
                            >
                              <input
                                type="radio"
                                name="empresa"
                                value={empresa.value}
                                checked={ativa}
                                onChange={() => {
                                  setForm({ ...form, grupo: empresa.value });
                                  setErrors((atuais) => {
                                    const proximos = { ...atuais };
                                    delete proximos["grupo"];
                                    return proximos;
                                  });
                                }}
                                className="sr-only"
                              />
                              <span
                                className={`h-px transition-all duration-300 ${
                                  ativa ? "w-8 bg-gold-deep" : "w-3 bg-border"
                                }`}
                                aria-hidden="true"
                              />
                              <span
                                className={`py-4 text-[15px] transition-colors ${
                                  ativa ? "text-foreground" : "text-muted-foreground"
                                }`}
                              >
                                {empresa.label}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      <p role="alert" className="mt-2 min-h-[1.25rem] text-sm text-destructive">
                        {errors["grupo"] ?? ""}
                      </p>
                    </fieldset>

                    {aceitaResposta && (
                      <fieldset className="mt-10">
                        <legend className={rotulo}>Confirmarei presença</legend>
                        <div className="mt-3 flex gap-3">
                          {[
                            { valor: "sim" as const, texto: "Sim, estarei lá" },
                            { valor: "nao" as const, texto: "Não poderei ir" },
                          ].map((opcao) => {
                            const ativa = resposta === opcao.valor;
                            return (
                              <label
                                key={opcao.valor}
                                className={`flex min-h-[56px] flex-1 cursor-pointer items-center justify-center border px-4 text-center text-[13px] transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-gold-deep ${
                                  ativa
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-border text-muted-foreground hover:border-gold-deep hover:text-foreground"
                                }`}
                              >
                                <input
                                  type="radio"
                                  name="presenca"
                                  value={opcao.valor}
                                  checked={ativa}
                                  onChange={() => setResposta(opcao.valor)}
                                  className="sr-only"
                                />
                                {opcao.texto}
                              </label>
                            );
                          })}
                        </div>
                      </fieldset>
                    )}

                    {errors["form"] && (
                      <p
                        className="mt-8 border-l-2 border-destructive/70 bg-destructive/5 px-4 py-3 text-sm text-destructive"
                        role="alert"
                      >
                        {errors["form"]}
                      </p>
                    )}

                    <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4 border-t border-border pt-8">
                      <button
                        type="submit"
                        disabled={loading}
                        aria-busy={loading}
                        className="flex min-h-[56px] items-center justify-center gap-3 border border-primary bg-primary px-9 text-[11px] font-semibold uppercase tracking-[0.26em] text-primary-foreground transition-colors hover:bg-transparent hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {loading && (
                          <span
                            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground"
                            aria-hidden="true"
                          />
                        )}
                        {loading
                          ? "Registrando..."
                          : !aceitaResposta || resposta === "sim"
                            ? "Enviar confirmação"
                            : "Enviar resposta"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAbriuFormulario(false);
                        }}
                        className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                      >
                        Voltar ao convite
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </section>
          )
        )}
      </div>

      {/* ================= CONTAGEM ================= */}
      <section className="sobre-escuro textura-papel relative bg-navy-deep text-primary-foreground">
        <div className="relative mx-auto grid w-full max-w-[1100px] gap-8 px-6 py-12 sm:px-10 sm:py-14 lg:grid-cols-[minmax(0,1fr)_30rem] lg:items-center lg:gap-16 lg:px-14">
          <div className="revelar min-w-0 text-center lg:text-left">
            <p className="text-[10px] font-medium uppercase tracking-[0.32em] text-gold">
              Contagem regressiva
            </p>
            <h2 className="mt-3 font-display text-[clamp(1.8rem,4vw,2.8rem)] font-normal leading-tight">
              Nosso encontro está chegando.
            </h2>
          </div>
          <ContagemRegressiva />
        </div>
      </section>

      {/* ================= LOCALIZAÇÃO ================= */}
      <section className="textura-papel textura-papel--clara relative border-t border-border">
        <div className="relative mx-auto grid w-full max-w-[1240px] gap-8 px-6 py-14 sm:px-10 sm:py-20 lg:grid-cols-[0.8fr_1.2fr] lg:items-stretch lg:gap-12 lg:px-14">
          <div className="revelar flex min-w-0 flex-col justify-center">
            <p className="text-[10px] font-medium uppercase tracking-[0.32em] text-gold-texto">
              Localização
            </p>
            <h2 className="mt-4 font-display text-[clamp(2rem,5vw,3.25rem)] font-normal leading-tight text-foreground">
              Maraponga, Fortaleza
            </h2>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-muted-foreground">
              {evento.endereco}
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <Button
                asChild
                variant="default"
                className="min-h-[52px] rounded-sm px-5 text-[11px] font-semibold uppercase tracking-[0.16em]"
              >
                <a href={evento.mapa} target="_blank" rel="noreferrer">
                  Abrir no Google Maps <ArrowUpRight aria-hidden="true" />
                </a>
              </Button>
              <Button
                asChild
                variant="outline"
                className="min-h-[52px] rounded-sm px-5 text-[11px] font-semibold uppercase tracking-[0.16em]"
              >
                <a href={evento.waze} target="_blank" rel="noreferrer">
                  Abrir no Waze <ArrowUpRight aria-hidden="true" />
                </a>
              </Button>
            </div>
          </div>
          <div className="revelar min-h-[320px] overflow-hidden border border-border bg-card shadow-[0_18px_48px_-38px_color-mix(in_oklab,var(--navy-deep)_50%,transparent)] sm:min-h-[390px]">
            <iframe
              title="Mapa do local da Confraternização 2026"
              src={evento.mapaEmbed}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="h-full min-h-[320px] w-full border-0 sm:min-h-[390px]"
            />
          </div>
        </div>
      </section>

      {/* ================= REALIZAÇÃO ================= */}
      <footer className="border-t border-border bg-card">
        <div className="mx-auto w-full max-w-[1240px] px-6 py-10 text-center sm:px-10 sm:py-14 lg:px-14">
          <p className="font-display text-xl text-foreground sm:text-2xl">
            Esperamos você para celebrarmos juntos.
          </p>
          <span className="mx-auto mt-5 block h-px w-12 bg-gold-deep/50" aria-hidden="true" />
          <ul className="mx-auto mt-7 grid max-w-[35rem] grid-cols-3 items-center gap-4 sm:gap-10">
            {logos.map((logo) => (
              <li key={logo.label} className="flex min-w-0 items-center justify-center">
                <Logo
                  webp={logo.webp}
                  png={logo.png}
                  alt={logo.label}
                  className="h-11 w-full max-w-[5rem] object-contain sm:h-14 sm:max-w-[6.5rem]"
                />
              </li>
            ))}
          </ul>
          <p className="mt-8 text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
            Confraternização 2026 · 19 de dezembro · 16h30
          </p>
        </div>
      </footer>

      {liberado && !done && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 shadow-[0_-12px_32px_-24px_color-mix(in_oklab,var(--navy-deep)_55%,transparent)] backdrop-blur-md sm:hidden">
          <Button
            type="button"
            onClick={abrirConfirmacao}
            className="min-h-[52px] w-full rounded-sm text-[11px] font-semibold uppercase tracking-[0.18em]"
          >
            Confirmar minha presença
          </Button>
        </div>
      )}
    </main>
  );
}
