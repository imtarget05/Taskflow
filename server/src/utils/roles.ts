import { Role } from '@prisma/client';

export const ROLE_RANK: Record<Role, number> = {
  OWNER: 3,
  MEMBER: 2,
  VIEWER: 1,
};

/** Check if user's role_rank >= required rank */
export function hasRole(userRole: Role, requiredRole: Role): boolean {
  return ROLE_RANK[userRole] >= ROLE_RANK[requiredRole];
}

/** Check if user has exactly the required role */
