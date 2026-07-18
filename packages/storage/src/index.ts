import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface StoredFile {
  bucket: string;
  objectKey: string;
  url: string;
  sizeBytes: number;
  mimeType: string;
}

export interface UploadInput {
  objectKey: string;
  body: Buffer | Uint8Array | string;
  mimeType: string;
  cacheControl?: string;
}

/**
 * Provider interface for object storage. Uploaded files never live on the
 * application server's filesystem — they go straight to the object store.
 */
export interface ObjectStorageProvider {
  readonly name: string;
  upload(input: UploadInput): Promise<StoredFile>;
  delete(objectKey: string): Promise<void>;
  getPublicUrl(objectKey: string): string;
  getPresignedDownloadUrl(objectKey: string, expiresInSeconds?: number): Promise<string>;
}

export interface S3StorageConfig {
  endpoint: string;
  publicEndpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  forcePathStyle: boolean;
}

/**
 * Works against any S3-compatible API. Base implementation for MinIO
 * (local development), AWS S3, and Cloudflare R2.
 */
export class S3CompatibleStorageProvider implements ObjectStorageProvider {
  readonly name: string = 's3';
  protected readonly client: S3Client;

  constructor(protected readonly config: S3StorageConfig) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
      forcePathStyle: config.forcePathStyle,
    });
  }

  async upload(input: UploadInput): Promise<StoredFile> {
    const body =
      typeof input.body === 'string' ? Buffer.from(input.body) : Buffer.from(input.body);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: input.objectKey,
        Body: body,
        ContentType: input.mimeType,
        CacheControl: input.cacheControl ?? 'public, max-age=31536000, immutable',
      }),
    );
    return {
      bucket: this.config.bucket,
      objectKey: input.objectKey,
      url: this.getPublicUrl(input.objectKey),
      sizeBytes: body.length,
      mimeType: input.mimeType,
    };
  }

  async delete(objectKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.config.bucket, Key: objectKey }),
    );
  }

  getPublicUrl(objectKey: string): string {
    const base = this.config.publicEndpoint.replace(/\/$/, '');
    if (this.config.forcePathStyle) {
      return `${base}/${this.config.bucket}/${objectKey}`;
    }
    return `${base}/${objectKey}`;
  }

  async getPresignedDownloadUrl(objectKey: string, expiresInSeconds = 900): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.config.bucket, Key: objectKey }),
      { expiresIn: expiresInSeconds },
    );
  }
}

/** Local development storage backed by the MinIO container. */
export class MinioStorageProvider extends S3CompatibleStorageProvider {
  override readonly name = 'minio';
}

/**
 * Cloudflare R2 adapter. R2 exposes an S3-compatible API, so this reuses the
 * S3 implementation; the public URL should point at an R2 public bucket
 * domain or a custom domain served through the Cloudflare CDN.
 * See /infrastructure/cloudflare/r2-migration.md.
 */
export class CloudflareR2StorageProvider extends S3CompatibleStorageProvider {
  override readonly name = 'r2';
}

export function createStorageProvider(
  provider: 'minio' | 's3' | 'r2',
  config: S3StorageConfig,
): ObjectStorageProvider {
  switch (provider) {
    case 'r2':
      return new CloudflareR2StorageProvider(config);
    case 's3':
      return new S3CompatibleStorageProvider(config);
    case 'minio':
    default:
      return new MinioStorageProvider(config);
  }
}
