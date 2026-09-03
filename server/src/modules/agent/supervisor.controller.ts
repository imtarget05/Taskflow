import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { route, execute, AgentRoute } from './supervisor';
import { validationError } from '../../utils/errors';

const routeSchema = z.object({
  text: z.string().min(1, 'text is required').max(4000),
  projectId: z.string().cuid().optional().nullable(),
  agent: z.enum(['chat', 'sc_agentic', 'ml_agent']).optional(),
});

export async function routeHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = routeSchema.safeParse(req.body);
    if (!parsed.success) throw validationError(parsed.error);
    const { text, projectId, agent } = parsed.data;
    const routed = agent ? { agent: agent as AgentRoute, reason: `Forced route: ${agent}` } : route(text);
    const userId = (req as unknown as { user: { id: string } }).user.id;
    const result = await execute(routed.agent, userId, { text, projectId: projectId ?? undefined });
    res.json({ success: true, data: { routed, result } });
  } catch (err) {
    next(err);
  }
}

export function routePreviewHandler(req: Request, res: Response, next: NextFunction): void {
  try {
    const text = typeof req.query.text === 'string' ? req.query.text : '';
    if (!text.trim()) {
      res.status(400).json({ success: false, message: 'Missing query ?text=' });
      return;
    }
    const routed = route(text);
    res.json({ success: true, data: routed });
  } catch (err) {
    next(err);
  }
}
