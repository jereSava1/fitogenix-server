import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// config.ts se evalúa una sola vez al importarse: seteamos TODAS las env vars
// (las required del server + las de Edamam) antes del import dinámico.
type EdamamModule = typeof import('./fallbackFoodApi');
let fetchEdamamByBarcode: EdamamModule['fetchEdamamByBarcode'];

function stubFetchJson(body: unknown, ok = true, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok,
      status,
      json: async () => body,
    })),
  );
}

beforeAll(async () => {
  process.env.ANTHROPIC_API_KEY = 'test';
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test';
  process.env.SERPAPI_API_KEY = 'test';
  process.env.EDAMAM_APP_ID = 'app-id';
  process.env.EDAMAM_APP_KEY = 'app-key';
  ({ fetchEdamamByBarcode } = await import('./fallbackFoodApi'));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const edamamHit = {
  hints: [
    {
      food: {
        foodId: 'food_abc',
        label: 'Oreo Cookies',
        brand: 'Mondelez',
        category: 'Packaged foods',
        image: 'https://img/oreo.jpg',
        nutrients: {
          ENERC_KCAL: 467,
          PROCNT: 5,
          FAT: 17,
          FASAT: 8,
          FATRN: 0.1,
          CHOCDF: 69,
          SUGAR: 38,
          FIBTG: 4,
          NA: 400, // mg
          CHOLE: 10, // mg
        },
      },
    },
  ],
};

describe('fallbackFoodApi — fetchEdamamByBarcode', () => {
  it('adapta la respuesta de Edamam a RawOFFProduct con nutriments estilo OFF', async () => {
    stubFetchJson(edamamHit);

    const result = await fetchEdamamByBarcode('7622210449283');

    expect(result).not.toBeNull();
    expect(result?.product_name).toBe('Oreo Cookies');
    expect(result?.brands).toBe('Mondelez');
    expect(result?.image_url).toBe('https://img/oreo.jpg');
    expect(result?.categories).toBe('Packaged foods');

    const n = result?.nutriments ?? {};
    expect(n['energy-kcal_100g']).toBe(467);
    expect(n['proteins_100g']).toBe(5);
    expect(n['saturated-fat_100g']).toBe(8);
    expect(n['trans-fat_100g']).toBe(0.1);
    expect(n['sugars_100g']).toBe(38);
    expect(n['fiber_100g']).toBe(4);
    // mg → g (ftgEngine espera sodio/colesterol en g y multiplica x1000).
    expect(n['sodium_100g']).toBe(0.4);
    expect(n['cholesterol_100g']).toBe(0.01);
  });

  it('usa `parsed` cuando está presente (match directo)', async () => {
    stubFetchJson({ parsed: edamamHit.hints, hints: [] });
    const result = await fetchEdamamByBarcode('7622210449283');
    expect(result?.product_name).toBe('Oreo Cookies');
  });

  it('devuelve null cuando no hay hints ni parsed', async () => {
    stubFetchJson({ hints: [] });
    expect(await fetchEdamamByBarcode('7622210449283')).toBeNull();
  });

  it('devuelve null (sin lanzar) ante barcode inválido', async () => {
    expect(await fetchEdamamByBarcode('nope')).toBeNull();
  });

  it('devuelve null y loguea si la API responde !ok (p.ej. 401)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    stubFetchJson({}, false, 401);
    expect(await fetchEdamamByBarcode('7622210449283')).toBeNull();
    expect(errSpy).toHaveBeenCalled();
  });

  it('devuelve null y loguea si fetch lanza', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('timeout');
      }),
    );
    expect(await fetchEdamamByBarcode('7622210449283')).toBeNull();
    expect(errSpy).toHaveBeenCalled();
  });
});

describe('fallbackFoodApi — sin keys de Edamam', () => {
  it('saltea el nivel (loguea y devuelve null) cuando faltan las keys', async () => {
    // Reimportamos el módulo con las env vars borradas para forzar config sin keys.
    vi.resetModules();
    delete process.env.EDAMAM_APP_ID;
    delete process.env.EDAMAM_APP_KEY;
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const mod = await import('./fallbackFoodApi');
    const result = await mod.fetchEdamamByBarcode('7622210449283');

    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalled();

    // Restauramos para no contaminar otros tests.
    process.env.EDAMAM_APP_ID = 'app-id';
    process.env.EDAMAM_APP_KEY = 'app-key';
    vi.resetModules();
  });
});
