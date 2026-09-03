import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { getMetrics } from './metrics';

export function metricsHandler(_req: Request, res: Response): void {
  const output = getMetrics();
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.status(StatusCodes.OK).send(output);
}