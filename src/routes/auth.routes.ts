import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { config } from '../config';
import { validate } from '../middleware/validation';
import { getUser } from '../middleware/auth';
import { verifyAppleIdentityToken } from '../services/auth.service';

// ============================================
// SCHEMAS
// ============================================

const appleSignInSchema = z.object({
  identityToken: z.string().min(1),
  authorizationCode: z.string().optional(),
  fullName: z.object({
    givenName: z.string().optional(),
    familyName: z.string().optional(),
  }).optional(),
  email: z.string().email().optional(),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

const verifyAppleSchema = z.object({
  identityToken: z.string().min(1),
});

// ============================================
// HELPERS
// ============================================

async function generateTokens(app: FastifyInstance, userId: string, email: string, role: string) {
  const accessToken = app.jwt.sign({ sub: userId, email, role }, { expiresIn: config.JWT_EXPIRES_IN });
  const refreshToken = app.jwt.sign({ sub: userId, type: 'refresh' }, { expiresIn: config.JWT_REFRESH_EXPIRES_IN });
  return { accessToken, refreshToken };
}

// ============================================
// ROUTES
// ============================================

export async function authRoutes(app: FastifyInstance) {
  // POST /auth/apple - Apple Sign In
  app.post('/apple', {
    schema: {
      body: appleSignInSchema,
      response: {
        200: z.object({
          user: z.object({
            id: z.string(),
            email: z.string(),
            name: z.string().nullable(),
            appleUserId: z.string().nullable(),
            isNewUser: z.boolean(),
          }),
          tokens: z.object({
            accessToken: z.string(),
            refreshToken: z.string(),
          }),
        }),
        400: z.object({ error: z.string(), message: z.string() }),
      },
    },
    preHandler: validate(appleSignInSchema),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { identityToken, fullName } = request.body as any;
    const appleIdentity = await verifyAppleIdentityToken(identityToken);
    const appleUserId = appleIdentity.sub;

    let user = await prisma.user.findUnique({ where: { appleUserId } });
    let isNewUser = false;

    if (!user) {
      const email = appleIdentity.email || `${appleUserId}@appleid.privacy`;
      user = await prisma.user.create({
        data: {
          appleUserId,
          email,
          name: fullName ? `${fullName.givenName || ''} ${fullName.familyName || ''}`.trim() || null : null,
          emailVerified: appleIdentity.email_verified === true || appleIdentity.email_verified === 'true',
        },
      });
      isNewUser = true;
      await prisma.userPreferences.create({ data: { userId: user.id } });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const { accessToken, refreshToken } = await generateTokens(app, user.id, user.email, user.role);

    logger.info({ userId: user.id, isNewUser }, 'Apple Sign In successful');

    return reply.send({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        appleUserId: user.appleUserId,
        isNewUser,
      },
      tokens: { accessToken, refreshToken },
    });
  });

  // POST /auth/refresh - Refresh access token
  app.post('/refresh', {
    schema: {
      body: refreshTokenSchema,
      response: {
        200: z.object({ accessToken: z.string(), refreshToken: z.string() }),
        401: z.object({ error: z.string(), message: z.string() }),
      },
    },
    preHandler: validate(refreshTokenSchema),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { refreshToken } = request.body as any;

    try {
      const decoded = app.jwt.verify<{ sub: string; type: string }>(refreshToken, {
        maxAge: config.JWT_REFRESH_EXPIRES_IN,
      });

      if (decoded.type !== 'refresh') {
        return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid token type' });
      }

      const user = await prisma.user.findUnique({
        where: { id: decoded.sub },
        select: { id: true, email: true, role: true },
      });

      if (!user) {
        return reply.code(401).send({ error: 'Unauthorized', message: 'User not found' });
      }

      const tokens = await generateTokens(app, user.id, user.email, user.role);

      return reply.send(tokens);
    } catch {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or expired refresh token' });
    }
  });

  // POST /auth/verify-apple - Verify Apple identity token
  app.post('/verify-apple', {
    schema: {
      body: verifyAppleSchema,
      response: {
        200: z.object({ valid: z.boolean(), appleUserId: z.string().optional() }),
        400: z.object({ error: z.string(), message: z.string() }),
      },
    },
    preHandler: validate(verifyAppleSchema),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { identityToken } = request.body as any;
    const appleIdentity = await verifyAppleIdentityToken(identityToken);
    return reply.send({ valid: true, appleUserId: appleIdentity.sub });
  });

  // POST /auth/logout
  app.post('/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ message: 'Logged out successfully' });
  });

  // GET /auth/me - Get current user profile
  app.get('/me', async (request: FastifyRequest, reply: FastifyReply) => {
    const userPayload = getUser(request);

    const user = await prisma.user.findUnique({
      where: { id: userPayload.id },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        appleUserId: true,
        role: true,
        emailVerified: true,
        createdAt: true,
        lastLoginAt: true,
        preferences: true,
      },
    });

    if (!user) {
      return reply.code(404).send({ error: 'Not Found', message: 'User not found' });
    }

    return reply.send({ user });
  });
}