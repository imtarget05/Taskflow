-- Revert dangerous cascade: deleting a supplier should NOT delete order history.
-- Changes orders_supplierId_fkey from CASCADE to RESTRICT.

ALTER TABLE "orders" DROP CONSTRAINT "orders_supplierId_fkey";
ALTER TABLE "orders" ADD CONSTRAINT "orders_supplierId_fkey" 
  FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
