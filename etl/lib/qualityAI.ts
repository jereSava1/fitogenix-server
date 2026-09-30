// Claude para corregir datos que ya están en `products` (fixDataQuality): clasifica o
// extrae texto que ya está en la fila, nunca inventa un dato faltante.
import Anthropic from '@anthropic-ai/sdk';
import { requireAnthropicApiKey } from '../config';

let _client: Anthropic | null = null;
const client = (): Anthropic => {
  if (!_client) _client = new Anthropic({ apiKey: requireAnthropicApiKey() });
  return _client;
};

const SYSTEM_PROMPT =
  'Sos un asistente de limpieza de datos. Tu única tarea es CLASIFICAR y EXTRAER texto que ya existe en la entrada — nunca inventar, completar, ni asumir información que no esté literalmente presente. Respondés SOLO con JSON válido, sin texto adicional.';

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

export type IngredientsExtraction = {
  isCorrupted: boolean;
  /** Porción del texto original que SÍ es una lista de ingredientes real,
   * copiada literalmente — null si no hay nada rescatable. */
  realIngredients: string | null;
  /** Porción del texto original que sea razón social/dirección/RNE-RNPA del
   * fabricante, o null. Se pide para separarla de los ingredientes; no se guarda (D-41). */
  manufacturerInfo: string | null;
};

/** Parsea la respuesta cruda de Claude — separado de la llamada de red para
 * poder testearlo sin mockear el SDK (mismo motivo que el resto del
 * proyecto no testea la llamada de red de claudeEnricher.ts). */
export function parseIngredientsExtraction(raw: string): IngredientsExtraction {
  const fallback: IngredientsExtraction = {
    isCorrupted: true,
    realIngredients: null,
    manufacturerInfo: null,
  };
  if (!raw || raw === '{}') return fallback;
  try {
    const parsed = JSON.parse(raw);
    return {
      isCorrupted: parsed.isCorrupted === true,
      realIngredients:
        typeof parsed.realIngredients === 'string' && parsed.realIngredients.trim()
          ? parsed.realIngredients.trim()
          : null,
      manufacturerInfo:
        typeof parsed.manufacturerInfo === 'string' && parsed.manufacturerInfo.trim()
          ? parsed.manufacturerInfo.trim()
          : null,
    };
  } catch {
    return fallback;
  }
}

export function parseBrandExtraction(raw: string): string | null {
  if (!raw || raw === '{}') return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed.brand === 'string' && parsed.brand.trim() ? parsed.brand.trim() : null;
  } catch {
    return null;
  }
}

/** Separa ingredientes de fabricante/dirección/registro. Copia literal, no inventa. */
export async function classifyAndExtractIngredients(rawText: string): Promise<IngredientsExtraction> {
  const prompt = `Este texto viene del campo "ingredientes" de un producto alimenticio, pero puede estar corrupto: mezclado con datos de fabricante, dirección, código de registro (RNE/RNPA), u otro texto que no es una lista de ingredientes.

Texto: "${rawText}"

Devolvé un JSON con:
{
  "isCorrupted": boolean (true si el texto NO es únicamente una lista de ingredientes limpia),
  "realIngredients": la porción del texto que SÍ es una lista de ingredientes real, copiada literalmente (no reescribas, no completes, no traduzcas) — o null si no hay ninguna porción rescatable,
  "manufacturerInfo": la porción que sea razón social, dirección, o código de registro del fabricante, copiada literalmente — o null si no aparece nada de eso
}

Importante: NUNCA inventes ni completes ingredientes que no estén literalmente en el texto. Si está tan roto que no se puede extraer nada con confianza, devolvé realIngredients null.`;

  try {
    const raw = await callClaude(prompt, 400);
    return parseIngredientsExtraction(raw);
  } catch {
    return { isCorrupted: true, realIngredients: null, manufacturerInfo: null };
  }
}

/** La marca que está en el texto del nombre, o null. No usa diccionario ni inventa. */
export async function extractBrandFromName(productName: string): Promise<string | null> {
  const prompt = `Nombre de producto: "${productName}"

¿Cuál es la marca del producto, si está identificable dentro del nombre? Devolvé un JSON:
{"brand": "marca tal cual aparece en el texto, o null"}

Solo devolvé un valor si estás razonablemente seguro. Si el nombre es genérico o no incluye una marca reconocible, devolvé null. No inventes una marca que no esté en el texto.`;

  try {
    const raw = await callClaude(prompt, 100);
    return parseBrandExtraction(raw);
  } catch {
    return null;
  }
}
