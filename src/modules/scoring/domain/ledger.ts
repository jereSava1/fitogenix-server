// El libro de la cuenta: inmutable, y la única forma de mover el puntaje es un método que
// registra el paso. Así el desglose no puede desincronizarse del resultado.

import type { ScoreStep, ScoreStepKind } from './types';

/** El rango del puntaje (enteros, ver `clampScore`). Lo usa también `bands.ts`. */
export const MIN_SCORE = 0;
export const MAX_SCORE = 100;

/** Los datos de una fila, sin el `running` — eso lo calcula el libro. */
interface StepInput {
  readonly kind: ScoreStepKind;
  readonly label: string;
  readonly detail?: string;
}

export class ScoreLedger {
  private constructor(
    readonly score: number,
    readonly steps: readonly ScoreStep[],
  ) {}

  /** Abre el libro fijando el punto de partida (§2 Paso 1). */
  static openAt(value: number, step: StepInput): ScoreLedger {
    return new ScoreLedger(value, [{ ...step, delta: null, running: value }]);
  }

  /** Suma o resta y registra (`delta` es lo que ve el usuario). Un 0 no agrega fila. */
  add(delta: number, step: StepInput): ScoreLedger {
    if (delta === 0) return this;
    const running = this.score + delta;
    return new ScoreLedger(running, [...this.steps, { ...step, delta, running }]);
  }

  /** Fija un valor y registra: ancla, techo o anulación reemplazan la cuenta. */
  setTo(value: number, step: StepInput): ScoreLedger {
    return new ScoreLedger(value, [...this.steps, { ...step, delta: null, running: value }]);
  }

  /** Aplica un techo. Si ya venía por debajo, no registra nada. */
  capAt(value: number, reason: string): ScoreLedger {
    if (this.score <= value) return this;
    return this.setTo(value, { kind: 'techo', label: `Techo ${value}`, detail: reason });
  }

  /** Baja hasta `floor` como mucho, nunca sube (modificador nutricional). Si ya venía por
   *  debajo del piso, no lo toca. */
  addBounded(delta: number, floor: number, step: StepInput): ScoreLedger {
    if (delta >= 0) return this;
    const target = Math.max(Math.min(this.score, floor), this.score + delta);
    return this.add(target - this.score, step);
  }

  /** §2 Paso 5 — Acotar. Siempre es la última fila del libro. */
  close(label = 'Resultado final'): ScoreLedger {
    const final = clampScore(this.score);
    return new ScoreLedger(final, [
      ...this.steps,
      { kind: 'clamp', label, delta: null, running: final },
    ]);
  }
}

/** Redondea y acota al rango del documento. */
export function clampScore(value: number): number {
  return Math.max(MIN_SCORE, Math.min(MAX_SCORE, Math.round(value)));
}
