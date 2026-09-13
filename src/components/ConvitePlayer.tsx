import { useCallback, useEffect, useRef, useState } from "react";
import { evento, urlDoAsset, videoConvite } from "@/config/evento";

type Props = {
  /** Trechos (segundos inteiros) assistidos desde o último envio ao servidor. */
  onTrechosAssistidos: (trechos: number[], duracao: number) => void;
  /** Chamado uma única vez, quando a cobertura mínima é atingida. */
  onConcluir: (duracao: number) => void;
  /** Informa a duração real assim que os metadados carregam. */
  onDuracao?: (duracao: number) => void;
  concluido: boolean;
};

function tempo(segundos: number): string {
  if (!Number.isFinite(segundos) || segundos < 0) return "0:00";
  const m = Math.floor(segundos / 60);
  const s = Math.floor(segundos % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const IconePlay = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-full w-full fill-current">
    <path d="M8 5.14v13.72L19 12z" />
  </svg>
);

const IconePausa = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-full w-full fill-current">
    <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
  </svg>
);

const IconeSom = ({ mudo }: { mudo: boolean }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-full w-full fill-current">
    <path d="M4 9v6h3.5L12 19V5L7.5 9z" />
    {mudo ? (
      <path d="M15.5 9.5l5 5m0-5l-5 5" stroke="currentColor" strokeWidth="1.8" fill="none" />
    ) : (
      <path
        d="M15.6 8.4a5 5 0 010 7.2M17.9 6a8.2 8.2 0 010 12"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="none"
      />
    )}
  </svg>
);

const IconeTelaCheia = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-full w-full fill-current">
    <path d="M4 9V4h5v2H6v3zm11-5h5v5h-2V6h-3zM6 15v3h3v2H4v-5zm12 0h2v5h-5v-2h3z" />
  </svg>
);

/** Moldura com a identidade do evento, usada pela capa e pelo aviso de convite em preparação. */
function MolduraConvite({ children, proporcao }: { children: React.ReactNode; proporcao: number }) {
  return (
    <div
      className="sobre-escuro relative w-full max-w-full overflow-hidden rounded-2xl bg-navy-deep ring-1 ring-white/10"
      style={{ aspectRatio: String(proporcao) }}
    >
      <span
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 0%, color-mix(in oklab, var(--navy-soft) 85%, transparent) 0%, transparent 62%)",
        }}
        aria-hidden="true"
      />
      <div className="relative flex h-full w-full flex-col items-center justify-center px-6 text-center">
        {children}
      </div>
    </div>
  );
}

/** Capa exibida enquanto o convite em vídeo ainda não foi cadastrado. */
export function ConviteEmPreparacao() {
  return (
    <MolduraConvite proporcao={videoConvite.proporcao}>
      <span className="h-px w-10 bg-gold/70" aria-hidden="true" />
      <p className="mt-5 font-display text-xl leading-snug text-white sm:text-2xl">
        Estamos preparando um convite especial para você
      </p>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/70">
        Assim que o vídeo estiver pronto, a confirmação de presença será liberada aqui mesmo.
      </p>
      <span className="mt-5 h-px w-10 bg-gold/70" aria-hidden="true" />
    </MolduraConvite>
  );
}

