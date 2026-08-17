import { NextFunction, Request, Response } from 'express';
import { Role } from '@prisma/client';
import { StatusCodes } from 'http-status-codes';
import { prisma } from '../lib/prisma';

const ROLE_RANK: Record<Role, number> = {
  OWNER: 3,
  MEMBER: 2,
  VIEWER: 1,
};

/**
 * Loads the project membership of the authenticated user and attaches it to
 * req.projectRole. Must be used AFTER `authenticate`.
 */
export async function loadProjectMembership(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
        const rawProjectId = req.params.projectId ?? req.body.projectId;
    const projectId = Array.isArray(rawProjectId) ? rawProjectId[0] : rawProjectId;
    if (!projectId) {
      res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: 'Missing projectId' });
      return;
    }

    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: req.user!.id } },
    });

    if (!membership) {
      res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: 'You are not a member of this project',
      });
      return;
    }

    (req as Request & { projectRole?: Role }).projectRole = membership.role;
    next();
  } catch {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Server error' });
  }
}

/**
 * Guards that the current user's project role is at least the required role.
 * Must be used AFTER `authenticate` + `loadProjectMembership`.
 */
export function requireRole(minRole: Role) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = (req as Request & { projectRole?: Role }).projectRole;
    if (!role) {
      res.status(StatusCodes.FORBIDDEN).json({ success: false, message: 'Access denied' });
      return;
    }
    if (ROLE_RANK[role] < ROLE_RANK[minRole]) {
      res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: `Requires at least ${minRole} role`,
      });
      return;
    }
    next();
  };
}

/** Convenience guard: only project owner can remove members / delete project. */
export const requireOwner = requireRole(Role.OWNER);
/** Members and above can create/edit tasks and columns. */
export const requireMember = requireRole(Role.MEMBER);
