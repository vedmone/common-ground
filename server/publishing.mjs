import crypto from 'node:crypto';
import { get, put } from '@vercel/blob';
import { AppError, cleanHTML, allowRequest } from './core.mjs';

export const publicationId = (id) =>
  typeof id === 'string' &&
  /^[a-z0-9][a-z0-9-]{0,55}-[a-f0-9]{8}(?:-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})?$/.test(
    id,
  );
export function prepareStorage(req, res, limit = 25) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST')
    throw new AppError('Use POST for this request.', 405);
  allowRequest(req, limit);
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID)
    throw new AppError(
      'Publishing storage is not connected on this server yet.',
      503,
    );
}
export async function readBlob(path) {
  const file = await get(path, { access: 'public', useCache: false });
  if (!file || file.statusCode !== 200) return null;
  return new Response(file.stream).text();
}
export async function publishPage(body) {
  if (!publicationId(body?.id))
    throw new AppError('Choose a valid page address.');
  if (typeof body.secret !== 'string' || !/^[a-f0-9]{64}$/.test(body.secret))
    throw new AppError('This browser needs a publishing key for the page.');
  const html = cleanHTML(body.html);
  const hash = crypto.createHash('sha256').update(body.secret).digest('hex');
  const ownerPath = `owners/${body.id}.json`;
  let owner = await readBlob(ownerPath);
  if (!owner) {
    try {
      await put(ownerPath, JSON.stringify({ hash }), {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: 'application/json',
      });
      owner = JSON.stringify({ hash });
    } catch {
      owner = await readBlob(ownerPath);
    }
  }
  if (!owner || JSON.parse(owner).hash !== hash)
    throw new AppError(
      'This page address belongs to another publishing key. Create a new address from this browser.',
      403,
    );
  const blob = await put(`sites/${body.id}.html`, html, {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'text/html',
    cacheControlMaxAge: 60,
  });
  const path = `/project/${body.id}`;
  const origin =
    process.env.PUBLIC_SITE_ORIGIN ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : 'https://common-ground-studio-six.vercel.app');
  return {
    path,
    url: new URL(path, origin).href,
    assetUrl: blob.url,
    publishedAt: new Date().toISOString(),
    bytes: Buffer.byteLength(html),
  };
}

export function imageType(buffer) {
  if (buffer.length < 12) return null;
  if (
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return { mime: 'image/png', ext: 'png' };
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255)
    return { mime: 'image/jpeg', ext: 'jpg' };
  if (/^GIF8[79]a$/.test(buffer.subarray(0, 6).toString()))
    return { mime: 'image/gif', ext: 'gif' };
  if (
    buffer.subarray(0, 4).toString() === 'RIFF' &&
    buffer.subarray(8, 12).toString() === 'WEBP'
  )
    return { mime: 'image/webp', ext: 'webp' };
  return null;
}
export async function uploadImage(file) {
  if (!file?.buffer?.length) throw new AppError('Choose an image first.');
  if (file.buffer.length > 3_000_000)
    throw new AppError('Use an image smaller than 3 MB.', 413);
  const type = imageType(file.buffer);
  if (!type) throw new AppError('Choose a PNG, JPEG, WebP or GIF image.');
  const blob = await put(
    `images/${crypto.randomUUID()}.${type.ext}`,
    file.buffer,
    { access: 'public', contentType: type.mime, addRandomSuffix: false },
  );
  return {
    id: crypto.randomUUID(),
    url: blob.url,
    name: String(file.originalname || 'Uploaded image').slice(0, 100),
    mime: type.mime,
  };
}
