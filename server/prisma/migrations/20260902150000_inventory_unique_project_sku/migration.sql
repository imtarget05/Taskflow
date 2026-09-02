-- Security audit (Supply Chain): chống trùng SKU trong cùng project.
-- Trước: @@index([projectId, sku]) (cho phép trùng SKU) → chuyển thành @@unique.
-- LƯU Ý deploy: cần dedupe dữ liệu hiện có trước khi chạy migration này, nếu không
-- constraint mới sẽ fail với vi phạm UNIQUE.

-- DropIndex
DROP INDEX "inventory_items_projectId_sku_idx";

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_projectId_sku_key" ON "inventory_items"("projectId", "sku");