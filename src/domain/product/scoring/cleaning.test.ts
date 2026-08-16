/* §6 — "Antes de evaluar: limpiar la lista".
 *
 * Todo lo de acá pasa antes del primer número, y es donde el motor más se
 * rompe con datos reales: OCR sin comas, sub-listas anidadas, certificaciones
 * mezcladas con ingredientes, advertencias de alérgenos pegadas al final.
 */
import { describe, expect, it } from 'vitest';
import { cleanIngredientList } from './cleaning';
import { resolvesToSomething } from './index';

const resolves = resolvesToSomething;
const clean = (t: string) => cleanIngredientList(t, resolves);
const names = (t: string) => clean(t).items.map((i) => i.raw);

describe('§6.1 — advertencias de alérgenos', () => {
  it('saca todo lo que sigue a "puede contener"', () => {
    const c = clean('harina de trigo, azúcar. Puede contener trazas de maní y nueces');
    expect(names('harina de trigo, azúcar. Puede contener trazas de maní y nueces')).toEqual([
      'harina de trigo', 'azúcar',
    ]);
    expect(c.allergenWarnings[0]).toContain('maní');
  });

  it('cubre las otras formas del rotulado argentino', () => {
    for (const frase of [
      'contiene trazas de soja',
      'trazas de leche',
      'elaborado en una planta que procesa huevo',
      'producido en instalaciones que manipulan frutos secos',
      'Alérgenos: leche, soja',
    ]) {
      const c = clean(`agua, sal. ${frase}`);
      expect(c.items.map((i) => i.raw)).toEqual(['agua', 'sal']);
      expect(c.allergenWarnings).toHaveLength(1);
    }
  });

  it('la traza no entra al listado ni puede anular nada', () => {
    expect(names('agua, sal, trazas de aceite parcialmente hidrogenado')).toEqual(['agua', 'sal']);
  });
});

describe('§6.5 — aplanar los paréntesis', () => {
  // El ejemplo textual del documento.
  it('reproduce el ejemplo de §6.5 con su numeración', () => {
    const c = clean(
      'harina de trigo, cobertura de chocolate (azúcar, cacao, manteca de cacao, lecitina de soja), relleno (jarabe de glucosa, azúcar), azúcar, sal',
    );
    expect(c.items.map((i) => `${i.position}:${i.raw}`)).toEqual([
      '1:harina de trigo',
      '2:azúcar',
      '3:cacao',
      '4:manteca de cacao',
      '5:lecitina de soja',
      '6:jarabe de glucosa',
      '7:sal',
    ]);
  });

  it('el contenedor cede ante la sustancia concreta', () => {
    expect(names('agua, emulsionante (lecitina de soja), colorante (E150d), sal')).toEqual([
      'agua', 'lecitina de soja', 'E150d', 'sal',
    ]);
  });

  it('pero una aclaración de etiqueta no se lleva puesto al ingrediente', () => {
    expect(names('leche entera (origen Argentina), sal')).toEqual(['leche entera', 'sal']);
  });

  it('un paréntesis sin cerrar no pierde el contenido', () => {
    expect(names('harina de trigo (enriquecida por ley, sulfato ferroso')).toContain('sulfato ferroso');
  });
});

describe('§6.5 — un ingrediente repetido cuenta una vez, en su mejor posición', () => {
  it('descarta la repetición', () => {
    const c = clean('azúcar, cacao, azúcar, sal');
    expect(c.items.map((i) => i.raw)).toEqual(['azúcar', 'cacao', 'sal']);
    expect(c.items[0].position).toBe(1);
  });

  it('conserva el porcentaje aunque venga en la repetición', () => {
    const c = clean('azúcar, cacao, azúcar 60%');
    expect(c.items[0].percent).toBe(60);
  });
});

describe('§4.7 — certificaciones', () => {
  it('no son ingredientes', () => {
    const c = clean('Sin TACC, harina de trigo, Vegano, Kosher, sal');
    expect(c.items.map((i) => i.raw)).toEqual(['harina de trigo', 'sal']);
    expect(c.certificationsRemoved).toContain('Sin TACC');
  });

  it('si no queda nada, no queda nada', () => {
    const c = clean('Sin TACC, Kosher, Vegano, Sin azúcar agregada');
    expect(c.items).toHaveLength(0);
    expect(c.certificationsRemoved).toHaveLength(4);
  });
});

describe('§6.3 — normalizar', () => {
  it('acepta coma, punto y coma, salto de línea, dos puntos y guion suelto', () => {
    expect(names('agua, sal; azúcar\ncacao: canela - pimienta')).toEqual([
      'agua', 'sal', 'azúcar', 'cacao', 'canela', 'pimienta',
    ]);
  });

  it('no parte los decimales ni los nombres con guion interno', () => {
    expect(names('harina de trigo, sal 0.5 g, mono-y-diglicéridos')).toEqual([
      'harina de trigo', 'sal 0.5 g', 'mono-y-diglicéridos',
    ]);
  });

  it('encuentra el "Ingredientes:" después de un preámbulo de marketing largo', () => {
    const pitusas =
      'GALLETITAS DULCES CON SABOR A VAINILLA RELLENAS CON CREMA ARTIFICIAL\r\n' +
      'CON SABOR A LIMON. Ingredientes: Harina de trigo O000 enriquecida por ley 25630, sal';
    expect(names(pitusas)).toEqual(['Harina de trigo O000 enriquecida por ley 25630', 'sal']);
  });

  it('recorta el fragmento larguísimo en vez de descartarlo', () => {
    const corrido = `harina de trigo ${'x'.repeat(200)}`;
    const items = clean(corrido).items;
    expect(items).toHaveLength(1);
    expect(items[0].raw.startsWith('harina de trigo')).toBe(true);
  });

  it('un código de aditivo corto no se cae de la lista', () => {
    expect(names('agua, E110, E471, sal')).toEqual(['agua', 'E110', 'E471', 'sal']);
  });

  it('saca el porcentaje del nombre pero lo guarda', () => {
    const c = clean('cacao 70%, azúcar');
    expect(c.items[0].raw).toBe('cacao');
    expect(c.items[0].percent).toBe(70);
  });
});

describe('§6.4 — resolver "y/o"', () => {
  it('registra las alternativas en un solo ingrediente', () => {
    const c = clean('aceite de girasol y/o soja, sal');
    expect(c.items).toHaveLength(2);
    expect(c.items[0].alternatives).toEqual(['aceite de girasol', 'soja']);
  });
});
