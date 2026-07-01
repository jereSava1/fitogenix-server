import { config } from '../config';

const UPCDB_BASE = 'https://api.upcitemdb.com/prod/trial/lookup';

export async function fetchRetailerImage(barcode: string): Promise<string | null> {
  if (!/^\d{8,14}$/.test(barcode.trim())) return null;

  try {
    const r = await fetch(`${UPCDB_BASE}?upc=${barcode}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const data = await r.json();
    const images = data.items?.[0]?.images;
    return Array.isArray(images) && images.length > 0 ? images[0] : null;
  } catch {
    return null;
  }
}

export async function fetchSearchImageUrl(name: string, brand?: string): Promise<string | null> {
  if (!name) return null;

  try {
    const q = `${brand ? brand + ' ' : ''}${name} producto envase`;
    const url = `https://serpapi.com/search?engine=google_images&q=${encodeURIComponent(q)}&api_key=${encodeURIComponent(config.serpApiKey)}`;

    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const data = await r.json();
    return data.images_results?.[0]?.original ?? null;
  } catch {
    return null;
  }
}

export async function removeBackground(imageUrl: string): Promise<ArrayBuffer | null> {
  const apiKey = config.removeBgApiKey;
  if (!apiKey) return null;

  try {
    const source = await fetch(imageUrl, { signal: AbortSignal.timeout(8000) });
    if (!source.ok) return null;
    const imageBuffer = await source.arrayBuffer();

    const form = new FormData();
    form.append('image_file', new Blob([imageBuffer]), 'product.jpg');
    form.append('size', 'auto');

    const r = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey },
      body: form,
      signal: AbortSignal.timeout(15000),
    });

    if (!r.ok) return null;
    return r.arrayBuffer();
  } catch {
    return null;
  }
}
