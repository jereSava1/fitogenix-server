import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { getScoreLabel, getSello } from '../domain/product/scoring';
import type { FitogenixProduct } from '../types/fitogenix';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _admin: ReturnType<typeof createClient<any>> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = (): ReturnType<typeof createClient<any>> => {
  if (!_admin) _admin = createClient(config.supabaseUrl, config.supabaseSecretKey);
  return _admin;
};

export type CachedProductRecord = {
  id: string;
  name: string;
  brand?: string;
  category?: string;
  score: number;
  imageUrl?: string | null;
  ingredients?: unknown[];
  nutrition?: unknown;
  alternatives?: unknown[];
  dataSource?: string;
};

export async function getCachedProduct(barcode: string): Promise<CachedProductRecord | null> {
  const { data, error } = await admin()
    .from('products')
    .select('*')
    .eq('barcode', barcode)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: barcode,
    name: data.product_name,
    brand: data.brand ?? '',
    category: data.category ?? 'Alimento',
    score: data.score,
    imageUrl: data.image_url,
    ingredients: data.ingredients_analysis ?? [],
    nutrition: data.nutrition ?? {},
    alternatives: data.alternatives ?? [],
    dataSource: data.data_source,
  };
}

export async function setCachedProduct(product: FitogenixProduct, barcode: string): Promise<void> {
  if (!product.imageUrl || typeof product.imageUrl !== 'string') return;

  const { error } = await admin()
    .from('products')
    .upsert(
      {
        barcode,
        product_name: product.name,
        brand: product.brand || null,
        category: product.category || null,
        image_url: product.imageUrl,
        score: product.score,
        score_label: getScoreLabel(product.score).label,
        sello: getSello(product.score),
        ingredients_analysis: product.ingredients,
        nutrition: product.nutrition,
        alternatives: product.alternatives,
        data_source: product.dataSource,
      },
      { onConflict: 'barcode', ignoreDuplicates: true },
    );

  if (error) {
    console.error('Error caching product:', error.message);
  }
}
