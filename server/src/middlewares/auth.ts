import { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { prisma } from '../lib/prisma';
import { verifyAccessToken } from '../utils/token';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
      };
    }
  }
}

/**
 * Extracts and verifies the JWT from the httpOnly access cookie.
 * Bearer auth remains a non-browser fallback for API clients and tests.
 * Attaches the authenticated user to req.user.
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;
  const cookieToken = req.cookies?.access_token as string | undefined;
  const bearerToken = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  const token = cookieToken ?? bearerToken;
  if (!token) {
    res.status(StatusCodes.UNAUTHORIZED).json({
      success: false,
      message: 'Missing authentication token',
    });
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    if (payload.type !== 'access') {
      res.status(StatusCodes.UNAUTHORIZED).json({ success: false, message: 'Invalid token type' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true },
    });

    if (!user) {
      res.status(StatusCodes.UNAUTHORIZED).json({ success: false, message: 'User not found' });
      return;
    }

    req.user = user;
    next();
  } catch {
    res.status(StatusCodes.UNAUTHORIZED).json({ success: false, message: 'Unauthorized' });
  }
}
