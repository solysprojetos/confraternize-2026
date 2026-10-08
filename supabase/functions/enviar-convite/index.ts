// Envia os e-mails da Confraternização 2026 (convite com QR code e lembretes).
// Modos:
//   { id: "<uuid>" }                        -> convite de uma inscrição recém-feita
//   { pendentes: true }                     -> reenvia até 250 convites ainda não enviados
//   { lembretes: true }                     -> envia o lembrete do dia, se houver (ver abaixo)
//   { id: "<uuid>", teste: "semana" | "vespera" }
//                                           -> prévia de um lembrete para essa inscrição,
//                                              sem marcar nada no banco (só para o admin logado)
// Lembretes, pela data em Fortaleza:
//   12 a 17/12 -> "falta uma semana", para quem confirmou até a véspera do envio
//   18 e 19/12 (até o início) -> "é amanhã" / "é hoje"
// Fora dessas datas o modo lembretes não faz nada, e cada pessoa recebe cada
// lembrete uma vez só — pode ser chamado quantas vezes for preciso.
// A chave do Brevo vem da tabela privada public.config (fallback: env).
// Autenticação própria: só envia para o e-mail gravado em inscrições reais, e o
// convite de cada inscrição sai uma vez só — chamar de novo com o mesmo id não
// reenvia (evita usar o id do QR code para lotar a caixa de alguém).
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EMAIL_ADMIN = "solysprojetos@gmail.com";

const NOME_GRUPO: Record<string, string> = {
  grupo_support: "Grupo Support",
  sgroup: "SGroup Nacional",
  solys: "Solys Gestão Administrativa",
  parceiros: "Parceiros",
  convidados: "Convidados",
};

const EVENTO = {
  inicio: new Date("2026-12-19T16:30:00-03:00"),
  inicioLembreteSemana: "2026-12-12",
  inicioLembreteVespera: "2026-12-18",
  horario: "16h30",
  endereco: "Av. Godofredo Maciel, 1179 – Maraponga, Fortaleza – CE, 60714-175",
  mapa:
    "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent("Av. Godofredo Maciel, 1179 - Maraponga, Fortaleza - CE, 60714-175"),
  site: "https://confragrupos.online/",
};

type Inscricao = {
  id: string;
  nome_completo: string;
  email: string;
  grupo: string;
};

type Lembrete = "semana" | "vespera";

const COLUNA: Record<Lembrete, string> = {
  semana: "lembrete_semana_enviado",
  vespera: "lembrete_vespera_enviado",
};

