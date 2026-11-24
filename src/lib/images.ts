// Image upload to the private "images" bucket + signed URL cache.
import { supabase } from './supabase';

const MAX_SIDE = 2560;
const BUCKET = 'images';

/**
 * Shrink big screenshots and convert them to WebP. Small images and GIFs are kept as-is
 * (Noita is pixel art: small images must stay lossless).
 */
async function prepare(file: File, keepOriginal: boolean): Promise<{ blob: Blob; ext: string }> {
  const ext0 = (file.name.split('.').pop() || 'png').toLowerCase();
  if (keepOriginal || file.type === 'image/gif' || file.size < 400_000) return { blob: file, ext: ext0 };
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = scale < 1;
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', 0.9));
  if (!blob || blob.size >= file.size) return { blob: file, ext: ext0 };
  return { blob, ext: 'webp' };
}

/** Upload and return the storage path (e.g. "notes/abc.webp"). */
export async function uploadImage(file: File, folder: string, keepOriginal = false): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('not an image');
  const { blob, ext } = await prepare(file, keepOriginal);
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type || file.type,
    cacheControl: '31536000',
  });
  if (error) throw error;
  return path;
}

export async function deleteImage(path: string) {
  await supabase.storage.from(BUCKET).remove([path]);
}

// ---- Signed URLs (bucket is private: links expire) ------------------------
const TTL = 60 * 60 * 6; // 6 h
const cache = new Map<string, { url: string; exp: number }>();
const pending = new Map<string, Promise<string | null>>();

export async function signedUrls(paths: string[]): Promise<Map<string, string>> {
  const now = Date.now();
  const out = new Map<string, string>();
  const missing = paths.filter((p) => {
    const c = cache.get(p);
    if (c && c.exp > now + 60_000) { out.set(p, c.url); return false; }
    return true;
  });
  if (missing.length) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls([...new Set(missing)], TTL);
    for (const d of data ?? []) {
      if (d.signedUrl && d.path) {
        cache.set(d.path, { url: d.signedUrl, exp: now + TTL * 1000 });
        out.set(d.path, d.signedUrl);
      }
    }
  }
  return out;
}

export function signedUrl(path: string): Promise<string | null> {
  const c = cache.get(path);
  if (c && c.exp > Date.now() + 60_000) return Promise.resolve(c.url);
  let p = pending.get(path);
  if (!p) {
    p = signedUrls([path]).then((m) => m.get(path) ?? null).finally(() => pending.delete(path));
    pending.set(path, p);
  }
  return p;
}

/** Image files from a paste or drop event. */
export function imageFiles(dt: DataTransfer | null): File[] {
  if (!dt) return [];
  return Array.from(dt.files).filter((f) => f.type.startsWith('image/'));
}