export function ConvitePlayer({ onTrechosAssistidos, onConcluir, onDuracao, concluido }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Segundos inteiros efetivamente reproduzidos (não é temporizador nem
  // posição da barra: cada bloco só entra quando o vídeo passa por ele tocando)
  const assistidosRef = useRef<Set<number>>(new Set());
  const pendentesRef = useRef<Set<number>>(new Set());
  const maxAssistidoRef = useRef(0);
  const posicaoAnteriorRef = useRef(0);
  const concluidoRef = useRef(concluido);

  const [iniciado, setIniciado] = useState(false);
  const [tocando, setTocando] = useState(false);
  const [duracao, setDuracao] = useState(0);
  const [posicao, setPosicao] = useState(0);
  const [maxAssistido, setMaxAssistido] = useState(0);
  const [cobertura, setCobertura] = useState(0);
  const [mudo, setMudo] = useState(false);
  const [volume, setVolume] = useState(1);
  const [legendasAtivas, setLegendasAtivas] = useState(false);
  const [erro, setErro] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [avisoAvanco, setAvisoAvanco] = useState(false);
  const [fimSemCobertura, setFimSemCobertura] = useState(false);

  useEffect(() => {
    concluidoRef.current = concluido;
  }, [concluido]);

  const totalBlocos = useCallback(
    () => Math.max(1, Math.floor(videoRef.current?.duration || duracao || 0)),
    [duracao],
  );

  // Envia ao servidor, em lotes, os trechos novos que foram reproduzidos
  const enviarPendentes = useCallback(() => {
    if (pendentesRef.current.size === 0) return;
    const trechos = [...pendentesRef.current].sort((a, b) => a - b);
    pendentesRef.current.clear();
    onTrechosAssistidos(trechos, totalBlocos());
  }, [onTrechosAssistidos, totalBlocos]);

  useEffect(() => {
    const id = window.setInterval(enviarPendentes, 5000);
    return () => {
      window.clearInterval(id);
      enviarPendentes();
    };
  }, [enviarPendentes]);

  const legendaSrc = urlDoAsset(videoConvite.legendas.src);
  const poster = urlDoAsset(videoConvite.poster);
  const src = urlDoAsset(videoConvite.src);

  function marcarBloco(t: number) {
    const total = totalBlocos();
    const bloco = Math.min(Math.max(0, Math.floor(t)), total - 1);
    if (!assistidosRef.current.has(bloco)) {
      assistidosRef.current.add(bloco);
      pendentesRef.current.add(bloco);
      const atual = assistidosRef.current.size / total;
      setCobertura(atual);
      if (!concluidoRef.current && atual >= videoConvite.coberturaMinima) {
        concluidoRef.current = true;
        enviarPendentes();
        onConcluir(total);
      }
    }
  }

  function handleTimeUpdate() {
    const v = videoRef.current;
    if (!v) return;
    const atual = v.currentTime;
    const anterior = posicaoAnteriorRef.current;
    setPosicao(atual);
    if (!v.paused && !v.seeking) {
      // Marca todo o intervalo percorrido desde o quadro anterior — se o
      // navegador atrasar um evento, o trecho reproduzido não se perde.
      // Saltos maiores (seek) continuam de fora: só entra o que foi tocado.
      const salto = atual - anterior;
      const limite = Math.max(2, 2 * (v.playbackRate || 1));
      if (salto > 0 && salto <= limite) {
        for (let t = Math.floor(anterior); t <= Math.floor(atual); t++) marcarBloco(t);
      } else {
        marcarBloco(atual);
      }
      if (atual > maxAssistidoRef.current) {
        maxAssistidoRef.current = atual;
        setMaxAssistido(atual);
      }
    }
    posicaoAnteriorRef.current = atual;
  }

  // Impede avançar para trechos ainda não reproduzidos, venha de onde vier
  // (barra, teclado, gestos ou controles do sistema)
  function handleSeeking() {
    const v = videoRef.current;
    if (!v) return;
    const limite = maxAssistidoRef.current + 1;
    if (v.currentTime > limite) {
      v.currentTime = maxAssistidoRef.current;
      posicaoAnteriorRef.current = maxAssistidoRef.current;
      setAvisoAvanco(true);
      window.setTimeout(() => setAvisoAvanco(false), 2600);
    }
  }

  function irPara(valor: number) {
    const v = videoRef.current;
    if (!v) return;
    const destino = Math.min(valor, maxAssistidoRef.current);
    if (valor > maxAssistidoRef.current + 0.5) {
      setAvisoAvanco(true);
      window.setTimeout(() => setAvisoAvanco(false), 2600);
    }
    v.currentTime = Math.max(0, destino);
    posicaoAnteriorRef.current = v.currentTime;
    setPosicao(v.currentTime);
  }

  async function alternarReproducao() {
    const v = videoRef.current;
    if (!v) return;
    setErro(false);
    setFimSemCobertura(false);
    try {
      if (v.paused) {
        await v.play();
        setIniciado(true);
      } else {
        v.pause();
      }
    } catch {
      setErro(true);
    }
  }

  function tentarNovamente() {
    const v = videoRef.current;
    setErro(false);
    setFimSemCobertura(false);
    if (!v) return;
    v.load();
    v.currentTime = Math.max(0, maxAssistidoRef.current - 1);
    v.play()
      .then(() => setIniciado(true))
      .catch(() => setErro(true));
  }

  function alternarMudo() {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMudo(v.muted);
  }

  function alterarVolume(valor: number) {
    const v = videoRef.current;
    if (!v) return;
    v.volume = valor;
    v.muted = valor === 0;
    setVolume(valor);
    setMudo(v.muted);
  }

  function alternarLegendas() {
    const v = videoRef.current;
    if (!v?.textTracks.length) return;
    const faixa = v.textTracks[0];
    if (!faixa) return;
    const ativar = faixa.mode !== "showing";
    faixa.mode = ativar ? "showing" : "disabled";
    setLegendasAtivas(ativar);
  }

  function telaCheia() {
    const alvo = containerRef.current;
    const v = videoRef.current as
      (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    if (alvo?.requestFullscreen) {
      void alvo.requestFullscreen().catch(() => v?.webkitEnterFullscreen?.());
      return;
    }
    v?.webkitEnterFullscreen?.();
  }

  const percentual = duracao > 0 ? Math.min(100, (posicao / duracao) * 100) : 0;
  const percentualLiberado = duracao > 0 ? Math.min(100, (maxAssistido / duracao) * 100) : 0;
  const percentualCobertura = concluido ? 100 : Math.round(Math.min(1, cobertura) * 100);
  const botao =
    "flex h-9 w-9 items-center justify-center rounded-full text-white/85 transition-colors hover:bg-white/15 hover:text-white";

  return (
    <div className="sobre-escuro w-full">
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-2xl bg-navy-deep shadow-[0_24px_60px_-30px_rgba(4,16,32,0.85)] ring-1 ring-white/10"
      >
        <div
          className="relative w-full max-w-full"
          style={{ aspectRatio: String(videoConvite.proporcao) }}
        >
          <video
            ref={videoRef}
            src={src}
            poster={poster || undefined}
            playsInline
            preload="metadata"
            className="h-full w-full bg-navy-deep object-contain"
            onLoadedMetadata={(e) => {
              const d = e.currentTarget.duration;
              if (Number.isFinite(d)) {
                setDuracao(d);
                onDuracao?.(Math.max(1, Math.floor(d)));
              }
              const faixa = e.currentTarget.textTracks[0];
              if (faixa) faixa.mode = "disabled";
            }}
            onTimeUpdate={handleTimeUpdate}
            onSeeking={handleSeeking}
            onPlay={() => {
              setTocando(true);
              setIniciado(true);
              setCarregando(false);
            }}
            onPause={() => setTocando(false)}
            onWaiting={() => setCarregando(true)}
            onPlaying={() => setCarregando(false)}
            onEnded={() => {
              setTocando(false);
              enviarPendentes();
              if (!concluidoRef.current) setFimSemCobertura(true);
            }}
            onError={() => {
              setErro(true);
              setTocando(false);
            }}
          >
            {legendaSrc && (
              <track
                kind="subtitles"
                src={legendaSrc}
                srcLang={videoConvite.legendas.idioma}
                label={videoConvite.legendas.rotulo}
              />
            )}
          </video>

          {/* Capa: usa a imagem cadastrada ou a identidade do evento */}
          {!iniciado && !erro && (
            <button
              type="button"
              onClick={alternarReproducao}
              className="group absolute inset-0 flex flex-col items-center justify-center text-center text-white"
              aria-label="Reproduzir o convite"
            >
              <span
                className="absolute inset-0"
                style={{
                  background: poster
                    ? "linear-gradient(to top, color-mix(in oklab, var(--navy-deep) 88%, transparent), color-mix(in oklab, var(--navy-deep) 30%, transparent))"
                    : "radial-gradient(120% 95% at 50% 0%, color-mix(in oklab, var(--navy-soft) 90%, transparent) 0%, var(--navy-deep) 68%)",
                }}
                aria-hidden="true"
              />
              <span className="relative flex flex-col items-center px-6">
                {!poster && (
                  <>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.34em] text-gold">
                      Convite em vídeo
                    </span>
                    <span className="mt-3 font-display text-2xl leading-tight text-white sm:text-3xl">
                      {evento.nome}
                    </span>
                    <span className="mt-3 h-px w-12 bg-gold/70" aria-hidden="true" />
                  </>
                )}
                <span className="mt-6 flex h-16 w-16 items-center justify-center rounded-full bg-white text-navy shadow-lg transition-transform duration-200 group-hover:scale-105 sm:h-[4.5rem] sm:w-[4.5rem]">
                  <span className="ml-1 h-6 w-6">
                    <IconePlay />
                  </span>
                </span>
                <span className="mt-4 text-sm font-medium text-white/90">Assistir ao convite</span>
              </span>
            </button>
          )}

          {carregando && iniciado && !erro && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="h-10 w-10 animate-spin rounded-full border-2 border-white/35 border-t-white" />
            </div>
          )}

          {erro && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-navy-deep/95 px-6 text-center text-white">
              <p className="max-w-xs text-sm leading-relaxed sm:text-base">
                Não foi possível carregar o vídeo do convite.
              </p>
              <button
                type="button"
                onClick={tentarNovamente}
                className="rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-navy transition-opacity hover:opacity-90"
              >
                Tentar novamente
              </button>
            </div>
          )}

          {avisoAvanco && (
            <p className="pointer-events-none absolute inset-x-4 bottom-28 mx-auto max-w-xs rounded-full bg-navy-deep/90 px-4 py-2 text-center text-xs text-white">
              Você pode rever trechos, mas não adiantar o convite.
            </p>
          )}

          {/* Controles sobre o vídeo */}
          {iniciado && !erro && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-navy-deep/95 via-navy-deep/70 to-transparent px-3 pb-2.5 pt-8 sm:px-4">
              <div className="relative h-5">
                <span className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-white/20">
                  <span
                    className="absolute inset-y-0 left-0 bg-white/35"
                    style={{ width: `${percentualLiberado}%` }}
                  />
                  <span
                    className="absolute inset-y-0 left-0 bg-gold"
                    style={{ width: `${percentual}%` }}
                  />
                </span>
                <label className="sr-only" htmlFor="barra-convite">
                  Posição do vídeo
                </label>
                <input
                  id="barra-convite"
                  type="range"
                  min={0}
                  max={Math.max(1, duracao)}
                  step={0.1}
                  value={posicao}
                  onChange={(e) => irPara(Number(e.target.value))}
                  className="absolute inset-0 h-5 w-full cursor-pointer appearance-none bg-transparent [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                  aria-valuetext={`${tempo(posicao)} de ${tempo(duracao)}`}
                />
              </div>

              <div className="mt-1 flex items-center gap-1">
                <button
                  type="button"
                  onClick={alternarReproducao}
                  className={botao}
                  aria-label={tocando ? "Pausar" : "Reproduzir"}
                >
                  <span className="h-4.5 w-4.5">{tocando ? <IconePausa /> : <IconePlay />}</span>
                </button>

                <span className="px-1 text-xs tabular-nums text-white/80">
                  {tempo(posicao)} / {tempo(duracao)}
                </span>

                <span className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={alternarMudo}
                    className={botao}
                    aria-label={mudo ? "Ativar o som" : "Desativar o som"}
                  >
                    <span className="h-4.5 w-4.5">
                      <IconeSom mudo={mudo} />
                    </span>
                  </button>
                  <label className="sr-only" htmlFor="volume-convite">
                    Volume
                  </label>
                  <input
                    id="volume-convite"
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={mudo ? 0 : volume}
                    onChange={(e) => alterarVolume(Number(e.target.value))}
                    className="hidden h-1.5 w-20 cursor-pointer appearance-none rounded-full bg-white/25 sm:block [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                  />

                  {legendaSrc && (
                    <button
                      type="button"
                      onClick={alternarLegendas}
                      aria-pressed={legendasAtivas}
                      className={`${botao} w-auto px-2.5 text-[11px] font-semibold ${
                        legendasAtivas ? "bg-white/20 text-white" : ""
                      }`}
                    >
                      CC
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={telaCheia}
                    className={botao}
                    aria-label="Tela cheia"
                  >
                    <span className="h-4.5 w-4.5">
                      <IconeTelaCheia />
                    </span>
                  </button>
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Progresso do convite */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-white/70">
          <span>{concluido ? "Convite assistido" : "Progresso do convite"}</span>
          <span className="tabular-nums">{percentualCobertura}%</span>
        </div>
        <div
          className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/15"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percentualCobertura}
          aria-label="Progresso do convite"
        >
          <div
            className="h-full rounded-full bg-gold transition-[width] duration-500"
            style={{ width: `${percentualCobertura}%` }}
          />
        </div>
        {fimSemCobertura && !concluido && (
          <p className="mt-3 text-sm leading-relaxed text-white/75">
            Ainda faltam alguns trechos do convite. Volte na barra e assista às partes que passaram
            sem reprodução.
          </p>
        )}
      </div>
    </div>
  );
}
