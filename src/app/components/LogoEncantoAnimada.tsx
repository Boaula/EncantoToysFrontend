import { useMemo, type CSSProperties } from "react";

import texto from "../../assets/LogoEncantoToys/texto.png";
import foguete from "../../assets/LogoEncantoToys/foguete.png";
import chama from "../../assets/LogoEncantoToys/chama.png";
import rastro from "../../assets/LogoEncantoToys/rastro.png";
import particulas from "../../assets/LogoEncantoToys/particulas.png";

import { LogoAnimator } from "../../models/LogoAnimator";

interface LogoEncantoAnimadaProps {
  largura?: number;
  className?: string;
}

export function LogoEncantoAnimada({
  largura = 256,
  className = "",
}: LogoEncantoAnimadaProps) {
  const animator = useMemo(
    () =>
      new LogoAnimator({
        floatingDistance: 2,
        floatingDuration: 2200,

        flameScaleMin: 0.97,
        flameScaleMax: 1.05,
        flameDuration: 650,

        trailOpacityMin: 0.55,
        trailOpacityMax: 1,
        trailDuration: 1300,

        particlesOpacityMin: 0.2,
        particlesOpacityMax: 0.9,
        particlesDuration: 1500,
      }),
    []
  );

  /*
   * Todas as imagens possuem canvas 800 x 400.
   *
   * Portanto:
   *
   * 800 / 400 = 2
   *
   * Se largura = 256:
   * altura = 128
   */
  const altura = largura / 2;

  const animationVariables =
    animator.createCSSVariables() as CSSProperties;

  return (
    <>
      <div
        className={`logo-encanto-animada ${className}`}
        role="img"
        aria-label="Logo Encanto Toys"
        style={{
          width: `${largura}px`,
          height: `${altura}px`,
          position: "relative",
          flexShrink: 0,
          overflow: "visible",
          background: "transparent",
          ...animationVariables,
        }}
      >
        {/* =====================================================
            RASTRO
            ===================================================== */}

        <img
          src={rastro}
          alt=""
          draggable={false}
          className="logo-camada logo-rastro"
        />

        {/* =====================================================
            PARTÍCULAS
            ===================================================== */}

        <img
          src={particulas}
          alt=""
          draggable={false}
          className="logo-camada logo-particulas"
        />

        {/* =====================================================
            CHAMA
            ===================================================== */}

        <img
          src={chama}
          alt=""
          draggable={false}
          className="logo-camada logo-chama"
        />

        {/* =====================================================
            FOGUETE
            ===================================================== */}

        <img
          src={foguete}
          alt=""
          draggable={false}
          className="logo-camada logo-foguete"
        />

        {/* =====================================================
            TEXTO
            Fica completamente parado.
            ===================================================== */}

        <img
          src={texto}
          alt=""
          draggable={false}
          className="logo-camada logo-texto"
        />
      </div>

      <style>{`
        /* =====================================================
           CONFIGURAÇÃO GERAL DAS CAMADAS
           ===================================================== */

        .logo-encanto-animada {
          isolation: isolate;
        }

        .logo-encanto-animada .logo-camada {
          position: absolute;

          top: 0;
          left: 0;

          width: 100%;
          height: 100%;

          object-fit: contain;

          pointer-events: none;
          user-select: none;

          transform-origin: center center;
        }


        /* =====================================================
           TEXTO
           
           Absolutamente estático.
           Sem glow.
           Sem movimento.
           ===================================================== */

        .logo-encanto-animada .logo-texto {
          z-index: 5;

          animation: none;

          filter: none;

          transform: none;
        }


        /* =====================================================
           FOGUETE
           
           Movimento extremamente suave.
           Não aplicamos glow nele.
           ===================================================== */

        .logo-encanto-animada .logo-foguete {
          z-index: 4;

          animation:
            encanto-foguete-flutuar
            var(--logo-floating-duration)
            ease-in-out
            infinite;
        }


        /* =====================================================
           CHAMA
           
           Pequena pulsação.
           O glow já pode estar presente no PNG.
           ===================================================== */

            .logo-encanto-animada .logo-chama {
            z-index: 3;

            transform-origin: center center;

            filter:
                drop-shadow(0 0 4px rgba(255, 120, 0, 0.85))
                drop-shadow(0 0 8px rgba(255, 170, 0, 0.65))
                drop-shadow(0 0 14px rgba(255, 210, 80, 0.35));

            animation:
                encanto-chama-pulsar
                var(--logo-flame-duration)
                ease-in-out
                infinite;
            }


        /* =====================================================
           RASTRO
           ===================================================== */

        .logo-encanto-animada .logo-rastro {
          z-index: 1;

          animation:
            encanto-rastro
            var(--logo-trail-duration)
            ease-in-out
            infinite;
        }


        /* =====================================================
           PARTÍCULAS
           ===================================================== */

        .logo-encanto-animada .logo-particulas {
          z-index: 2;

          animation:
            encanto-particulas
            var(--logo-particles-duration)
            ease-in-out
            infinite;
        }


        /* =====================================================
           ANIMAÇÃO DO FOGUETE
           
           Apenas 2px por padrão.
           ===================================================== */

        @keyframes encanto-foguete-flutuar {
          0%,
          100% {
            transform:
              translateY(0)
              rotate(0deg);
          }

          50% {
            transform:
              translateY(
                calc(
                  var(--logo-floating-distance) * -1
                )
              )
              rotate(-0.4deg);
          }
        }


        /* =====================================================
           ANIMAÇÃO DA CHAMA
           ===================================================== */

        @keyframes encanto-chama-pulsar {
        0%,
        100% {
            transform: scale(var(--logo-flame-scale-min));

            opacity: 0.88;

            filter:
            drop-shadow(0 0 3px rgba(255, 100, 0, 0.75))
            drop-shadow(0 0 7px rgba(255, 150, 0, 0.50))
            drop-shadow(0 0 10px rgba(255, 210, 80, 0.25));
        }

        50% {
            transform: scale(var(--logo-flame-scale-max));

            opacity: 1;

            filter:
            drop-shadow(0 0 5px rgba(255, 100, 0, 1))
            drop-shadow(0 0 11px rgba(255, 165, 0, 0.80))
            drop-shadow(0 0 18px rgba(255, 220, 80, 0.45));
        }
        }


        /* =====================================================
           ANIMAÇÃO DO RASTRO
           ===================================================== */

        @keyframes encanto-rastro {
          0%,
          100% {
            opacity:
              var(
                --logo-trail-opacity-min
              );
          }

          50% {
            opacity:
              var(
                --logo-trail-opacity-max
              );
          }
        }


        /* =====================================================
           ANIMAÇÃO DAS PARTÍCULAS
           ===================================================== */

        @keyframes encanto-particulas {
          0% {
            opacity:
              var(
                --logo-particles-opacity-min
              );

            transform:
              translate(0, 1px)
              scale(0.98);
          }

          50% {
            opacity:
              var(
                --logo-particles-opacity-max
              );

            transform:
              translate(-1px, -1px)
              scale(1.02);
          }

          100% {
            opacity:
              var(
                --logo-particles-opacity-min
              );

            transform:
              translate(1px, 0)
              scale(0.98);
          }
        }


        /* =====================================================
           ACESSIBILIDADE
           
           Se o sistema operacional estiver configurado
           para reduzir movimentos, desativa animações.
           ===================================================== */

        @media (prefers-reduced-motion: reduce) {
          .logo-encanto-animada .logo-camada {
            animation: none !important;
          }
        }
      `}</style>
    </>
  );
}