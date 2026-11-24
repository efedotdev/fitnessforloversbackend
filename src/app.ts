import Fastify, { FastifyInstance, FastifyServerOptions } from 'fastify';
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
import {
  createJsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
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

const transformZodSchema = createJsonSchemaTransform({
  skipList: ['/documentation/', '/documentation/json', '/documentation/yaml'],
});

function openApiTransform(input: Parameters<typeof transformZodSchema>[0]) {
  const { url } = input;
  const schema = input.schema ?? {};
  const isZodSchema = (value: unknown) =>
    Boolean(value && typeof value === 'object' && 'safeParse' in value);
  const zodSchema = { ...schema } as typeof schema & Record<string, unknown>;

  for (const property of ['body', 'params', 'querystring', 'headers']) {
    if (!isZodSchema(zodSchema[property])) delete zodSchema[property];
  }

  const originalResponses = schema['response'] as Record<string, unknown> | undefined;
  const zodResponses = Object.fromEntries(
    Object.entries(originalResponses ?? {}).filter(([, value]) => isZodSchema(value))
  );
  if (Object.keys(zodResponses).length > 0) {
    zodSchema['response'] = zodResponses;
  } else {
    delete zodSchema['response'];
  }

  const hasZodSchema = [
    zodSchema['body'],
    zodSchema['params'],
    zodSchema['querystring'],
    zodSchema['headers'],
    ...Object.values(zodResponses),
  ].some(isZodSchema);
  if (!hasZodSchema) return { schema, url };
  try {
    const transformed = transformZodSchema({ schema: zodSchema, url });
    const merged = { ...schema, ...transformed.schema } as typeof schema & Record<string, unknown>;
    if (originalResponses) {
      merged['response'] = {
        ...originalResponses,
        ...(transformed.schema['response'] as Record<string, unknown> | undefined),
      };
    }
    return { schema: merged, url };
  } catch (error) {
    throw new Error(`Failed to generate OpenAPI schema for ${url}: ${String(error)}`);
  }
}

export async function buildApp(options: { connectToDatabase?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify(serverOptions);

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

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
      ],
    },
    transform: openApiTransform,
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