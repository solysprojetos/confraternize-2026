// Dados do evento e do vídeo-convite em um só lugar.
// Para publicar o convite real basta editar este arquivo (e colocar os
// arquivos em public/convite/) — nenhuma outra parte do site precisa mudar.

export const evento = {
  nome: "Confraternização 2026",
  endereco: "Av. Godofredo Maciel, 1179 – Maraponga, Fortaleza – CE, 60714-175",
  horario: "16h30",

  // Data completa do evento. Ainda não há data cadastrada no projeto: assim
  // que ela for definida, preencha os dois campos abaixo e ela passa a
  // aparecer em destaque na página.
  // Ex.: data: "2026-12-12", dataExtenso: "Sábado, 12 de dezembro de 2026"
  data: "" as string,
  dataExtenso: "" as string,
};

export const videoConvite = {
  // Arquivo do vídeo (MP4 H.264 recomendado). Deixe vazio enquanto o convite
  // ainda não estiver pronto: a página avisa que ele será publicado em breve
  // e mantém as inscrições abertas.
  // Ex.: src: "convite/convite-confraternizacao-2026.mp4"
  src: "" as string,

  // Capa personalizada exibida antes de o visitante iniciar a reprodução.
  // Ex.: poster: "convite/capa-convite.jpg"
  poster: "" as string,

  // Legendas (WebVTT). Deixe src vazio para esconder o botão CC.
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
