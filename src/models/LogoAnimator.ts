export interface LogoAnimationConfig {
  floatingDistance: number;
  floatingDuration: number;

  flameScaleMin: number;
  flameScaleMax: number;
  flameDuration: number;

  glowMin: number;
  glowMax: number;
  glowDuration: number;

  trailOpacityMin: number;
  trailOpacityMax: number;
  trailDuration: number;

  particlesOpacityMin: number;
  particlesOpacityMax: number;
  particlesDuration: number;
}

export type LogoAnimationVariables = Record<string, string | number>;

export class LogoAnimator {
  private config: LogoAnimationConfig;

  constructor(config?: Partial<LogoAnimationConfig>) {
    this.config = {
      floatingDistance: 2,
      floatingDuration: 2200,

      flameScaleMin: 0.96,
      flameScaleMax: 1.08,
      flameDuration: 550,

      glowMin: 4,
      glowMax: 10,
      glowDuration: 900,

      trailOpacityMin: 0.55,
      trailOpacityMax: 1,
      trailDuration: 1100,

      particlesOpacityMin: 0.25,
      particlesOpacityMax: 0.95,
      particlesDuration: 1200,

      ...config,
    };
  }

  public getConfig(): Readonly<LogoAnimationConfig> {
    return {
      ...this.config,
    };
  }

  public setFloatingDistance(value: number): void {
    this.config.floatingDistance = value;
  }

  public setFloatingDuration(value: number): void {
    this.config.floatingDuration = value;
  }

  public setFlameDuration(value: number): void {
    this.config.flameDuration = value;
  }

  public setGlowDuration(value: number): void {
    this.config.glowDuration = value;
  }

  public setTrailDuration(value: number): void {
    this.config.trailDuration = value;
  }

  public setParticlesDuration(value: number): void {
    this.config.particlesDuration = value;
  }

  public createCSSVariables(): LogoAnimationVariables {
    return {
      "--logo-floating-distance":
        `${this.config.floatingDistance}px`,

      "--logo-floating-duration":
        `${this.config.floatingDuration}ms`,

      "--logo-flame-scale-min":
        this.config.flameScaleMin,

      "--logo-flame-scale-max":
        this.config.flameScaleMax,

      "--logo-flame-duration":
        `${this.config.flameDuration}ms`,

      "--logo-glow-min":
        `${this.config.glowMin}px`,

      "--logo-glow-max":
        `${this.config.glowMax}px`,

      "--logo-glow-duration":
        `${this.config.glowDuration}ms`,

      "--logo-trail-opacity-min":
        this.config.trailOpacityMin,

      "--logo-trail-opacity-max":
        this.config.trailOpacityMax,

      "--logo-trail-duration":
        `${this.config.trailDuration}ms`,

      "--logo-particles-opacity-min":
        this.config.particlesOpacityMin,

      "--logo-particles-opacity-max":
        this.config.particlesOpacityMax,

      "--logo-particles-duration":
        `${this.config.particlesDuration}ms`,
    };
  }
}