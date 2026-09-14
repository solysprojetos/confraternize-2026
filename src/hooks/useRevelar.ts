import { useEffect } from "react";

/**
 * Revela ao rolar: marca com data-visivel os elementos que têm a classe
 * "revelar" assim que eles entram na tela. Quem prefere movimento reduzido
 * recebe tudo já visível.
 */
export function useRevelar(dependencia?: unknown) {
  useEffect(() => {
    const alvos = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".revelar:not([data-visivel]), .filete:not([data-visivel])",
      ),
    );
    if (alvos.length === 0) return;

    const semMovimento =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (semMovimento || typeof IntersectionObserver === "undefined") {
      for (const alvo of alvos) alvo.dataset["visivel"] = "true";
      return;
    }

    const observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (!entrada.isIntersecting) continue;
          (entrada.target as HTMLElement).dataset["visivel"] = "true";
          observador.unobserve(entrada.target);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );

    for (const alvo of alvos) observador.observe(alvo);
    return () => observador.disconnect();
  }, [dependencia]);
}
