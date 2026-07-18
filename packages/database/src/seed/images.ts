import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

/**
 * Uploads simple generated SVG placeholder images to MinIO so the local
 * storefront has real object-storage-served images without shipping any
 * copyrighted assets. Falls back to a static path when MinIO is unreachable
 * (e.g. running the seed without the object-storage container).
 */

const COLOR_HEX: Record<string, string> = {
  Black: '#1f2937',
  White: '#e5e7eb',
  Red: '#dc2626',
  Blue: '#2563eb',
  Navy: '#1e3a5f',
  Green: '#16a34a',
  Grey: '#6b7280',
  Beige: '#d6c7a1',
  Pink: '#ec4899',
  Orange: '#ea580c',
};

let s3: S3Client | undefined;

function getClient(): S3Client {
  if (!s3) {
    s3 = new S3Client({
      endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
      region: process.env.S3_REGION ?? 'us-east-1',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY ?? 'minio',
        secretAccessKey: process.env.S3_SECRET_KEY ?? 'minio123',
      },
      forcePathStyle: true,
    });
  }
  return s3;
}

function bucket(): string {
  return process.env.S3_BUCKET ?? 'outlet-local';
}

function publicBase(): string {
  const base = process.env.S3_PUBLIC_ENDPOINT ?? 'http://localhost:9000';
  return `${base.replace(/\/$/, '')}/${bucket()}`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function productSvg(brandName: string, productName: string, color: string): string {
  const bg = COLOR_HEX[color] ?? '#9ca3af';
  const fg = color === 'White' || color === 'Beige' ? '#111827' : '#ffffff';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
  <rect width="800" height="800" fill="${bg}"/>
  <rect x="60" y="60" width="680" height="680" fill="none" stroke="${fg}" stroke-opacity="0.35" stroke-width="4"/>
  <text x="400" y="360" font-family="Arial, sans-serif" font-size="64" font-weight="bold" fill="${fg}" text-anchor="middle">${escapeXml(brandName)}</text>
  <text x="400" y="440" font-family="Arial, sans-serif" font-size="34" fill="${fg}" fill-opacity="0.9" text-anchor="middle">${escapeXml(productName)}</text>
  <text x="400" y="500" font-family="Arial, sans-serif" font-size="28" fill="${fg}" fill-opacity="0.7" text-anchor="middle">${escapeXml(color)}</text>
</svg>`;
}

/** Upload a placeholder product image; returns { url, objectKey } or null. */
export async function uploadProductImage(
  productSlug: string,
  brandName: string,
  productName: string,
  color: string,
): Promise<{ url: string; objectKey: string } | null> {
  const objectKey = `products/${productSlug}/${color.toLowerCase()}.svg`;
  try {
    await getClient().send(
      new PutObjectCommand({
        Bucket: bucket(),
        Key: objectKey,
        Body: productSvg(brandName, productName, color),
        ContentType: 'image/svg+xml',
      }),
    );
    return { url: `${publicBase()}/${objectKey}`, objectKey };
  } catch (err) {
    console.warn(`MinIO upload failed for ${objectKey}: ${(err as Error).message}`);
    return null;
  }
}

/** Upload a campaign cover image; returns URL or null. */
export async function uploadCampaignImage(
  campaignSlug: string,
  title: string,
): Promise<string | null> {
  const objectKey = `campaigns/${campaignSlug}/cover.svg`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="500" viewBox="0 0 1200 500">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#111827"/>
      <stop offset="1" stop-color="#4b5563"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="500" fill="url(#g)"/>
  <text x="600" y="250" font-family="Arial, sans-serif" font-size="64" font-weight="bold" fill="#ffffff" text-anchor="middle">${escapeXml(title)}</text>
  <text x="600" y="320" font-family="Arial, sans-serif" font-size="30" fill="#d1d5db" text-anchor="middle">Limited stock. Limited time.</text>
</svg>`;
  try {
    await getClient().send(
      new PutObjectCommand({
        Bucket: bucket(),
        Key: objectKey,
        Body: svg,
        ContentType: 'image/svg+xml',
      }),
    );
    return `${publicBase()}/${objectKey}`;
  } catch (err) {
    console.warn(`MinIO upload failed for ${objectKey}: ${(err as Error).message}`);
    return null;
  }
}
