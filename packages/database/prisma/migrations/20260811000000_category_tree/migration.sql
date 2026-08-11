-- Three-level category tree: department -> category -> subcategory.
--
-- Existing rows keep working: `pathSegment` backfills from the slug (the old
-- taxonomy was flat, so slug and path fragment were the same thing), and every
-- row lands in UNISEX until the seed re-declares the shipped taxonomy.

ALTER TABLE "categories" ADD COLUMN "pathSegment" TEXT NOT NULL DEFAULT '';
ALTER TABLE "categories" ADD COLUMN "targetGroup" "TargetGroup" NOT NULL DEFAULT 'UNISEX';
ALTER TABLE "categories" ADD COLUMN "sizeChartGroup" TEXT;

UPDATE "categories" SET "pathSegment" = "slug" WHERE "pathSegment" = '';

CREATE INDEX "categories_targetGroup_idx" ON "categories"("targetGroup");
