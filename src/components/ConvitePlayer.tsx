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

const IconeTelaCheia = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-full w-full fill-current">
    <path d="M4 9V4h5v2H6v3zm11-5h5v5h-2V6h-3zM6 15v3h3v2H4v-5zm12 0h2v5h-5v-2h3z" />
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

/** Filete dourado discreto em volta da peça central. */
function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-gold-deep/35 bg-navy-deep p-1.5 shadow-[0_20px_50px_-35px_color-mix(in_oklab,var(--navy-deep)_65%,transparent)]">
      <div className="relative overflow-hidden rounded-md bg-navy-deep">{children}</div>
    </div>
  );
}

/** Fundo da capa: papel e um clarão contido atrás do centro. */
function FundoDaCapa() {
  return (
    <>
      <span className="pointer-events-none absolute inset-0 bg-navy" aria-hidden="true" />
      <span className="textura-papel pointer-events-none absolute inset-0" aria-hidden="true" />
    </>
  );
}

/** Peça exibida enquanto o convite em vídeo ainda não foi cadastrado. */
export function ConviteEmPreparacao() {
  return (
    <div className="sobre-escuro">
      <Moldura>
        <div
          className="relative flex w-full max-w-full flex-col items-center justify-center px-6 text-center"
          style={{ aspectRatio: String(videoConvite.proporcao) }}
        >
          <FundoDaCapa />
          <span className="relative text-[10px] font-medium uppercase tracking-[0.42em] text-gold/80">
            Convite em vídeo
          </span>
          <p className="relative mt-6 font-display text-[clamp(1.5rem,4.2vw,2.6rem)] leading-[1.1] text-white/92">
            {evento.nome}
          </p>
          <span className="relative mt-6 h-px w-12 bg-gold/60 sm:w-16" aria-hidden="true" />
          <p className="relative mt-6 max-w-xs text-[13px] leading-relaxed text-white/55 sm:max-w-md sm:text-[15px]">
            O vídeo está sendo finalizado. É por ele que a confirmação de presença será aberta.
          </p>
        </div>
      </Moldura>
    </div>
  );
}

