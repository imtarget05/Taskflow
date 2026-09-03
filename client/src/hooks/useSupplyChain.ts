import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type {
  Order,
  OrderStatus,
  Supplier,
  InventoryItem,
  LineItem,
  AgenticDecision,
  SCDashboardMetrics,
} from '@/types';

// ─── Dashboard ───────────────────────────────────────────────────

const scDashboardKey = (projectId: string) => ['sc', 'dashboard', projectId] as const;

export function useSCDashboard(projectId: string | undefined) {
  return useQuery({
    queryKey: scDashboardKey(projectId ?? ''),
    enabled: !!projectId,
    queryFn: async () => {
      const res = await api.get<{ data: SCDashboardMetrics }>(`/sc/dashboard/${projectId}`);
      return res.data.data;
    },
  });
}

export function useSCDashboardExport(projectId: string) {
  return useMutation({
    mutationFn: async ({ type }: { type: 'csv' | 'txt' }): Promise<{ filename: string; content: string }> => {
      const res = await api.get(`/sc/dashboard/${projectId}/export/${type}`, {
        responseType: 'text',
      });
      const filename = `sc_dashboard_${new Date().toISOString().replace(/[:.]/g, '-')}.${type}`;
      return {
        filename,
        content: typeof res.data === 'string' ? res.data : JSON.stringify(res.data),
      };
    },
  });
}

// ─── Suppliers ───────────────────────────────────────────────────

const suppliersKey = ['sc', 'suppliers'] as const;

export function useSuppliers() {
  return useQuery({
    queryKey: suppliersKey,
    queryFn: async () => {
      const res = await api.get<{ data: Supplier[] }>(`/sc/suppliers`);
      return res.data.data;
    },
  });
}

export function useSupplier(id: string | undefined) {
  return useQuery({
    queryKey: ['sc', 'supplier', id],
    enabled: !!id,
    queryFn: async () => {
      const res = await api.get<{ data: Supplier }>(`/sc/suppliers/${id}`);
      return res.data.data;
    },
  });
}

export function useCreateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      name: string;
      code: string;
      contactName?: string;
      email?: string;
      phone?: string;
      address?: string;
      notes?: string;
    }): Promise<Supplier> => {
      const res = await api.post<{ data: Supplier }>('/sc/suppliers', data);
      return res.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: suppliersKey });
    },
  });
}

export function useUpdateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Record<string, unknown>): Promise<Supplier> => {
      const res = await api.patch<{ data: Supplier }>(`/sc/suppliers/${id}`, data);
      return res.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: suppliersKey });
    },
  });
}

