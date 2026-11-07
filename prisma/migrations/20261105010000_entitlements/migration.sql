-- AlterTable
ALTER TABLE "lessons" ADD COLUMN     "isFree" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "product_accesses" ADD COLUMN     "reason" VARCHAR(1000) NOT NULL DEFAULT '',
ADD COLUMN     "source" VARCHAR(32) NOT NULL DEFAULT 'purchase';
