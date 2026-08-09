import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
  PRODUCT_VIEWS,
  campaignArtworkItems,
  campaignArtworkSvg,
  productArtworkAlt,
  productArtworkSvg,
  type ProductSpec,
  type ProductView,
} from '@outlet/catalog';

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

export interface UploadedImage {
  url: string;
  objectKey: string;
  altText: string;
  view: ProductView;
}

/**
 * Upload every view of one colourway. A colourway ships a front, back and
 * fabric-detail shot so the product gallery has real content to page through.
 */
export async function uploadProductImages(
  spec: ProductSpec,
  brandName: string,
  color: string,
): Promise<UploadedImage[]> {
  const uploaded: UploadedImage[] = [];
  for (const view of PRODUCT_VIEWS) {
    const objectKey = `products/${spec.slug}/${color.toLowerCase()}-${view}.svg`;
    const url = await put(
      objectKey,
      productArtworkSvg({ shape: spec.shape, color, brandName, productName: spec.name, view }),
    );
    if (url) {
      uploaded.push({ url, objectKey, altText: productArtworkAlt(spec.name, color, view), view });
    }
  }
  return uploaded;
}

/** Upload a campaign cover image; returns URL or null. */
export async function uploadCampaignImage(
  campaignSlug: string,
  productSlugs: string[],
  lookup: (slug: string) => { shape: ProductSpec['shape']; colors: string[] } | undefined,
): Promise<string | null> {
  return put(
    `campaigns/${campaignSlug}/cover.svg`,
    campaignArtworkSvg(campaignSlug, campaignArtworkItems(productSlugs, lookup)),
  );
}
