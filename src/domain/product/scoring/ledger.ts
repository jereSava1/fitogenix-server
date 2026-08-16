/* ═══════════════════════════════════════════════════════════
   FITOGENIX — El libro de la cuenta

   La regla 1 del documento dice que todo puntaje tiene que ser reconstruible:
   "el usuario tiene que poder seguir la resta". Antes eso era una convención
   —había que acordarse de empujar un paso cada vez que se tocaba el número— y
   una convención se rompe el día que alguien agrega un `score -= 3` apurado.

   Acá deja de ser una convención. `ScoreLedger` es inmutable y la ÚNICA forma
   de mover el puntaje es un método que además registra el paso. No se puede
   cambiar el número sin dejar la fila: el desglose no puede desincronizarse
   del resultado porque no hay camino para que eso pase.

   Cada operación devuelve un libro nuevo, así que el pipeline se lee como una
   sucesión de transformaciones y no como la mutación de una variable.
═══════════════════════════════════════════════════════════ */

import type { ScoreStep, ScoreStepKind } from './types';

const MIN_SCORE = 0;
const MAX_SCORE = 100;

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

  /**
   * Suma (o resta) y registra. `delta` es el número que el usuario va a ver a
   * la derecha de la fila.
   *
   * Un delta de 0 no ensucia el desglose: el ingrediente sin objeciones sigue
   * apareciendo en la lista de §7, pero no como una línea de la cuenta.
   */
  add(delta: number, step: StepInput): ScoreLedger {
    if (delta === 0) return this;
    const running = this.score + delta;
    return new ScoreLedger(running, [...this.steps, { ...step, delta, running }]);
  }

  /**
   * Fija un valor en vez de sumarlo, y registra. Es el caso del ancla, del
   * techo y de la anulación: no son ajustes sobre lo anterior, son un
   * veredicto que reemplaza la cuenta.
   */
  setTo(value: number, step: StepInput): ScoreLedger {
    return new ScoreLedger(value, [...this.steps, { ...step, delta: null, running: value }]);
  }

  /**
   * Aplica un techo. Si el puntaje ya venía por debajo, el techo no muerde y
   * no se registra ninguna fila: mostrar "techo 74" en un producto de 30
   * confundiría más de lo que explica.
   */
  capAt(value: number, reason: string): ScoreLedger {
    if (this.score <= value) return this;
    return this.setTo(value, { kind: 'techo', label: `Techo ${value}`, detail: reason });
  }

  /**
   * Baja el puntaje hasta `floor` como mucho, sin poder subirlo.
   *
   * Es la forma del modificador nutricional: el panel es un signo de apoyo, no
   * el motor, así que puede empeorar el resultado pero no mejorarlo, y no
   * puede meterse en la banda que el documento reserva para las anulaciones.
   * Un puntaje que ya venía por debajo del piso queda intacto.
   */
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
