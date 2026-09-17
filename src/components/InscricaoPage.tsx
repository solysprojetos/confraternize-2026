import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { ConvitePlayer, ConviteEmPreparacao } from "@/components/ConvitePlayer";
import { Button } from "@/components/ui/button";
import {
  evento,
  setores,
  temVideoConvite,
  temVideoRetrospectiva,
  urlDoAsset,
  videoRetrospectiva,
} from "@/config/evento";
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

/** Só quem é de uma das empresas do grupo informa o cargo. */
const empresasComCargo = ["grupo_support", "sgroup", "solys"];

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

/**
 * A lista de opções é apresentada como "cargo". Quem escolhe esta opção
 * escreve o nome por extenso; para as outras, o nome da opção vale como
 * cargo — assim o banco sempre recebe os dois campos preenchidos.
 */
const opcaoOutro = "Outro";

const schema = z
  .object({
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
    cargo: z.string().trim().max(120, "Cargo muito longo"),
    setor: z.string().trim().max(80),
  })
  .superRefine((dados, ctx) => {
    if (!empresasComCargo.includes(dados.grupo)) return;
    if (!setores.includes(dados.setor)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["setor"],
        message: "Selecione o seu cargo",
      });
    }
    // Só quem não achou o cargo na lista precisa escrever o nome
    if (dados.setor === opcaoOutro && dados.cargo.trim().length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cargo"],
        message: "Escreva o seu cargo",
      });
    }
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

/** Arquivo .ics com o evento, para o botão "Adicionar ao calendário". */
function linkCalendario(): string {
  const inicio = new Date(evento.inicioIso);
  // Quatro horas de duração é um chute razoável para o calendário; a pessoa
  // ajusta se quiser. O que importa é data, hora e endereço certos.
  const fim = new Date(inicio.getTime() + 4 * 60 * 60 * 1000);
  const utc = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const linhas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Confraternizacao 2026//PT-BR",
    "BEGIN:VEVENT",
    `UID:confra2026-${evento.data}@confragrupos.online`,
    `DTSTAMP:${utc(new Date())}`,
    `DTSTART:${utc(inicio)}`,
    `DTEND:${utc(fim)}`,
    `SUMMARY:${evento.nome}`,
    `LOCATION:${evento.endereco.replace(/,/g, "\\,")}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(linhas.join("\r\n"))}`;
}

