-- AlterEnum
-- Postgres 12+ permits ADD VALUE inside a transaction as long as the new value
-- is not itself used in the same transaction. Nothing below writes 'HIDDEN'.
ALTER TYPE "ReviewStatus" ADD VALUE 'HIDDEN';

-- AlterTable
ALTER TABLE "product_reviews" ADD COLUMN     "adminReply" TEXT,
ADD COLUMN     "adminReplyAt" TIMESTAMP(3),
ADD COLUMN     "adminReplyByUserId" TEXT,
ADD COLUMN     "reportCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reportedAt" TIMESTAMP(3),
ADD COLUMN     "moderationNote" TEXT,
ADD COLUMN     "moderatedAt" TIMESTAMP(3),
ADD COLUMN     "moderatedByUserId" TEXT;

-- CreateIndex
CREATE INDEX "product_reviews_status_createdAt_idx" ON "product_reviews"("status", "createdAt");

-- CreateIndex
CREATE INDEX "product_reviews_reportCount_idx" ON "product_reviews"("reportCount");

-- AddForeignKey
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_adminReplyByUserId_fkey" FOREIGN KEY ("adminReplyByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_moderatedByUserId_fkey" FOREIGN KEY ("moderatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