export function ConvitePlayer({ onTrechosAssistidos, onConcluir, onDuracao, concluido }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Segundos inteiros efetivamente reproduzidos (não é temporizador nem
  // posição da barra: cada bloco só entra quando o vídeo passa por ele tocando)
  const assistidosRef = useRef<Set<number>>(new Set());
  const pendentesRef = useRef<Set<number>>(new Set());
  const maxAssistidoRef = useRef(0);
  const posicaoAnteriorRef = useRef(0);
  const concluidoRef = useRef(concluido);

  const containerRef = useRef<HTMLDivElement>(null);

  const [iniciado, setIniciado] = useState(false);
  const [posicao, setPosicao] = useState(0);
  // A faixa de controles some enquanto o convite corre e volta quando a
  // pessoa mexe no vídeo.
  const [controlesVisiveis, setControlesVisiveis] = useState(true);
  const ocultarRef = useRef<number | null>(null);
  const [tocando, setTocando] = useState(false);
  const [duracao, setDuracao] = useState(0);
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

  useEffect(() => {
    return () => {
      if (ocultarRef.current) window.clearTimeout(ocultarRef.current);
    };
  }, []);

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

  function mostrarControles() {
    setControlesVisiveis(true);
    if (ocultarRef.current) window.clearTimeout(ocultarRef.current);
    ocultarRef.current = null;
    if (videoRef.current && !videoRef.current.paused) {
      ocultarRef.current = window.setTimeout(() => setControlesVisiveis(false), 2800);
    }
  }

  /** Um toque na imagem revela os controles; o seguinte pausa. */
  function tocarNaImagem() {
    if (tocando && !controlesVisiveis) {
      mostrarControles();
      return;
    }
    void alternarReproducao();
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
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/85 transition-colors hover:bg-white/15 hover:text-white";

  return (
    <div className="sobre-escuro w-full">
      <div
        ref={containerRef}
        className="moldura-convite quadro-convite @container relative w-full overflow-hidden rounded-xl bg-navy-deep shadow-[0_18px_44px_-30px_color-mix(in_oklab,var(--navy-deep)_60%,transparent)] ring-1 ring-navy-deep/10"
      >
        <div>
          <div
            className="relative w-full max-w-full"
            style={{ aspectRatio: String(videoConvite.proporcao) }}
            onPointerMove={mostrarControles}
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
                // O convite começa no volume máximo e com som
                e.currentTarget.volume = 1;
                e.currentTarget.muted = false;
                setVolume(1);
                setMudo(false);
                const faixa = e.currentTarget.textTracks[0];
                if (faixa) faixa.mode = "disabled";
              }}
              onTimeUpdate={handleTimeUpdate}
              onSeeking={handleSeeking}
              onPlay={() => {
                setTocando(true);
                setIniciado(true);
                setCarregando(false);
                setControlesVisiveis(true);
                if (ocultarRef.current) window.clearTimeout(ocultarRef.current);
                ocultarRef.current = window.setTimeout(() => setControlesVisiveis(false), 2800);
              }}
              onPause={() => {
                setTocando(false);
                if (ocultarRef.current) window.clearTimeout(ocultarRef.current);
                ocultarRef.current = null;
                setControlesVisiveis(true);
              }}
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

            {/* Botão central: some enquanto o convite corre e volta assim
                que ele é pausado. A área toda é clicável. */}
            {!erro && (
              <button
                type="button"
                onClick={tocarNaImagem}
                className="group absolute inset-0 flex items-center justify-center"
                aria-label={
                  tocando
                    ? controlesVisiveis
                      ? "Pausar o convite"
                      : "Mostrar os controles do convite"
                    : "Reproduzir o convite"
                }
              >
                {!tocando && (
                  <span className="flex h-[68px] w-[68px] items-center justify-center rounded-full bg-navy-deep/55 text-white ring-1 ring-white/25 backdrop-blur-[2px] transition-colors duration-300 group-hover:bg-navy-deep/75 group-hover:ring-gold/60 sm:h-[76px] sm:w-[76px]">
                    <span className="ml-1 h-6 w-6 sm:h-7 sm:w-7">
                      <IconePlay />
                    </span>
                  </span>
                )}
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
                  className="border border-white/70 px-6 py-2.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-white transition-colors hover:bg-white hover:text-navy-deep"
                >
                  Tentar novamente
                </button>
              </div>
            )}

            {avisoAvanco && (
              <p
                role="status"
                className="pointer-events-none absolute inset-x-4 bottom-28 mx-auto max-w-xs rounded-md border border-white/20 bg-navy-deep/95 px-4 py-2 text-center text-xs text-white"
              >
                Você pode rever trechos, mas não adiantar o convite.
              </p>
            )}

            {/* Faixa discreta sobre a parte de baixo do vídeo. Só entra
                depois do play, para não repetir o botão central, e daí em
                diante fica sempre visível. */}
            {iniciado && !erro && (
              <div
                onFocusCapture={mostrarControles}
                className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-navy-deep/90 via-navy-deep/55 to-transparent px-2.5 pb-1.5 pt-10 transition-opacity duration-300 ${
                  controlesVisiveis ? "opacity-100" : "pointer-events-none opacity-0"
                }`}
              >
                <div className="relative h-6">
                  <span className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/25">
                    <span
                      className="absolute inset-y-0 left-0 bg-white/30"
                      style={{ width: `${percentualLiberado}%` }}
                    />
                    <span
                      className="absolute inset-y-0 left-0 bg-gold"
                      style={{ width: `${percentual}%` }}
                    />
                  </span>
                  <label className="sr-only" htmlFor="barra-convite">
                    Posição do convite
                  </label>
                  <input
                    id="barra-convite"
                    type="range"
                    min={0}
                    max={Math.max(1, duracao)}
                    step={0.1}
                    value={posicao}
                    onChange={(e) => irPara(Number(e.target.value))}
                    className="absolute inset-0 h-6 w-full cursor-pointer appearance-none bg-transparent [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                    aria-valuetext={`${tempo(posicao)} de ${tempo(duracao)}`}
                  />
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={alternarReproducao}
                    className={botao}
                    aria-label={tocando ? "Pausar" : "Reproduzir"}
                  >
                    <span className="h-4 w-4">{tocando ? <IconePausa /> : <IconePlay />}</span>
                  </button>

                  <span className="px-1 text-[11px] tabular-nums text-white/80">
                    {tempo(posicao)} / {tempo(duracao)}
                  </span>

                  <span className="ml-auto flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={alternarMudo}
                      className={botao}
                      aria-label={mudo ? "Ativar o som" : "Desativar o som"}
                    >
                      <span className="h-4 w-4">
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
                      className="hidden h-1 w-14 cursor-pointer appearance-none rounded-full bg-white/30 @[20rem]:block [&::-moz-range-thumb]:h-2.5 [&::-moz-range-thumb]:w-2.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                    />

                    {legendaSrc && (
                      <button
                        type="button"
                        onClick={alternarLegendas}
                        aria-pressed={legendasAtivas}
                        className={`${botao} w-auto px-2 text-[10px] font-semibold ${
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
                      <span className="h-4 w-4">
                        <IconeTelaCheia />
                      </span>
                    </button>
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div>
        {fimSemCobertura && !concluido && (
          <div role="status" className="mt-3">
            <p className="text-sm leading-relaxed text-white/75">
              Faltaram alguns trechos do convite.
            </p>
            <button
              type="button"
              onClick={() => {
                irPara(0);
                videoRef.current?.play().catch(() => {});
              }}
              className="mt-3 flex min-h-[44px] items-center justify-center border border-gold/60 px-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-gold transition-colors hover:bg-gold hover:text-navy-deep"
            >
              Ver o convite de novo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
