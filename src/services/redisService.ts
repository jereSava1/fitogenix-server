/**
 * Redis cache service (Upstash REST).
 *
 * Todas las funciones son no-op cuando faltan UPSTASH_REDIS_REST_URL / TOKEN,
 * así el servidor corre sin Redis en desarrollo.
 *
 * TTLs (ver productLookupService.ts):
 *   Producto normal : 7 días  (604800 s)
 *   Origen IA       : 3 días  (259200 s)
 *
 * ── Invalidación por versión de motor ──
 *
 * A diferencia del cache de Supabase (que guarda los CRUDOS y recomputa con
 * mapOFFToProduct en cada lectura, así que nunca puede servir una forma vieja),
 * acá guardamos el `FitogenixProduct` YA SERIALIZADO. Una entrada escrita por
 * `ftg-rubric-v2` trae `subscores`, `breakdown.components` y un `score`
 * numérico donde v2.1 devolvería `null`: servirla tal cual es romperle el
 * contrato al cliente.
 *
 * Por eso el valor va adentro de un SOBRE con la versión del motor que lo
 * generó, y toda entrada cuya versión no coincida con ENGINE_VERSION se trata
 * como MISS — el nivel Supabase la repuebla con la forma nueva. Es el mismo
 * precedente que las entradas pre-migración 006 sin `productId`
 * (productLookupService.doResolveWithImages), pero el chequeo vive acá porque
 * es un problema de SERIALIZACIÓN, no de la cascada.
 *
 * Por qué el sobre y NO versionar la clave (`ftg:product:v2.1:<barcode>`):
 * las dos invalidan igual de bien, pero la clave versionada deja HUÉRFANO todo
 * el namespace viejo —potencialmente el catálogo entero— ocupando storage pago
 * hasta que venza el TTL (7 días), y ninguna ruta de código lo sobrescribe
 * nunca (haría falta un SCAN + DEL a mano). Con el sobre, el miss REESCRIBE la
 * misma clave: el storage queda acotado y la limpieza es automática. Además el
 * sobre es autodescriptivo — se puede inspeccionar una entrada y saber con qué
 * motor se calculó, cosa que la clave sola no resuelve si el payload cambia
 * por un motivo que no sea un bump de versión.
 */

import { Redis } from '@upstash/redis';
import { config } from '../config';
import { ENGINE_VERSION } from '../domain/product/ftgEngine';
import type { FitogenixProduct } from '../types/fitogenix';

const REDIS_KEY_PREFIX = 'ftg:product:';
const SEARCH_KEY_PREFIX = 'ftg:search:';
const SEARCH_TTL_SECONDS = 2592000; // 30 días

function normalizeQuery(query: string): string {
  return query.toLowerCase().trim();
}

/**
 * Lo que efectivamente se guarda en `ftg:product:<clave>`: el producto más la
 * versión del motor que lo calculó. El nombre del campo va completo (y no `v`)
 * a propósito: el peso extra es despreciable al lado del payload y hace que la
 * entrada se pueda leer a ojo desde la consola de Upstash.
 */
export type RedisProductEnvelope = {
  engineVersion: string;
  product: FitogenixProduct;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Decide si lo que había en la clave sirve para ESTA versión del motor.
 * Función PURA (sin I/O) y exportada para poder testear la invalidación sin
 * levantar Redis.
 *
 * Devuelve el producto solo si la versión coincide con ENGINE_VERSION; en
 * cualquier otro caso devuelve null, que el caller trata como cache miss.
 *
 * Tres formas posibles en la clave:
 *   1. Sobre { engineVersion, product } — la forma que escribe setInRedis.
 *   2. FitogenixProduct pelado CON breakdown.engineVersion — lo que escribiría
 *      una instancia que ya corre v2.1 pero todavía tiene el redisService
 *      viejo (ventana de un deploy rolling). Se acepta si la versión del
 *      breakdown coincide: el payload ya tiene la forma nueva.
 *   3. FitogenixProduct pelado SIN breakdown, o con una versión distinta —
 *      todo lo escrito por v2 y anteriores. Siempre miss.
 */
export function unwrapCachedProduct(raw: unknown): FitogenixProduct | null {
  if (!isRecord(raw)) return null;

  // (1) Forma nueva: sobre explícito.
  if (typeof raw.engineVersion === 'string' && isRecord(raw.product)) {
    return raw.engineVersion === ENGINE_VERSION
      ? (raw.product as unknown as FitogenixProduct)
      : null;
  }

  // (2)/(3) Payload pelado: la única versión confiable es la que el propio
  // motor estampó en el breakdown. Sin breakdown no hay forma de saber con qué
  // motor se calculó → se descarta.
  const breakdown = isRecord(raw.breakdown) ? raw.breakdown : null;
  const version = breakdown && typeof breakdown.engineVersion === 'string'
    ? breakdown.engineVersion
    : null;

  return version === ENGINE_VERSION ? (raw as unknown as FitogenixProduct) : null;
}

// Lazily created — only when env vars are present.
let _redis: Redis | null | undefined = undefined; // undefined = not yet checked

function getRedis(): Redis | null {
  if (_redis !== undefined) return _redis;

  if (config.upstashRedisUrl && config.upstashRedisToken) {
    _redis = new Redis({
      url: config.upstashRedisUrl,
      token: config.upstashRedisToken,
    });
  } else {
    _redis = null;
  }

  return _redis;
}

export async function getFromRedis(barcode: string): Promise<FitogenixProduct | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const raw = await redis.get<unknown>(REDIS_KEY_PREFIX + barcode);
    if (raw == null) return null;

    const product = unwrapCachedProduct(raw);
    if (!product) {
      // Entrada de otra versión del motor. Se loguea como evento propio (no
      // como error) porque el día del deploy va a pasar con TODO el catálogo:
      // sirve para ver la curva de repoblado, no para alertar.
      console.info(
        JSON.stringify({ event: 'redis_stale_engine_version', cacheKey: barcode }),
      );
    }
    return product;
  } catch (err) {
    console.error('[redisService] getFromRedis error:', err);
    return null;
  }
}

export async function setInRedis(
  barcode: string,
  product: FitogenixProduct,
  ttlSeconds = 604800,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    const envelope: RedisProductEnvelope = { engineVersion: ENGINE_VERSION, product };
    await redis.set(REDIS_KEY_PREFIX + barcode, envelope, { ex: ttlSeconds });
  } catch (err) {
    console.error('[redisService] setInRedis error:', err);
  }
}

// ── Cache texto→barcode (Fase 3) ──
// Evita el OFF search (~500ms) cuando otro usuario ya resolvió la misma query.
//
// Este cache NO se versiona por motor a propósito: mapea query → código de
// barras, un dato del mundo (qué producto es) que no depende de cómo lo
// puntuamos. Invalidarlo en cada bump del motor tiraría a la basura resoluciones
// caras de OFF sin ganar nada de consistencia.

export async function getSearchBarcode(query: string): Promise<string | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const code = await redis.get<string>(SEARCH_KEY_PREFIX + normalizeQuery(query));
    return code ?? null;
  } catch (err) {
    console.error('[redisService] getSearchBarcode error:', err);
    return null;
  }
}

export async function setSearchBarcode(query: string, barcode: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.set(SEARCH_KEY_PREFIX + normalizeQuery(query), barcode, {
      ex: SEARCH_TTL_SECONDS,
    });
  } catch (err) {
    console.error('[redisService] setSearchBarcode error:', err);
  }
}
