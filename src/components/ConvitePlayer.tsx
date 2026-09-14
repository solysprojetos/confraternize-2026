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

const IconePlay = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-full w-full fill-current">
    <path d="M8 5.14v13.72L19 12z" />
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

/** Filete dourado de um pixel em volta da peça central. */
function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-gold-deep/55 bg-navy-deep p-2 shadow-[0_20px_50px_-35px_rgba(16,36,64,0.6)] sm:p-2">
      <div className="relative overflow-hidden bg-navy-deep">{children}</div>
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

  const [iniciado, setIniciado] = useState(false);
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

  const percentualLiberado = duracao > 0 ? Math.min(100, (maxAssistido / duracao) * 100) : 0;
  const botao =
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/85 transition-colors hover:bg-white/15 hover:text-white";

  return (
    <div className="sobre-escuro w-full">
      <div className="relative w-full border border-gold-deep/55 bg-navy-deep p-2 shadow-[0_20px_50px_-35px_rgba(16,36,64,0.6)] sm:p-2">
        <div className="quadro-convite @container relative overflow-hidden bg-navy-deep">
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

            {/* Nada na frente do convite: o vídeo aparece como é e só
                espera o play. O disco escuro atrás do triângulo garante que
                o botão continue visível sobre qualquer quadro. */}
            {!erro && (
              <button
                type="button"
                onClick={alternarReproducao}
                className="group absolute inset-0 flex items-center justify-center"
                aria-label={tocando ? "Pausar o convite" : "Reproduzir o convite"}
              >
                {!tocando && (
                  <span className="flex h-16 w-16 items-center justify-center rounded-full border border-gold/70 bg-navy-deep/60 text-gold shadow-[0_6px_24px_-8px_rgba(0,0,0,0.7)] transition-colors duration-300 group-hover:border-gold group-hover:bg-gold group-hover:text-navy-deep sm:h-[72px] sm:w-[72px]">
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
                className="pointer-events-none absolute inset-x-4 bottom-24 mx-auto max-w-xs border border-white/20 bg-navy-deep/95 px-4 py-2 text-center text-xs text-white"
              >
                Você pode rever trechos, mas não adiantar o convite.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Embaixo do vídeo, só o volume. O play e a pausa são o próprio
          convite: toca-se nele. */}
      <div className="px-2 pb-2.5 pt-2">
        {!erro && (
          <div className="flex items-center justify-end gap-1">
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
              className="h-1.5 w-16 cursor-pointer appearance-none rounded-full bg-white/25 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
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
          </div>
        )}

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
