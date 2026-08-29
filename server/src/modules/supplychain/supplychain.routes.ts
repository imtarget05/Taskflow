import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { asyncHandler } from '../../utils/errors';
import * as supplychainController from './supplychain.controller';

const router = Router();

// All SC routes require authentication
router.use(authenticate);

// Suppliers
router.get('/suppliers', asyncHandler(supplychainController.getSuppliers));
router.get('/suppliers/:id', asyncHandler(supplychainController.getSupplier));
router.post('/suppliers', asyncHandler(supplychainController.createSupplier));
router.patch('/suppliers/:id', asyncHandler(supplychainController.updateSupplier));
router.delete('/suppliers/:id', asyncHandler(supplychainController.deleteSupplier));

// Orders
router.get('/orders', asyncHandler(supplychainController.getOrders));
router.get('/orders/:id', asyncHandler(supplychainController.getOrder));
router.post('/orders', asyncHandler(supplychainController.createOrder));
router.patch('/orders/:id/status', asyncHandler(supplychainController.updateOrderStatus));
router.delete('/orders/:id', asyncHandler(supplychainController.deleteOrder));

// Line Items
router.get('/line-items', asyncHandler(supplychainController.getLineItems));
router.post('/line-items', asyncHandler(supplychainController.createLineItem));
router.patch('/line-items/:id', asyncHandler(supplychainController.updateLineItem));
router.delete('/line-items/:id', asyncHandler(supplychainController.deleteLineItem));

// Inventory
router.get('/inventory', asyncHandler(supplychainController.getInventory));
router.get('/inventory/:id', asyncHandler(supplychainController.getInventoryItem));
router.post('/inventory', asyncHandler(supplychainController.createInventoryItem));
router.patch('/inventory/:id', asyncHandler(supplychainController.updateInventoryItem));
router.post('/inventory/:id/adjust', asyncHandler(supplychainController.adjustInventory));
router.delete('/inventory/:id', asyncHandler(supplychainController.deleteInventoryItem));

export default router;
