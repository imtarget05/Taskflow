-- CreateEnum
CREATE TYPE "ColumnType" AS ENUM ('STANDARD', 'SC_WORKFLOW');

-- AlterTable
ALTER TABLE "columns" ADD COLUMN     "columnType" "ColumnType" NOT NULL DEFAULT 'STANDARD';
