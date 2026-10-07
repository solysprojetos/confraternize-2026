import { useEffect, useRef, useState } from "react";
import { urlDoAsset, videoAbertura } from "@/config/evento";

const CHAVE_VISTA = "confra2026:abertura-vista";
/** Tempo máximo da abertura depois que o vídeo começa: a duração com folga. */
const LIMITE_MS = (videoAbertura.duracao + 15) * 1000;

/** Mostra a abertura só na primeira visita da sessão, e só se houver vídeo. */
function deveMostrar(): boolean {
  if (typeof window === "undefined" || !videoAbertura.src.trim()) return false;
  try {
    return sessionStorage.getItem(CHAVE_VISTA) !== "1";
  } catch {
    return true;
  }
}

/**
 * Vídeo de abertura em tela cheia. Toca assim que o site abre e, ao terminar,
 * some com um esmaecimento e revela o convite. Não tem "Pular": só sai antes
 * do fim se o vídeo não carregar.
 *
 * Navegadores não deixam vídeo começar sozinho com som. Tenta tocar com som;
 * se o navegador recusar, mostra a capa com o botão "Assistir" — o toque da
 * pessoa libera o som, e o vídeo começa já com áudio.
 */
export function AberturaVideo() {
  const [visivel, setVisivel] = useState(deveMostrar);
  const [saindo, setSaindo] = useState(false);
  const [aguardandoToque, setAguardandoToque] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const limite = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (limite.current !== null) window.clearTimeout(limite.current);
    },
    [],
  );

  function encerrar() {
    if (saindo) return;
    try {
      sessionStorage.setItem(CHAVE_VISTA, "1");
    } catch {
      /* sem sessionStorage a abertura só volta a aparecer ao recarregar */
    }
    video.current?.pause();
    setSaindo(true);
    window.setTimeout(() => setVisivel(false), 600);
  }

  useEffect(() => {
    if (!visivel) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = anterior;
    };
  }, [visivel]);

  useEffect(() => {
    const v = video.current;
    if (!visivel || !v) return;
    v.muted = false;
    v.play().catch(() => setAguardandoToque(true));
    // Só na montagem: encerrar muda de identidade a cada render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!visivel) return null;

  const poster = urlDoAsset(videoAbertura.poster);

  function assistir() {
    const v = video.current;
    if (!v) return;
    v.muted = false;
    setAguardandoToque(false);
    v.play().catch(() => {
      // Nem com o toque o navegador deixou tocar: segue para o site
      encerrar();
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={videoAbertura.titulo}
      className={`fixed inset-0 z-[100] overflow-hidden bg-navy-deep transition-opacity duration-500 ${
        saindo ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      {/* Fundo: a capa desfocada, para o vídeo vertical não ficar entre faixas pretas no computador */}
      {poster && (
        <div
          aria-hidden="true"
          className="absolute inset-0 scale-110 bg-cover bg-center opacity-50 blur-2xl"
          style={{ backgroundImage: `url(${poster})` }}
        />
      )}

      <video
        ref={video}
        src={urlDoAsset(videoAbertura.src)}
        poster={poster || undefined}
        playsInline
        preload="auto"
        onEnded={encerrar}
        onError={encerrar}
        onPlaying={() => {
          // Sem "Pular", uma conexão que trava no meio prenderia a pessoa:
          // passado o tempo do vídeo com folga, a abertura sai de qualquer jeito
          if (limite.current === null) {
            limite.current = window.setTimeout(encerrar, LIMITE_MS);
          }
        }}
        className="relative mx-auto h-full w-full object-cover sm:w-auto sm:max-w-full sm:object-contain"
      />

      {aguardandoToque && (
        <button
          type="button"
          onClick={assistir}
          className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-black/50 text-white"
        >
          <span className="flex h-24 w-24 items-center justify-center rounded-full bg-white/90 shadow-[0_0_0_12px_rgba(255,255,255,0.2)] transition-transform hover:scale-105">
            <svg viewBox="0 0 24 24" className="ml-1.5 h-10 w-10 text-navy-deep" aria-hidden="true">
              <path d="M7 4.5v15l12.5-7.5L7 4.5z" fill="currentColor" />
            </svg>
          </span>
          <span className="text-center">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.35em] text-gold">
              {videoAbertura.titulo}
            </span>
            <span className="mt-2 block text-sm text-white/85">Toque para assistir com som</span>
          </span>
        </button>
      )}
    </div>
  );
}
