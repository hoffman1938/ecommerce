# MinIO → Cloudflare R2 migration guide

R2 speaks the S3 API, so the existing `CloudflareR2StorageProvider`
(`packages/storage`) is the MinIO implementation with different configuration.

## 1. Create the bucket and credentials

1. Cloudflare dashboard → R2 → create bucket (e.g. `outlet-assets`).
2. Create an R2 API token scoped to that bucket (Object Read & Write) — this yields the
   access-key/secret pair.
3. For public product images, either enable the bucket's public development URL or (recommended)
   attach a custom domain (e.g. `assets.example.com`) so images serve through the Cloudflare CDN
   with cache rules.

## 2. Reconfigure the API (no code changes)

```env
STORAGE_PROVIDER=r2
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_PUBLIC_ENDPOINT=https://assets.example.com
S3_BUCKET=outlet-assets
S3_REGION=auto
S3_ACCESS_KEY=<r2-access-key-id>
S3_SECRET_KEY=<r2-secret-access-key>
# With a custom asset domain the bucket is implicit in the host:
S3_FORCE_PATH_STYLE=false
```

And on both Pages projects: `NEXT_PUBLIC_ASSET_BASE_URL=https://assets.example.com`.

## 3. Copy existing objects (if migrating data, not just config)

```bash
# rclone example
rclone config          # define "minio" (endpoint http://localhost:9000) and "r2" remotes
rclone copy minio:outlet-local r2:outlet-assets --progress
```

Database image URLs embed the old public endpoint. After copying, either keep the old host alive
as a redirect, or run a one-off SQL update:

```sql
UPDATE "product_images" SET "url" = replace("url", 'http://localhost:9000/outlet-local', 'https://assets.example.com');
UPDATE "campaigns"      SET "coverImageUrl" = replace("coverImageUrl", 'http://localhost:9000/outlet-local', 'https://assets.example.com');
```

## 4. Cache policy notes

- Uploads are written with `Cache-Control: public, max-age=31536000, immutable` and unique object
  keys, so aggressive CDN caching is safe.
- Add a Cloudflare cache rule on the asset domain: cache everything, respect origin headers.
- Invalidation is unnecessary because keys are never reused; deleting a product image deletes the
  DB row immediately and the object becomes unreachable.
