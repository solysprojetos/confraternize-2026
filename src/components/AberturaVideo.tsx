import { useEffect, useRef, useState } from "react";
import { urlDoAsset, videoAbertura } from "@/config/evento";

const CHAVE_VISTA = "confra2026:abertura-vista";

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
 * Vídeo de abertura em tela cheia. Toca assim que o site abre; ao terminar
 * (ou em "Pular") some com um esmaecimento e revela o convite.
 *
 * Navegadores não deixam vídeo começar sozinho com som: tenta com som e, se
 * for recusado, toca sem som e mostra "Ativar som".
 */
export function AberturaVideo() {
  const [visivel, setVisivel] = useState(deveMostrar);
  const [saindo, setSaindo] = useState(false);
  const [mudo, setMudo] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

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
    v.play().catch(() => {
      v.muted = true;
      setMudo(true);
      v.play().catch(() => {
        // Nem sem som o navegador deixou tocar (economia de dados, por
        // exemplo): segue direto para o site
        encerrar();
      });
    });
    // Só na montagem: encerrar muda de identidade a cada render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!visivel) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") encerrar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  });

  if (!visivel) return null;

  const poster = urlDoAsset(videoAbertura.poster);

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
        className="relative mx-auto h-full w-full object-cover sm:w-auto sm:max-w-full sm:object-contain"
      />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/60 to-transparent" />

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-8">
        {mudo ? (
          <button
            type="button"
            onClick={() => {
              const v = video.current;
              if (!v) return;
              v.muted = false;
              setMudo(false);
              void v.play();
            }}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-white/15 px-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-white backdrop-blur transition-colors hover:bg-white/25"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
              <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
              <path
                d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
            Ativar som
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={encerrar}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-white/40 px-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-white transition-colors hover:bg-white/10"
        >
          Pular
          <span aria-hidden="true">›</span>
        </button>
      </div>
    </div>
  );
}
