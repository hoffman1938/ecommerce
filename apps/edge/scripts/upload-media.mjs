#!/usr/bin/env node
/**
 * `pnpm media:upload` — renders the catalogue artwork and puts it in R2.
 *
 *   node scripts/upload-media.mjs --local
 *   node scripts/upload-media.mjs --remote
 *
 * This is an optimisation, not a prerequisite. The Worker renders the same SVG
 * on the fly for any key the bucket does not hold, so the storefront has
 * working imagery on a bucket that has never been touched. Uploading turns
 * that per-request render into a cached object, and gives the demo somewhere
 * to point when swapping in real photography later: replace the objects, keep
 * the keys, and nothing downstream has to know.
 *
 * The keys written here are exactly the ones the seed wrote into
 * `product_images.objectKey`, so the two cannot drift.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as catalogModule from '@outlet/catalog';
import { runWrangler } from './lib/wrangler.mjs';

const catalog = catalogModule.default ?? catalogModule;
const {
  BRANDS,
  CAMPAIGNS,
  CATEGORIES,
  PRODUCTS,
  PRODUCT_VIEWS,
  brandArtworkSvg,
  campaignArtworkItems,
  campaignArtworkSvg,
  categoryArtworkSvg,
  productArtworkSvg,
} = catalog;

const APP_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const STAGING = join(APP_ROOT, '.seed', 'media');

const argv = process.argv.slice(2);
const remote = argv.includes('--remote');
const local = argv.includes('--local');
if (local === remote) {
  console.error('Specify exactly one of --local or --remote.');
  process.exit(1);
}
const flag = remote ? '--remote' : '--local';
const BUCKET = 'outlet-demo-media';

const colourSlug = (color) => color.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const productBySlug = new Map(PRODUCTS.map((spec) => [spec.slug, spec]));

/** Every object the catalogue implies, as { key, svg }. */
function buildObjects() {
  const objects = [];

  for (const spec of PRODUCTS) {
    for (const color of spec.colors) {
      for (const view of PRODUCT_VIEWS) {
        objects.push({
          key: `products/${spec.slug}/${colourSlug(color)}-${view}.svg`,
          svg: productArtworkSvg({
            shape: spec.shape,
            color,
            brandName: spec.brand,
            productName: spec.name,
            view,
          }),
        });
      }
    }
  }

  for (const campaign of CAMPAIGNS) {
    objects.push({
      key: `campaigns/${campaign.slug}.svg`,
      svg: campaignArtworkSvg(
        campaign.slug,
        campaignArtworkItems(campaign.productSlugs, (slug) => productBySlug.get(slug)),
      ),
    });
  }

  for (const category of CATEGORIES) {
    objects.push({
      key: `categories/${category.slug}.svg`,
      svg: categoryArtworkSvg(category.slug, category.name),
    });
  }

  for (const brand of BRANDS) {
    objects.push({ key: `brands/${brand.slug}.svg`, svg: brandArtworkSvg(brand.name) });
  }

  return objects;
}

const objects = buildObjects();
console.log(`Rendering ${objects.length} objects…`);

mkdirSync(STAGING, { recursive: true });
let uploaded = 0;

for (const object of objects) {
  const file = join(STAGING, object.key.replace(/\//g, '__'));
  writeFileSync(file, object.svg, 'utf8');

  runWrangler(
    [
      'r2',
      'object',
      'put',
      `${BUCKET}/${object.key}`,
      `--file=${file}`,
      '--content-type=image/svg+xml',
      '--cache-control=public, max-age=31536000, immutable',
      flag,
    ],
    APP_ROOT,
  );

  uploaded += 1;
  if (uploaded % 25 === 0) console.log(`  ${uploaded}/${objects.length}`);
}

console.log(`\nUploaded ${uploaded} objects to ${remote ? 'the remote' : 'the local'} bucket.`);
