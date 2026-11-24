import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../config/database';

export interface UserPayload {
  id: string;
  email: string;
  appleUserId?: string;
  role: string;
  tokenVersion: number;
}

const PUBLIC_PATHS = [
  '/health',
  '/auth/register',
  '/auth/login',
  '/auth/apple',
  '/auth/refresh',
  '/auth/verify-apple',
  '/docs',
  '/documentation',
];

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  // Skip auth for public paths
  if (PUBLIC_PATHS.some((path) => request.url.startsWith(path))) {
    return;
  }

  // Skip auth for WebSocket upgrade requests
  if (request.headers.upgrade === 'websocket') {
    return;
  }

  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Missing or invalid authorization header',
      statusCode: 401,
    });
  }

  const token = authHeader.slice(7);

  try {
    const app = request.server;
    const decoded = app.jwt.verify<{
      sub: string;
      email: string;
      role: string;
      tokenVersion?: number;
    }>(token);

    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: { id: true, email: true, appleUserId: true, role: true, tokenVersion: true },
    });

    if (!user) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'User not found',
        statusCode: 401,
      });
    }

    if ((decoded.tokenVersion ?? 0) !== user.tokenVersion) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
        statusCode: 401,
      });
    }

    // Attach user to request (type assertion needed due to Fastify's built-in user property)
    (request as any).user = user;
  } catch (err) {
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Invalid or expired token',
      statusCode: 401,
    });
  }
}

export function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const user = (request as any).user as UserPayload | undefined;
  if (!user) {
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Authentication required',
      statusCode: 401,
    });
  }
  return true;
}

export function requireRole(...roles: string[]) {
  return (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user as UserPayload | undefined;
    if (!user) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
        statusCode: 401,
      });
    }

    if (!roles.includes(user.role)) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'Insufficient permissions',
        statusCode: 403,
      });
    }

    return true;
  };
}

// Helper to get typed user from request
export function getUser(request: FastifyRequest): UserPayload {
  const user = (request as any).user as UserPayload | undefined;
  if (!user) {
    throw new Error('User not authenticated');
  }
  return user;
}