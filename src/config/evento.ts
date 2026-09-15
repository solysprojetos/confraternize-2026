// Dados do evento e do vídeo-convite em um só lugar.
// Para publicar o convite real basta editar este arquivo (e colocar os
// arquivos em public/convite/) — nenhuma outra parte do site precisa mudar.

export const evento = {
  nome: "Confraternização 2026",
  chamada: "Um ano de conquistas. Um encontro para celebrar.",
  endereco: "Av. Godofredo Maciel, 1179 – Maraponga, Fortaleza – CE, 60714-175",
  bairro: "Maraponga, Fortaleza – CE",
  horario: "16h30",

  // Data do evento
  data: "2026-12-19",
  dataExtenso: "Sábado, 19 de dezembro de 2026",
  diaCurto: "19",
  mesCurto: "dez",

  // Busca pelo endereço no Google Maps, usada pelo botão "Ver localização"
  mapa:
    "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent("Av. Godofredo Maciel, 1179 - Maraponga, Fortaleza - CE, 60714-175"),
  mapaEmbed:
    "https://www.google.com/maps?q=" +
    encodeURIComponent("Av. Godofredo Maciel, 1179 - Maraponga, Fortaleza - CE, 60714-175") +
    "&output=embed",
  waze:
    "https://www.waze.com/ul?q=" +
    encodeURIComponent("Av. Godofredo Maciel, 1179 - Maraponga, Fortaleza - CE, 60714-175") +
    "&navigate=yes",
  // Fortaleza não adota horário de verão. O deslocamento -03:00 deixa a
  // contagem correta para convidados em qualquer fuso.
  inicioIso: "2026-12-19T16:30:00-03:00",
};

export const videoConvite = {
  // Arquivo do vídeo (MP4 H.264 recomendado). Enquanto estiver vazio, a
  // página mostra a capa de convite em preparação e a inscrição permanece
  // indisponível.
  // Ex.: src: "convite/convite-confraternizacao-2026.mp4"
  src: "convite/convite-confraternizacao-2026.mp4" as string,

  // Capa: o primeiro quadro do próprio vídeo, para o convite aparecer como
  // é — sem tela de abertura na frente dele.
  poster: "convite/capa-convite.jpg" as string,

  // Proporção do vídeo cadastrado (largura / altura). O convite foi
  // gravado na vertical (1080x1920), como as pessoas assistem no celular.
  proporcao: 9 / 16,

  // Legendas (WebVTT). Deixe src vazio para esconder o botão de legendas.
  // Ex.: legendas: { src: "convite/convite-pt-br.vtt", idioma: "pt-BR", rotulo: "Português" }
  legendas: {
    src: "" as string,
    idioma: "pt-BR",
    rotulo: "Português",
  },

  // Fração do vídeo que precisa ter sido efetivamente reproduzida para
  // liberar a inscrição (0,95 = 95% dos segundos do vídeo).
  coberturaMinima: 0.95,
};

// Caminhos relativos precisam respeitar a base do site (GitHub Pages publica
// em /confraternize-2026/).
export function urlDoAsset(caminho: string): string {
  if (!caminho) return "";
  if (/^(https?:)?\/\//.test(caminho) || caminho.startsWith("data:")) return caminho;
  const base = import.meta.env.BASE_URL || "/";
  return `${base.replace(/\/$/, "")}/${caminho.replace(/^\//, "")}`;
}

export const temVideoConvite = () => videoConvite.src.trim().length > 0;