function ContagemRegressiva() {
  const calcular = useCallback(() => {
    const restante = Math.max(0, new Date(evento.inicioIso).getTime() - Date.now());
    const segundos = Math.floor(restante / 1000);
    return {
      dias: Math.floor(segundos / 86400),
      horas: Math.floor((segundos % 86400) / 3600),
      minutos: Math.floor((segundos % 3600) / 60),
      segundos: segundos % 60,
    };
  }, []);
  const [tempoRestante, setTempoRestante] = useState(calcular);

  useEffect(() => {
    const id = window.setInterval(() => setTempoRestante(calcular()), 1000);
    return () => window.clearInterval(id);
  }, [calcular]);

  return (
    <div className="revelar text-center" style={{ "--atraso": "120ms" } as React.CSSProperties}>
      <p className="text-[11px] font-medium uppercase tracking-[0.42em] text-gold">Faltam</p>
      <div className="mx-auto mt-6 grid max-w-[40rem] grid-cols-4 gap-2 sm:mt-8 sm:gap-6">
        {[
          [tempoRestante.dias, "dias"],
          [tempoRestante.horas, "horas"],
          [tempoRestante.minutos, "minutos"],
          [tempoRestante.segundos, "segundos"],
        ].map(([valor, unidade]) => (
          <div key={unidade} className="min-w-0">
            <strong className="block font-display text-[clamp(2.4rem,9vw,4.5rem)] font-normal leading-none tabular-nums text-primary-foreground">
              {String(valor).padStart(2, "0")}
            </strong>
            <span className="mt-3 block text-[9px] font-medium uppercase tracking-[0.24em] text-primary-foreground/55 sm:text-[10px]">
              {unidade}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function InscricaoPage() {
  const [form, setForm] = useState({
    nome_completo: "",
    grupo: "",
    telefone: "",
    email: "",
    setor: "",
    cargo: "",
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
  const botaoPrincipal = useRef<HTMLButtonElement>(null);
  // A barra fixa do celular só entra quando o botão principal saiu da tela:
  // com os dois visíveis, a pessoa via o mesmo botão duas vezes.
  const [botaoPrincipalVisivel, setBotaoPrincipalVisivel] = useState(true);
  const temVideo = temVideoConvite();

  useEffect(() => {
    const alvo = botaoPrincipal.current;
    if (!alvo || typeof IntersectionObserver === "undefined") return;
    const observador = new IntersectionObserver(
      ([entrada]) => setBotaoPrincipalVisivel(Boolean(entrada?.isIntersecting)),
      { threshold: 0.4 },
    );
    observador.observe(alvo);
    return () => observador.disconnect();
  }, [liberado, done]);

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
      const ordem = ["nome_completo", "telefone", "email", "grupo", "setor", "cargo"] as const;
      const primeiro = ordem.find((campo) => proximos[campo]);
      const seletor =
        primeiro === "grupo"
          ? 'input[name="empresa"]'
          : primeiro === "setor"
            ? 'input[name="setor"]'
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
      cargo: !empresasComCargo.includes(analise.data.grupo)
        ? ""
        : analise.data.setor === opcaoOutro
          ? analise.data.cargo.trim()
          : analise.data.setor,
      setor: empresasComCargo.includes(analise.data.grupo) ? analise.data.setor : "",
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

          {/* Abertura: o título é o maior elemento da página; a data vem
              logo abaixo, em segundo plano; hora e local fecham o bloco. */}
          <div className="mx-auto max-w-4xl pb-14 pt-12 text-center sm:pb-20 sm:pt-20">
            <p className="revelar text-[10px] font-medium uppercase tracking-[0.42em] text-gold-texto">
              Convite oficial
            </p>
            <h1
              className="revelar mt-7 font-display text-[clamp(2.35rem,8.4vw,5.4rem)] font-normal uppercase leading-[0.98] tracking-[0.01em] text-foreground"
              style={{ "--atraso": "80ms" } as React.CSSProperties}
            >
              Confraternização <span className="italic text-gold-texto">2026</span>
            </h1>

            <p
              className="revelar mt-9 font-display text-[clamp(1.35rem,4.2vw,2.15rem)] font-normal uppercase leading-none tracking-[0.06em] text-foreground sm:mt-11"
              style={{ "--atraso": "200ms" } as React.CSSProperties}
            >
              19 de dezembro
            </p>
            <span
              className="filete mx-auto mt-7 block h-px w-10 bg-gold-deep/50"
              aria-hidden="true"
            />
            <p
              className="revelar mx-auto mt-7 text-[11px] uppercase leading-[2] tracking-[0.2em] text-muted-foreground sm:text-[12px]"
              style={{ "--atraso": "300ms" } as React.CSSProperties}
            >
              <span className="block whitespace-nowrap">Sábado · {evento.horario}</span>
              <span className="block">{evento.bairro}</span>
            </p>
          </div>

          {/* Convite em vídeo. Sem cartão em volta: o quadro do vídeo é a
              única peça, apoiado só pelo espaço e por um filete dourado. */}
          <div
            className="revelar mx-auto w-full max-w-[68rem] border-t border-border pt-12 sm:pt-16"
            style={{ "--atraso": "80ms" } as React.CSSProperties}
          >
            <p className="text-center text-[10px] font-medium uppercase tracking-[0.36em] text-gold-texto">
              Convite em vídeo
            </p>
            <h2 className="mx-auto mt-4 max-w-2xl text-center font-display text-[clamp(1.5rem,4.4vw,2.5rem)] font-normal uppercase leading-[1.12] tracking-[0.015em] text-foreground">
              Uma mensagem especial para você
            </h2>

            {/* O convite foi gravado na vertical: no celular ele toma quase
                toda a largura; no computador, a largura de um cartão. */}
            <div className="mx-auto mt-9 w-full max-w-[27rem] sm:mt-12">
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

          {/* Liberação da confirmação: o texto troca quando o convite
              termina e o botão passa de apagado a marinho com uma animação
              curta. */}
          <div className="mx-auto w-full max-w-[940px] pb-16 pt-10 text-center sm:pb-24 sm:pt-12">
            <p
              key={done ? "feito" : liberado ? "liberado" : "aguardando"}
              className={`trocar mx-auto max-w-md text-[12px] font-medium uppercase leading-[1.8] tracking-[0.16em] sm:text-[13px] ${
                liberado ? "text-foreground" : "text-muted-foreground"
              }`}
              aria-live="polite"
            >
              {done
                ? confirmou
                  ? "Sua presença está confirmada"
                  : "Sua resposta foi registrada"
                : liberado
                  ? "Sua confirmação de presença está liberada"
                  : "Assista ao vídeo para liberar sua confirmação de presença"}
            </p>
            <span
              className={`mx-auto mt-6 block h-px transition-all duration-700 ease-out ${
                liberado ? "w-14 bg-gold-deep/60" : "w-6 bg-border"
              }`}
              aria-hidden="true"
            />

            <div className="mt-8 flex justify-center">
              <Button
                ref={botaoPrincipal}
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
                className={`min-h-[62px] w-full max-w-[24rem] rounded-[4px] px-10 py-5 text-[12px] font-semibold uppercase tracking-[0.22em] transition-[background-color,border-color,color,box-shadow,transform] duration-300 ease-out active:scale-[0.99] ${
                  done
                    ? "border border-border bg-card text-foreground hover:border-gold-deep"
                    : liberado
                      ? "liberar border border-navy-deep bg-navy-deep text-primary-foreground shadow-[0_16px_36px_-26px_color-mix(in_oklab,var(--navy-deep)_90%,transparent)] hover:-translate-y-px hover:bg-navy hover:shadow-[0_20px_40px_-24px_color-mix(in_oklab,var(--navy-deep)_90%,transparent)]"
                      : "cursor-not-allowed border border-border bg-transparent text-muted-foreground"
                }`}
              >
                {done ? "Ver minha resposta" : "Confirmar minha presença"}
              </Button>
            </div>

            {errors["form"] && !abriuFormulario && (
              <p className="mt-6 text-center text-sm text-destructive" role="alert">
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
                <h2 className="mt-6 font-display text-[clamp(1.9rem,5vw,2.9rem)] font-normal uppercase leading-[1.1] tracking-[0.015em] text-foreground">
                  {confirmou ? "Presença confirmada." : "Obrigado por avisar."}
                </h2>
                <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-muted-foreground">
                  {confirmou
                    ? "Estamos felizes em contar com você neste momento especial."
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
                        className="min-h-[52px] border border-primary bg-primary px-6 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary-foreground transition-colors hover:bg-navy"
                      >
                        Baixar convite
                      </button>
                      <a
                        href={linkCalendario()}
                        download="confraternizacao-2026.ics"
                        className="inline-flex min-h-[52px] items-center border border-border px-6 text-[11px] font-semibold uppercase tracking-[0.24em] text-foreground transition-colors hover:border-gold-deep"
                      >
                        Adicionar ao calendário
                      </a>
                      <button
                        type="button"
                        onClick={enviarEmail}
                        className="min-h-[52px] border border-border px-6 text-[11px] font-semibold uppercase tracking-[0.24em] text-foreground transition-colors hover:border-gold-deep"
                      >
                        Enviar por e-mail
                      </button>
                      <button
                        type="button"
                        onClick={enviarWhatsApp}
                        className="min-h-[52px] border border-border px-6 text-[11px] font-semibold uppercase tracking-[0.24em] text-foreground transition-colors hover:border-gold-deep"
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
                    setForm({
                      nome_completo: "",
                      grupo: "",
                      telefone: "",
                      email: "",
                      setor: "",
                      cargo: "",
                    });
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
                      Confirmação de presença
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
                                  const pedeCargo = empresasComCargo.includes(empresa.value);
                                  setForm({
                                    ...form,
                                    grupo: empresa.value,
                                    // Parceiros e convidados não têm setor
                                    // nem cargo no grupo
                                    cargo: pedeCargo ? form.cargo : "",
                                    setor: pedeCargo ? form.setor : "",
                                  });
                                  setErrors((atuais) => {
                                    const proximos = { ...atuais };
                                    delete proximos["grupo"];
                                    if (!pedeCargo) {
                                      delete proximos["cargo"];
                                      delete proximos["setor"];
                                    }
                                    return proximos;
                                  });
                                }}
                                className="sr-only"
                              />
                              {/* Bolinha de seleção: anel fino que se preenche
                                  ao escolher */}
                              <span
                                className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors duration-300 ${
                                  ativa ? "border-navy-deep" : "border-muted-foreground/50"
                                }`}
                                aria-hidden="true"
                              >
                                <span
                                  className={`h-2.5 w-2.5 rounded-full bg-navy-deep transition-transform duration-300 ${
                                    ativa ? "scale-100" : "scale-0"
                                  }`}
                                />
                              </span>
                              <span
                                className={`py-4 text-[14px] uppercase tracking-[0.06em] transition-colors ${
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

                    {/* Quem é de uma das empresas do grupo escolhe o cargo na
                        lista; quem não acha o seu escreve o nome logo abaixo */}
                    {empresasComCargo.includes(form.grupo) && (
                      <fieldset className="abrir mt-8">
                        <legend className={rotulo}>
                          Qual é o seu cargo{" "}
                          <span className="text-destructive" aria-hidden="true">
                            *
                          </span>
                          <span className="sr-only">(obrigatório)</span>
                        </legend>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {setores.map((setor) => {
                            const ativo = form.setor === setor;
                            return (
                              <label
                                key={setor}
                                className={`flex min-h-[44px] cursor-pointer items-center justify-center border px-4 text-[13px] transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-gold-deep ${
                                  ativo
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-border text-muted-foreground hover:border-gold-deep hover:text-foreground"
                                }`}
                              >
                                <input
                                  type="radio"
                                  name="setor"
                                  value={setor}
                                  checked={ativo}
                                  onChange={() => {
                                    // Saindo de "Outro", o nome escrito não vale mais
                                    setForm({
                                      ...form,
                                      setor,
                                      cargo: setor === opcaoOutro ? form.cargo : "",
                                    });
                                    setErrors((atuais) => {
                                      const proximos = { ...atuais };
                                      delete proximos["setor"];
                                      if (setor !== opcaoOutro) delete proximos["cargo"];
                                      return proximos;
                                    });
                                  }}
                                  className="sr-only"
                                />
                                {setor}
                              </label>
                            );
                          })}
                        </div>
                        <p role="alert" className="mt-2 min-h-[1.25rem] text-sm text-destructive">
                          {errors["setor"] ?? ""}
                        </p>
                      </fieldset>
                    )}

                    {empresasComCargo.includes(form.grupo) && form.setor === opcaoOutro && (
                      <div className="abrir mt-6">
                        <label htmlFor="cargo" className={rotulo}>
                          Escreva o seu cargo{" "}
                          <span className="text-destructive" aria-hidden="true">
                            *
                          </span>
                          <span className="sr-only">(obrigatório)</span>
                        </label>
                        <input
                          id="cargo"
                          className={`${campo} ${errors["cargo"] ? campoErro : campoOk}`}
                          value={form.cargo}
                          maxLength={120}
                          autoComplete="organization-title"
                          required
                          autoFocus
                          placeholder="Ex.: Analista financeiro"
                          aria-invalid={Boolean(errors["cargo"])}
                          aria-describedby="erro-cargo"
                          onChange={(e) => {
                            const valor = e.target.value;
                            setForm({ ...form, cargo: valor });
                            // O aviso some assim que o campo deixa de estar vazio
                            if (valor.trim().length >= 2) {
                              setErrors((atuais) => {
                                if (!atuais["cargo"]) return atuais;
                                const proximos = { ...atuais };
                                delete proximos["cargo"];
                                return proximos;
                              });
                            }
                          }}
                          onBlur={() => validarCampo("cargo")}
                        />
                        <p
                          id="erro-cargo"
                          role="alert"
                          className="mt-2 min-h-[1.25rem] text-sm text-destructive"
                        >
                          {errors["cargo"] ?? ""}
                        </p>
                      </div>
                    )}

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
        <div className="relative mx-auto w-full max-w-[1100px] px-6 py-16 sm:px-10 sm:py-24 lg:px-14">
          <div className="revelar text-center">
            <p className="text-[10px] font-medium uppercase tracking-[0.36em] text-gold">
              Contagem regressiva
            </p>
            <h2 className="mt-4 font-display text-[clamp(1.7rem,4vw,2.6rem)] font-normal uppercase leading-tight tracking-[0.015em]">
              Nosso encontro está chegando
            </h2>
          </div>
          <div className="mt-12 sm:mt-16">
            <ContagemRegressiva />
          </div>
        </div>
      </section>

      {/* ================= LOCALIZAÇÃO ================= */}
      <section className="textura-papel textura-papel--clara relative border-t border-border">
        <div className="relative mx-auto grid w-full max-w-[1240px] gap-8 px-6 py-14 sm:px-10 sm:py-20 lg:grid-cols-[0.8fr_1.2fr] lg:items-stretch lg:gap-12 lg:px-14">
          <div className="revelar flex min-w-0 flex-col justify-center">
            <p className="text-[10px] font-medium uppercase tracking-[0.36em] text-gold-texto">
              Local do evento
            </p>
            <h2 className="mt-4 font-display text-[clamp(2rem,5vw,3.25rem)] font-normal uppercase leading-tight tracking-[0.015em] text-foreground">
              Maraponga, Fortaleza
            </h2>
            <span className="filete mt-6 block h-px w-10 bg-gold-deep/50" aria-hidden="true" />
            <p className="mt-6 max-w-md text-[15px] leading-relaxed text-muted-foreground">
              {evento.endereco}
            </p>
            {/* Os dois botões são iguais: mesmo tamanho, mesma borda, mesmo
                peso. No celular cada um toma a largura toda. */}
            <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {[
                { texto: "Abrir no Google Maps", href: evento.mapa },
                { texto: "Abrir no Waze", href: evento.waze },
              ].map((destino) => (
                <a
                  key={destino.texto}
                  href={destino.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-[56px] items-center justify-center gap-2 rounded-[4px] border border-navy-deep px-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-navy-deep transition-colors duration-300 hover:bg-navy-deep hover:text-primary-foreground"
                >
                  {destino.texto} <ArrowUpRight aria-hidden="true" className="size-4" />
                </a>
              ))}
            </div>
          </div>
          <div className="revelar min-h-[320px] overflow-hidden rounded-[4px] border border-border bg-card sm:min-h-[390px]">
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

      {/* ================= RETROSPECTIVA (opcional) =================
          Só aparece quando o vídeo de 2025 for cadastrado em evento.ts. */}
      {temVideoRetrospectiva() && (
        <section className="textura-papel textura-papel--clara relative border-t border-border">
          <div className="relative mx-auto w-full max-w-[1240px] px-6 py-16 text-center sm:px-10 sm:py-24 lg:px-14">
            <p className="revelar text-[10px] font-medium uppercase tracking-[0.36em] text-gold-texto">
              Memória
            </p>
            <h2 className="revelar mt-4 font-display text-[clamp(1.7rem,4.4vw,2.6rem)] font-normal uppercase leading-tight tracking-[0.015em] text-foreground">
              Relembre nossa Confraternização de 2025
            </h2>
            <div
              className="revelar mx-auto mt-10 w-full max-w-[52rem] overflow-hidden rounded-xl bg-navy-deep shadow-[0_18px_44px_-30px_color-mix(in_oklab,var(--navy-deep)_60%,transparent)] ring-1 ring-navy-deep/10"
              style={{ aspectRatio: String(videoRetrospectiva.proporcao) }}
            >
              <video
                src={urlDoAsset(videoRetrospectiva.src)}
                poster={urlDoAsset(videoRetrospectiva.poster) || undefined}
                controls
                playsInline
                preload="metadata"
                className="h-full w-full object-contain"
              />
            </div>
          </div>
        </section>
      )}

      {/* ================= ENCERRAMENTO ================= */}
      <footer className="border-t border-border bg-card">
        <div className="mx-auto w-full max-w-[1240px] px-6 py-20 text-center sm:px-10 sm:py-28 lg:px-14">
          <p className="revelar mx-auto max-w-3xl font-display text-[clamp(1.5rem,4.6vw,2.7rem)] font-normal uppercase leading-[1.15] tracking-[0.015em] text-foreground">
            Esperamos você na Confraternização 2026
          </p>
          <p
            className="revelar mt-6 font-display text-[clamp(1.1rem,3vw,1.5rem)] uppercase tracking-[0.08em] text-gold-texto"
            style={{ "--atraso": "100ms" } as React.CSSProperties}
          >
            19 de dezembro
          </p>
          <span
            className="filete mx-auto mt-8 block h-px w-10 bg-gold-deep/50"
            aria-hidden="true"
          />
          <p
            className="revelar mx-auto mt-8 max-w-xl text-[14px] leading-relaxed text-muted-foreground sm:text-[15px]"
            style={{ "--atraso": "200ms" } as React.CSSProperties}
          >
            Um momento para celebrar nossas conquistas, fortalecer conexões e reconhecer quem faz
            parte desta história.
          </p>
          <ul className="mx-auto mt-16 grid max-w-[35rem] grid-cols-3 items-center gap-4 sm:mt-20 sm:gap-10">
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
        </div>
      </footer>

      {/* A barra fixa some com o formulário aberto: a pessoa já está onde o
          botão levaria, e ele ficava por cima dos campos. */}
      {liberado && !done && !abriuFormulario && !botaoPrincipalVisivel && (
        <div className="abrir fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 backdrop-blur-md sm:hidden">
          <Button
            type="button"
            onClick={abrirConfirmacao}
            className="min-h-[56px] w-full rounded-[4px] bg-navy-deep text-[12px] font-semibold uppercase tracking-[0.22em] hover:bg-navy"
          >
            Confirmar minha presença
          </Button>
        </div>
      )}
    </main>
  );
}
