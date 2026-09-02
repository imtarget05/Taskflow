import { RequestHandler } from 'express';
import { StatusCodes } from 'http-status-codes';
import { asyncHandler, AppError } from '../../utils/errors';
import { prisma } from '../../lib/prisma';
import { Role } from '@prisma/client';
import { assertRole } from '../project/project.service';
import * as agenticService from './agentic.service';
import { AnalyseOrderResult } from '../supplychain/sc-nlp.service';
import { dispatchToN8n } from '../integrations/n8n';

// POST /api/sc/agentic/process-order
// Input: { orderId: string, projectId: string }
// Flow: lấy order → chạy rule-based analysis → decision engine → execute
export const processOrder: RequestHandler = asyncHandler(async (req, res) => {
  const { orderId, projectId } = req.body;

  if (!orderId || !projectId) {
    throw new AppError('orderId and projectId are required', StatusCodes.BAD_REQUEST);
  }

  const userId = req.user!.id;

  // 1. Lấy order
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { supplier: { select: { name: true } } },
  });

  if (!order) {
    throw new AppError('Order not found', StatusCodes.NOT_FOUND);
  }

  if (order.projectId !== projectId) {
    throw new AppError('Order does not belong to project', StatusCodes.BAD_REQUEST);
  }

  // Actors must be a member of the order's project before it may act on it.
  await assertRole(projectId, userId, Role.MEMBER);

  // 2. Chạy rule-based analysis (dùng orderNumber + notes làm context)
  const text = `${order.orderNumber ?? 'PO'}\n${order.notes ?? ''}`;
  const analysis: AnalyseOrderResult = agenticService.ruleBasedFallbackForAgent(text);

  // 3. Decision engine
  const decision = agenticService.evaluateDecision(
    analysis.classification,
    analysis.confidence,
    analysis.suggestedAction,
    analysis.workflowTrigger,
    orderId
  );

  // 4. Execute decision
  const result = await agenticService.executeDecision(
    projectId,
    userId,
    decision,
    orderId,
    order.orderNumber
  );

  // 5. Lưu AgenticDecision record
  const agenticDecision = await prisma.agenticDecision.create({
    data: {
      orderId,
      projectId,
      userId,
      classification: analysis.classification,
      confidence: analysis.confidence,
      decision: decision.decision,
      action: JSON.stringify(decision.action),
      taskId: result.taskId ?? null,
      humanTaskId: result.humanTaskId ?? null,
    },
  });

  // 6. Response
  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      orderId,
      orderNumber: order.orderNumber,
      classification: analysis.classification,
      confidence: analysis.confidence,
      decision: decision.decision,
      action: decision.action,
      reason: decision.reason,
      taskId: result.taskId ?? null,
      humanTaskId: result.humanTaskId ?? null,
      agenticDecisionId: agenticDecision.id,
      llmUsed: analysis.llmUsed,
    },
  });

  // 7. Fire-and-forget n8n webhook (best effort, never blocks the response).
  void dispatchToN8n({
    path: process.env.N8N_WEBHOOK_PATH ?? '/webhook/taskflow-agentic',
    event: 'agentic.decision',
    eventId: agenticDecision.id,
    payload: {
      agenticDecisionId: agenticDecision.id,
      orderId,
      projectId,
      userId,
      classification: analysis.classification,
      confidence: analysis.confidence,
      decision: decision.decision,
      action: decision.action,
    },
  });
});

// GET /api/sc/agentic/decisions/:projectId
// Lấy lịch sử decisions cho project
export const getDecisions: RequestHandler = asyncHandler(async (req, res) => {
  const projectId = String(req.params.projectId);
  const userId = req.user!.id;

  // Only members may read a project's decision history.
  await assertRole(projectId, userId, Role.VIEWER);

  const decisions = await prisma.agenticDecision.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
    include: {
      order: { select: { id: true, orderNumber: true, status: true } },
      user: { select: { id: true, name: true } },
    },
  });

  res.status(StatusCodes.OK).json({
    success: true,
    data: decisions,
    count: decisions.length,
  });
});
