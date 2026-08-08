import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { campaignArtworkSvg, productArtworkSvg, type ProductSpec } from '@outlet/catalog';

/**
 * Uploads the catalogue's generated artwork (packages/catalog/src/artwork.ts) to
 * MinIO/S3 so the local storefront loads images from real object storage without
 * shipping any copyrighted assets. Falls back to a static path when the bucket is
 * unreachable — e.g. seeding without the object-storage container.
 *
 * Swapping in licensed photography later means uploading it under the same keys;
 * nothing downstream depends on the images being generated.
 */

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

async function put(objectKey: string, svg: string): Promise<string | null> {
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

/** Upload one colourway's product image; returns { url, objectKey } or null. */
export async function uploadProductImage(
  spec: ProductSpec,
  brandName: string,
  color: string,
): Promise<{ url: string; objectKey: string } | null> {
  const objectKey = `products/${spec.slug}/${color.toLowerCase()}.svg`;
  const url = await put(
    objectKey,
    productArtworkSvg({
      shape: spec.shape,
      color,
      brandName,
      productName: spec.name,
    }),
  );
  return url ? { url, objectKey } : null;
}

/** Upload a campaign cover image; returns URL or null. */
export async function uploadCampaignImage(
  campaignSlug: string,
  title: string,
): Promise<string | null> {
  return put(`campaigns/${campaignSlug}/cover.svg`, campaignArtworkSvg(title));
}
