import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { ingredientCount } from '../domain/product/ftgEngine';
import type { RawOFFProduct } from '../types/fitogenix';

let _client: Anthropic | null = null;
const client = (): Anthropic => {
  if (!_client) _client = new Anthropic({ apiKey: config.anthropicApiKey });
  return _client;
};

const SYSTEM_PROMPT =
  'Sos una base de datos nutricional experta en productos alimenticios argentinos y latinoamericanos. Respondés SOLO con JSON válido, sin texto adicional. Si no tenés información del producto o no lo reconocés con certeza, respondé con {}.';

function hasKeyNuts(n?: Record<string, unknown>): boolean {
  if (!n) return false;
  const get = (k: string) => n[`${k}_100g`] ?? n[k];
  return get('energy-kcal') != null && get('proteins') != null && get('carbohydrates') != null;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function hasValidNumericField(v: unknown): v is Record<string, unknown> {
  return (
    typeof v === 'object' &&
    v !== null &&
    Object.values(v).some((x) => typeof x === 'number' && Number.isFinite(x))
  );
}

async function callClaude(prompt: string, maxTokens: number): Promise<string> {
  const msg = await client().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: maxTokens,
    temperature: 0,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: prompt }],
  });

  const block = msg.content[0];
  return block.type === 'text' ? block.text.trim().replace(/```json|```/g, '').trim() : '';
}

export async function enrichWithAI(off: RawOFFProduct): Promise<RawOFFProduct> {
  const missingIng = ingredientCount(off.ingredients_text) < 3;
  const missingNut = !hasKeyNuts(off.nutriments);
  if (!missingIng && !missingNut) return off;

  const name = [off.product_name, off.brands].filter(Boolean).join(' — ');
  if (!name.trim()) return off;

  const want: string[] = [];
  if (missingIng)
    want.push('"ingredients_text": "lista completa de ingredientes separados por coma, en español"');
  if (missingNut)
    want.push(
      '"nutriments": {"energy-kcal_100g":N,"proteins_100g":N,"carbohydrates_100g":N,"sugars_100g":N,"fat_100g":N,"saturated-fat_100g":N,"fiber_100g":N,"sodium_100g":N}',
    );

  const prompt = `Producto: "${name}"\n\nDevolvé un JSON con los siguientes campos (solo los que podés completar con precisión):\n${want.join('\n')}\n\nImportante: los valores numéricos de nutrientes son POR 100g o 100ml. No inventes datos si no conocés el producto.`;

  try {
    const raw = await callClaude(prompt, 300);
    if (!raw || raw === '{}') return off;
    const ai = JSON.parse(raw);
    if (missingIng && isNonEmptyString(ai.ingredients_text)) off.ingredients_text = ai.ingredients_text;
    if (missingNut && hasValidNumericField(ai.nutriments)) {
      off.nutriments = { ...(off.nutriments ?? {}), ...ai.nutriments };
    }
    off._aiEnriched = true;
  } catch {
    // best-effort — return whatever we had
  }

  return off;
}

export async function aiLookupProduct(query: string): Promise<RawOFFProduct | null> {
  const isBarcode = /^\d{8,14}$/.test(String(query).trim());
  const hint = isBarcode
    ? `código de barras ${query} (producto argentino o latinoamericano)`
    : `"${query}"`;

  const prompt = `Identificá el producto con ${hint} y devolvé un JSON con:\n"product_name": nombre del producto\n"brands": marca\n"ingredients_text": lista de ingredientes separados por coma\n"nova_group": número NOVA (1-4)\n"nutriments": {"energy-kcal_100g":N,"proteins_100g":N,"carbohydrates_100g":N,"sugars_100g":N,"fat_100g":N,"saturated-fat_100g":N,"fiber_100g":N,"sodium_100g":N}\n\nSi no conocés el producto con certeza, respondé con {}.`;

  try {
    const raw = await callClaude(prompt, 400);
    if (!raw || raw === '{}') return null;
    const ai = JSON.parse(raw);
    if (!isNonEmptyString(ai.product_name) && !isNonEmptyString(ai.brands)) return null;
    if (!isNonEmptyString(ai.ingredients_text)) ai.ingredients_text = '';
    ai._aiEnriched = true;
    ai._aiSource = true;
    return ai;
  } catch {
    return null;
  }
}