export function useDeleteSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await api.delete(`/sc/suppliers/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: suppliersKey });
    },
  });
}

// ─── Orders ──────────────────────────────────────────────────────

const ordersKey = (projectId: string) => ['sc', 'orders', projectId] as const;

export function useOrders(projectId: string | undefined) {
  return useQuery({
    queryKey: ordersKey(projectId ?? ''),
    enabled: !!projectId,
    queryFn: async () => {
      const res = await api.get<{ data: Order[] }>(`/sc/orders`, {
        params: projectId ? { projectId } : undefined,
      });
      return res.data.data;
    },
  });
}

export function useOrder(id: string | undefined) {
  return useQuery({
    queryKey: ['sc', 'order', id],
    enabled: !!id,
    queryFn: async () => {
      const res = await api.get<{ data: Order }>(`/sc/orders/${id}`);
      return res.data.data;
    },
  });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      projectId: string;
      supplierId: string;
      orderNumber: string;
      totalAmount?: number;
      currency?: string;
      notes?: string;
    }): Promise<Order> => {
      const res = await api.post<{ data: Order }>('/sc/orders', data);
      return res.data.data;
    },
    onSuccess: (order) => {
      qc.invalidateQueries({ queryKey: ordersKey(order.projectId) });
    },
  });
}

export function useUpdateOrderStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: OrderStatus }): Promise<Order> => {
      const res = await api.patch<{ data: Order }>(`/sc/orders/${id}/status`, { status });
      return res.data.data;
    },
    onSuccess: (order) => {
      qc.invalidateQueries({ queryKey: ['sc', 'order', order.id] });
      qc.invalidateQueries({ queryKey: ordersKey(order.projectId) });
    },
  });
}

export function useDeleteOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (variables: { id: string; projectId: string }): Promise<void> => {
      await api.delete(`/sc/orders/${variables.id}`);
    },
    onSuccess: (_, { projectId }) => {
      qc.invalidateQueries({ queryKey: ordersKey(projectId) });
    },
  });
}

// ─── Line Items ─────────────────────────────────────────────────

export function useLineItems(orderId: string | undefined) {
  return useQuery({
    queryKey: ['sc', 'line-items', orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const res = await api.get<{ data: LineItem[] }>(`/sc/line-items`, {
        params: { orderId },
      });
      return res.data.data;
    },
  });
}

export function useCreateLineItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      orderId: string;
      sku: string;
      description?: string;
      quantity: number;
      unitPrice: number;
      amount?: number;
    }): Promise<LineItem> => {
      const res = await api.post<{ data: LineItem }>('/sc/line-items', data);
      return res.data.data;
    },
    onSuccess: (item) => {
      qc.invalidateQueries({ queryKey: ['sc', 'line-items', item.orderId] });
    },
  });
}

// ─── Inventory ──────────────────────────────────────────────────

const inventoryKey = (projectId: string) => ['sc', 'inventory', projectId] as const;

export function useInventory(projectId: string | undefined) {
  return useQuery({
    queryKey: inventoryKey(projectId ?? ''),
    enabled: !!projectId,
    queryFn: async () => {
      const res = await api.get<{ data: InventoryItem[] }>(`/sc/inventory`, {
        params: projectId ? { projectId } : undefined,
      });
      return res.data.data;
    },
  });
}

export function useInventoryItem(id: string | undefined) {
  return useQuery({
    queryKey: ['sc', 'inventory-item', id],
    enabled: !!id,
    queryFn: async () => {
      const res = await api.get<{ data: InventoryItem }>(`/sc/inventory/${id}`);
      return res.data.data;
    },
  });
}

export function useAdjustInventory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      quantity,
      reason,
    }: {
      id: string;
      quantity: number;
      reason?: string;
    }): Promise<InventoryItem> => {
      const res = await api.patch<{ data: InventoryItem }>(`/sc/inventory/${id}/adjust`, {
        quantity,
        reason,
      });
      return res.data.data;
    },
    onSuccess: (item) => {
      qc.invalidateQueries({ queryKey: ['sc', 'inventory-item', item.id] });
    },
  });
}

export function useCreateInventoryItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      projectId: string;
      sku: string;
      name: string;
      quantity: number;
      unit?: string;
      location?: string;
      minStock?: number;
    }): Promise<InventoryItem> => {
      const res = await api.post<{ data: InventoryItem }>('/sc/inventory', data);
      return res.data.data;
    },
    onSuccess: (item) => {
      qc.invalidateQueries({ queryKey: ['sc', 'inventory', item.projectId] });
    },
  });
}

// ─── SC NLP ─────────────────────────────────────────────────────

export interface AnalyseOrderInput {
  text: string;
  projectId?: string | null;
  orderId?: string | null;
}

export interface AnalyseOrderResult {
  classification: string;
  confidence: number;
  suggestedAction: string;
  workflowTrigger: string;
  llmUsed: boolean;
}

export function useAnalyseScOrder() {
  return useMutation({
    mutationFn: async (input: AnalyseOrderInput): Promise<AnalyseOrderResult> => {
      const res = await api.post<{ data: AnalyseOrderResult }>('/sc/nlp/analyse-order', input);
      return res.data.data;
    },
  });
}

// ─── Agentic Decisions ─────────────────────────────────────────

const decisionsKey = (projectId: string) => ['sc', 'decisions', projectId] as const;

export function useAgenticDecisions(projectId: string | undefined) {
  return useQuery({
    queryKey: decisionsKey(projectId ?? ''),
    enabled: !!projectId,
    queryFn: async (): Promise<AgenticDecision[]> => {
      const res = await api.get<{ data: AgenticDecision[] }>(`/sc/agentic/decisions/${projectId}`);
      return res.data.data;
    },
  });
}

export interface ProcessOrderResult {
  orderId: string;
  orderNumber: string | null;
  classification: string;
  confidence: number;
  decision: string;
  action: unknown;
  reason: string;
  taskId?: string | null;
  humanTaskId?: string | null;
  agenticDecisionId: string;
  llmUsed: boolean;
}

export function useProcessOrder() {
  return useMutation({
    mutationFn: async ({ orderId, projectId }: { orderId: string; projectId: string }): Promise<ProcessOrderResult> => {
      const res = await api.post<{ data: ProcessOrderResult }>('/sc/agentic/process-order', { orderId, projectId });
      return res.data.data;
    },
  });
}