/** Data de hoje em Fortaleza (UTC-3, sem horário de verão), no formato AAAA-MM-DD. */
function hojeEmFortaleza(agora: Date): string {
  return new Date(agora.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Qual lembrete vale para agora, ou null fora das datas. */
function lembreteDoMomento(agora: Date): Lembrete | null {
  if (agora >= EVENTO.inicio) return null;
  const hoje = hojeEmFortaleza(agora);
  if (hoje >= EVENTO.inicioLembreteVespera) return "vespera";
  if (hoje >= EVENTO.inicioLembreteSemana) return "semana";
  return null;
}

function qrUrl(id: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=${encodeURIComponent("CONFRA2026:" + id)}`;
}

function primeiroNome(ins: Inscricao): string {
  return formatarNome(ins.nome_completo).split(" ")[0] ?? "";
}

/** Link do Google Agenda com o evento já preenchido. */
function agendaUrl(): string {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: "Confraternização 2026",
    // Mesmas 4 horas do botão "Adicionar ao calendário" do site
    dates: "20261219T193000Z/20261219T233000Z",
    location: EVENTO.endereco,
    details: `Convite: ${EVENTO.site}`,
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

/** Nome como escrito, com as iniciais em maiúscula ("luis da silva" -> "Luis da Silva"). */
function formatarNome(nome: string): string {
  return nome
    .trim()
    .split(/\s+/)
    .map((p, i) =>
      i > 0 && /^(de|da|do|das|dos|e)$/i.test(p)
        ? p.toLowerCase()
        : p.charAt(0).toUpperCase() + p.slice(1),
    )
    .join(" ");
}

/**
 * Modelo único de todos os e-mails, pensado para a tela do celular: cartão
 * estreito com moldura dourada, título fixo, selo que muda conforme o e-mail
 * (confirmação, uma semana, véspera), data/horário/local em linhas curtas,
 * QR code de entrada e os dois botões lado a lado.
 */
function montarEmail(ins: Inscricao, selo: string, abertura: string): string {
  const nome = formatarNome(ins.nome_completo);
  const linha = (rotulo: string, valor: string) =>
    `<tr>
      <td style="padding:5px 10px 5px 0;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#9a7736;white-space:nowrap;vertical-align:top;text-align:left;width:64px">${rotulo}</td>
      <td style="padding:5px 0;font-size:14px;line-height:1.4;color:#0c1a30;text-align:left">${valor}</td>
    </tr>`;
  const botao = (href: string, texto: string, fundo: string, cor: string) =>
    `<td width="50%" style="padding:0 3px"><a href="${href}" style="display:block;background:${fundo};color:${cor};border:1px solid #0c1a30;text-decoration:none;font-size:11px;letter-spacing:1px;text-transform:uppercase;padding:11px 4px;text-align:center">${texto}</a></td>`;
  return `
<div style="background:#ffffff;padding:12px 6px">
<div style="font-family:Arial,Helvetica,sans-serif;max-width:440px;margin:0 auto;background:#ffffff;border:1px solid #c8a96b;color:#1a2233">
<div style="padding:20px 18px;text-align:center">
  <p style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#5d6574;margin:0">Grupo Support · SGroup · Solys</p>
  <h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:24px;line-height:1.2;color:#0c1a30;margin:10px 0 4px">Confraternização 2026</h1>
  <p style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#9a7736;margin:0 0 12px">${selo}</p>
  <p style="margin:0 0 14px;color:#4b5563;font-size:14px;line-height:1.45">${abertura}</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e3d5b5;border-bottom:1px solid #e3d5b5;margin:0 0 16px">
    <tr><td style="padding:8px 0">
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto">
        ${linha("Data", "<strong>Sábado, 19/12/2026</strong>")}
        ${linha("Horário", "<strong>" + EVENTO.horario + "</strong>")}
        ${linha("Local", "Av. Godofredo Maciel, 1179<br>Maraponga, Fortaleza – CE")}
      </table>
    </td></tr>
  </table>
  <p style="margin:0 0 8px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#9a7736">QR code de entrada</p>
  <img src="${qrUrl(ins.id)}" width="150" height="150" alt="QR code do convite" style="display:block;margin:0 auto;border:1px solid #e3d5b5" />
  <p style="margin:8px 0 0;font-size:13px;color:#0c1a30"><strong>${nome}</strong></p>
  <p style="margin:2px 0 16px;font-size:12px;color:#6b7280">${NOME_GRUPO[ins.grupo] ?? ins.grupo} · apresente na entrada</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    ${botao(EVENTO.mapa, "Como chegar", "#0c1a30", "#f3e6c8")}
    ${botao(agendaUrl(), "Salvar na agenda", "#ffffff", "#0c1a30")}
  </tr></table>
</div>
</div>
<p style="font-family:Arial,Helvetica,sans-serif;text-align:center;font-size:11px;color:#9ca3af;margin:10px 0 0">Você recebe este e-mail porque confirmou presença em <a href="${EVENTO.site}" style="color:#9a7736">confragrupos.online</a>.</p>
</div>`;
}

function montarHtml(ins: Inscricao): string {
  return montarEmail(
    ins,
    "Presença confirmada",
    `Obrigado, ${primeiroNome(ins)}! Te esperamos lá.`,
  );
}

/** Título e frase de abertura do lembrete, conforme o tipo e o dia. */
function textoLembrete(
  tipo: Lembrete,
  agora: Date,
): { assunto: string; titulo: string; frase: string } {
  if (tipo === "vespera") {
    const eHoje = hojeEmFortaleza(agora) === "2026-12-19";
    return eHoje
      ? {
          assunto: "É hoje! Confraternização 2026 às 16h30",
          titulo: "É hoje!",
          frase: "Chegou o dia da nossa confraternização. Estamos esperando você.",
        }
      : {
          assunto: "É amanhã! Confraternização 2026",
          titulo: "É amanhã!",
          frase: "Falta só um dia para a nossa confraternização. Estamos esperando você.",
        };
  }
  const dias = 19 - Number(hojeEmFortaleza(agora).slice(8, 10));
  const falta = dias >= 7 ? "Falta uma semana" : `Faltam ${dias} dias`;
  return {
    assunto: `${falta} para a Confraternização 2026`,
    titulo: `${falta}!`,
    frase: "Está chegando a nossa confraternização.",
  };
}

function montarHtmlLembrete(ins: Inscricao, tipo: Lembrete, agora: Date): string {
  const t = textoLembrete(tipo, agora);
  return montarEmail(ins, t.titulo, `Olá, ${primeiroNome(ins)}. ${t.frase}`);
}

async function enviarBrevo(
  apiKey: string,
  ins: Inscricao,
  assunto: string,
  html: string,
): Promise<void> {
  const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      sender: { name: "Confraternização 2026", email: EMAIL_ADMIN },
      to: [{ email: ins.email, name: ins.nome_completo }],
      subject: assunto,
      htmlContent: html,
    }),
  });
  if (!resp.ok) throw new Error(`envio falhou (${resp.status}): ${await resp.text()}`);
}

function responder(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let apiKey = Deno.env.get("BREVO_API_KEY") ?? "";
    if (!apiKey) {
      const { data: cfg } = await supabase
        .from("config")
        .select("valor")
        .eq("chave", "BREVO_API_KEY")
        .single();
      apiKey = cfg?.valor ?? "";
    }
    if (!apiKey) throw new Error("BREVO_API_KEY não configurada");

    if (body.lembretes === true) {
      const agora = new Date();
      const tipo = lembreteDoMomento(agora);
      if (!tipo) return responder({ ok: true, lembrete: null, enviados: 0 });

      let consulta = supabase
        .from("inscricoes")
        .select("id, nome_completo, email, grupo")
        .eq("comparecera", true)
        .eq(COLUNA[tipo], false);
      // Quem confirmou nas últimas 24 h acabou de receber o convite: fica só
      // com o lembrete da véspera
      if (tipo === "semana") {
        consulta = consulta.lt("created_at", new Date(agora.getTime() - 86400000).toISOString());
      }
      const { data: fila, error } = await consulta
        .order("created_at", { ascending: true })
        .limit(250);
      if (error) throw error;

      const t = textoLembrete(tipo, agora);
      let enviados = 0;
      for (const ins of (fila ?? []) as Inscricao[]) {
        try {
          await enviarBrevo(apiKey, ins, t.assunto, montarHtmlLembrete(ins, tipo, agora));
          await supabase
            .from("inscricoes")
            .update({ [COLUNA[tipo]]: true })
            .eq("id", ins.id);
          enviados++;
        } catch (_e) {
          // Cota do Brevo esgotada ou falha pontual: o resto fica para a próxima execução
          break;
        }
      }
      return responder({
        ok: true,
        lembrete: tipo,
        enviados,
        pendentes: (fila ?? []).length - enviados,
      });
    }

    if (body.pendentes === true) {
      // Quem respondeu que não vai não tem convite (QR code) a receber
      const { data: fila, error } = await supabase
        .from("inscricoes")
        .select("id, nome_completo, email, grupo")
        .eq("convite_enviado", false)
        .eq("comparecera", true)
        .order("created_at", { ascending: true })
        .limit(250);
      if (error) throw error;
      let enviados = 0;
      for (const ins of (fila ?? []) as Inscricao[]) {
        try {
          await enviarBrevo(
            apiKey,
            ins,
            "Presença confirmada - seu convite da Confraternização 2026",
            montarHtml(ins),
          );
          await supabase.from("inscricoes").update({ convite_enviado: true }).eq("id", ins.id);
          enviados++;
        } catch (_e) {
          break;
        }
      }
      return responder({ ok: true, enviados, pendentes: (fila ?? []).length - enviados });
    }

    const id = body.id;
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error("id inválido");
    const { data: ins, error } = await supabase
      .from("inscricoes")
      .select("id, nome_completo, email, grupo")
      .eq("id", id)
      .eq("comparecera", true)
      .single();
    if (error || !ins) throw new Error("inscrição não encontrada");

    if (body.teste === "semana" || body.teste === "vespera") {
      // Prévias só para o admin logado no painel
      const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
      const { data: usuario } = await supabase.auth.getUser(token);
      if (usuario?.user?.email !== EMAIL_ADMIN) throw new Error("não autorizado");
      // A prévia simula o dia do envio real, para o texto sair igual
      const agora = new Date(
        body.teste === "semana" ? "2026-12-12T09:00:00-03:00" : "2026-12-18T09:00:00-03:00",
      );
      const t = textoLembrete(body.teste, agora);
      await enviarBrevo(
        apiKey,
        ins as Inscricao,
        `[Teste] ${t.assunto}`,
        montarHtmlLembrete(ins as Inscricao, body.teste, agora),
      );
      return responder({ ok: true, teste: body.teste });
    }

    // Reserva o envio antes de mandar: só uma chamada por inscrição passa daqui
    const { data: reservada, error: erroReserva } = await supabase
      .from("inscricoes")
      .update({ convite_enviado: true })
      .eq("id", id)
      .eq("convite_enviado", false)
      .select("id");
    if (erroReserva) throw erroReserva;
    if (!reservada?.length) return responder({ ok: true, jaEnviado: true });

    try {
      await enviarBrevo(
        apiKey,
        ins as Inscricao,
        "Presença confirmada - seu convite da Confraternização 2026",
        montarHtml(ins as Inscricao),
      );
    } catch (e) {
      // Volta para a fila: o robô diário ({ pendentes: true }) tenta de novo
      await supabase.from("inscricoes").update({ convite_enviado: false }).eq("id", id);
      throw e;
    }

    return responder({ ok: true });
  } catch (e) {
    return responder({ ok: false, error: String(e) }, 400);
  }
});
