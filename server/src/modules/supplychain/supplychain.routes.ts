import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import * as supplychainController from './supplychain.controller';

const router = Router();

// All SC routes require authentication
router.use(authenticate);

// Suppliers
router.get('/suppliers', supplychainController.getSuppliers);
router.get('/suppliers/:id', supplychainController.getSupplier);
router.post('/suppliers', supplychainController.createSupplier);
router.patch('/suppliers/:id', supplychainController.updateSupplier);
router.delete('/suppliers/:id', supplychainController.deleteSupplier);

// Orders
router.get('/orders', supplychainController.getOrders);
router.get('/orders/:id', supplychainController.getOrder);
router.post('/orders', supplychainController.createOrder);
router.patch('/orders/:id/status', supplychainController.updateOrderStatus);
router.delete('/orders/:id', supplychainController.deleteOrder);

// Line Items
router.get('/line-items', supplychainController.getLineItems);
router.post('/line-items', supplychainController.createLineItem);
router.patch('/line-items/:id', supplychainController.updateLineItem);
router.delete('/line-items/:id', supplychainController.deleteLineItem);

// Inventory
router.get('/inventory', supplychainController.getInventory);
router.get('/inventory/:id', supplychainController.getInventoryItem);
router.post('/inventory', supplychainController.createInventoryItem);
router.patch('/inventory/:id', supplychainController.updateInventoryItem);
router.post('/inventory/:id/adjust', supplychainController.adjustInventory);
router.delete('/inventory/:id', supplychainController.deleteInventoryItem);

export default router;
