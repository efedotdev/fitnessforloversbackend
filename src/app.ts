import Fastify, { FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from './config';
import { logger } from './config/logger';
import { connectDatabase } from './config/database';
import { errorHandler } from './middleware/error-handler';
import { authMiddleware } from './middleware/auth';
import { ZodFastifyInstance } from './types/fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from 'fastify-type-provider-zod';

// ============================================
// CONTROLLER ROUTE REGISTRATION - .NET: MapControllers()
// ============================================
import {
  registerAuthRoutes,
  registerUserRoutes,
  registerPairingRoutes,
  registerHealthDataRoutes,
  registerDeviceRoutes,
  registerNotificationRoutes,
  registerGoalsRoutes,
  registerDashboardRoutes,
} from './controllers';

const serverOptions: FastifyServerOptions = {
  logger: logger as any,
  ajv: {
    customOptions: {
      coerceTypes: 'array',
      removeAdditional: 'all',
    },
  },
};

export async function buildApp(options: { connectToDatabase?: boolean } = {}): Promise<ZodFastifyInstance> {
  const app = Fastify(serverOptions).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  if (config.NODE_ENV === 'test') {
    app.addHook('onRoute', (route) => {
      const schema = route.schema;
      if (!schema) return;

      for (const part of ['body', 'params', 'querystring', 'headers'] as const) {
        const value = schema[part];
        if (value !== undefined && !isZodSchema(value)) {
          throw new TypeError(`${route.method} ${route.url} has a non-Zod ${part} schema`);
        }
      }

      for (const [statusCode, responseSchema] of Object.entries(schema.response ?? {})) {
        if (!isZodSchema(responseSchema)) {
          throw new TypeError(`${route.method} ${route.url} has a non-Zod response schema for ${statusCode}`);
        }
      }
    });
  }

  // Security plugins
  await app.register(helmet, {
    contentSecurityPolicy: false,
  });

  await app.register(cors, {
    origin: config.CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW,
    hook: 'onRequest',
  });

  // JWT
  await app.register(jwt, {
    secret: config.JWT_SECRET,
    sign: { expiresIn: config.JWT_EXPIRES_IN },
    verify: { maxAge: config.JWT_EXPIRES_IN },
  });

  // Multipart for file uploads
  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024,
    },
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'FitnessForLovers API',
        description: 'Backend API for partner fitness sharing and shared goals.',
        version: '1.0.0',
      },
      servers: [{ url: 'http://localhost:3000' }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
      security: [{ bearerAuth: [] }],
      tags: [
        { name: 'Authentication' },
        { name: 'Users' },
        { name: 'Pairings' },
        { name: 'Health data' },
        { name: 'Goals' },
        { name: 'Dashboard' },
        { name: 'Devices' },
        { name: 'Notifications' },
      ],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/documentation' });

  // Health check
  app.get('/health', {
    schema: {
      tags: ['Health'],
      summary: 'Check API health',
      security: [],
    },
  }, async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }));

  // Register auth middleware as global hook
  app.addHook('onRequest', authMiddleware);

  // ============================================
  // REGISTER CONTROLLER ROUTES - 3-Layer Architecture
  // ============================================
  // Presentation Layer (Controllers) → Business Logic (Services) → Data Access (Repositories)

  // Public routes (no auth required)
  registerAuthRoutes(app);

  // Protected routes (auth required via global hook)
  registerUserRoutes(app);
  registerPairingRoutes(app);
  registerHealthDataRoutes(app);
  registerDeviceRoutes(app);
  registerNotificationRoutes(app);
  registerGoalsRoutes(app);
  registerDashboardRoutes(app);

  // Global error handler
  app.setErrorHandler(errorHandler);

  // 404 handler
  app.setNotFoundHandler(async (request, reply) => {
    reply.code(404).send({
      error: 'Not Found',
      message: `Route ${request.method} ${request.url} not found`,
      statusCode: 404,
    });
  });

  // Connect database
  if (options.connectToDatabase !== false) {
    await connectDatabase();
  }

  function isZodSchema(value: unknown): value is { parse: (data: unknown) => unknown } {
    return Boolean(
      value &&
      typeof value === 'object' &&
      'parse' in value &&
      typeof value.parse === 'function' &&
      'safeParse' in value &&
      typeof value.safeParse === 'function'
    );
  }

  return app;
}

export async function startServer() {
  const app = await buildApp();

  try {
    await app.listen({ port: config.PORT, host: config.HOST });
    logger.info(`🚀 Server running at http://${config.HOST}:${config.PORT}`);
    logger.info(`📚 Health check: http://${config.HOST}:${config.PORT}/health`);
  } catch (err) {
    logger.error(err, 'Failed to start server');
    process.exit(1);
  }
}

// Graceful shutdown
const signals = ['SIGTERM', 'SIGINT'] as const;
signals.forEach((signal) => {
  process.on(signal, async () => {
    logger.info({ signal }, 'Shutting down...');
    process.exit(0);
  });
});