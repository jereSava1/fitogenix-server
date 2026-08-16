/* El libro de la cuenta.
 *
 * La regla 1 del documento —"todo puntaje tiene que ser reconstruible"— deja
 * de ser una convención acá: si estos tests pasan, no existe un camino para
 * mover el puntaje sin dejar la fila que lo explica.
 */
import { describe, expect, it } from 'vitest';
import { ScoreLedger, clampScore } from './ledger';

const open = () => ScoreLedger.openAt(75, { kind: 'base', label: 'Punto de partida' });

/** El invariante: cada paso con delta mueve el corriente en exactamente ese
 *  delta, y el último corriente es el puntaje. */
function expectConsistent(ledger: ScoreLedger) {
  let previous: number | null = null;
  for (const step of ledger.steps) {
    if (step.delta != null && previous != null) {
      expect(previous + step.delta, `paso "${step.label}"`).toBe(step.running);
    }
    previous = step.running;
  }
  expect(ledger.steps[ledger.steps.length - 1].running).toBe(ledger.score);
}

describe('ScoreLedger', () => {
  it('abre registrando el punto de partida', () => {
    const ledger = open();
    expect(ledger.score).toBe(75);
    expect(ledger.steps).toHaveLength(1);
    expect(ledger.steps[0]).toMatchObject({ kind: 'base', delta: null, running: 75 });
  });

  it('no se puede mover el puntaje sin dejar la fila', () => {
    const ledger = open()
      .add(-13, { kind: 'ingrediente', label: 'Azúcar (posición 1)' })
      .add(-7, { kind: 'ingrediente', label: 'Aceite de palma (posición 2)' })
      .add(-10, { kind: 'procesamiento', label: 'Procesamiento' });

    expect(ledger.score).toBe(45);
    expect(ledger.steps).toHaveLength(4);
    expectConsistent(ledger);
  });

  it('un delta de 0 no ensucia el desglose', () => {
    const ledger = open().add(0, { kind: 'ingrediente', label: 'Sal (posición 3)' });
    expect(ledger.steps).toHaveLength(1);
    expect(ledger.score).toBe(75);
  });

  it('es inmutable: cada operación devuelve un libro nuevo', () => {
    const antes = open();
    const despues = antes.add(-13, { kind: 'ingrediente', label: 'Azúcar' });

    expect(antes.score).toBe(75);
    expect(antes.steps).toHaveLength(1);
    expect(despues).not.toBe(antes);
  });

  describe('techos', () => {
    it('recortan y registran cuando muerden', () => {
      const ledger = open().capAt(49, 'Cárnico curado con ascorbato.');
      expect(ledger.score).toBe(49);
      expect(ledger.steps[1]).toMatchObject({ kind: 'techo', label: 'Techo 49' });
    });

    it('no registran nada cuando el puntaje ya venía por debajo', () => {
      const bajo = open().add(-50, { kind: 'ingrediente', label: 'X' });
      const conTecho = bajo.capAt(49, 'Cárnico curado.');
      expect(conTecho.score).toBe(25);
      expect(conTecho.steps).toHaveLength(bajo.steps.length);
    });
  });

  describe('addBounded — la forma del paso nutricional', () => {
    it('baja hasta el piso, no más', () => {
      const ledger = open().addBounded(-90, 15, { kind: 'nutricion', label: 'Panel nutricional' });
      expect(ledger.score).toBe(15);
      expectConsistent(ledger);
    });

    it('no sube nunca el puntaje', () => {
      const ledger = open().addBounded(10, 15, { kind: 'nutricion', label: 'Panel nutricional' });
      expect(ledger.score).toBe(75);
      expect(ledger.steps).toHaveLength(1);
    });

    it('un puntaje que ya venía bajo no se sube al piso', () => {
      const bajo = open().add(-70, { kind: 'ingrediente', label: 'X' }); // 5
      const ledger = bajo.addBounded(-20, 15, { kind: 'nutricion', label: 'Panel' });
      expect(ledger.score).toBe(5);
    });
  });

  it('cierra acotando al rango del documento', () => {
    expect(open().add(-200, { kind: 'ingrediente', label: 'X' }).close().score).toBe(0);
    expect(open().add(200, { kind: 'procesamiento', label: 'X' }).close().score).toBe(100);

    const cerrado = open().close();
    expect(cerrado.steps[cerrado.steps.length - 1]).toMatchObject({
      kind: 'clamp',
      label: 'Resultado final',
      running: 75,
    });
  });
});

describe('clampScore', () => {
  it('redondea y acota', () => {
    expect(clampScore(74.5)).toBe(75);
    expect(clampScore(-10)).toBe(0);
    expect(clampScore(120)).toBe(100);
  });
});
