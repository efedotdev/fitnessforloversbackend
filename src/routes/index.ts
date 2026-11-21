import { FastifyInstance } from 'fastify';
import { authRoutes } from './auth.routes';
import { userRoutes } from './user.routes';
import { pairingRoutes } from './pairing.routes';
import { healthDataRoutes } from './health-data.routes';
import { deviceRoutes } from './device.routes';
import { notificationRoutes } from './notification.routes';

export async function registerRoutes(app: FastifyInstance) {
  // Public routes
  await app.register(authRoutes, { prefix: '/auth' });

  // Protected routes (require authentication)
  await app.register(userRoutes, { prefix: '/users' });
  await app.register(pairingRoutes, { prefix: '/pairings' });
  await app.register(healthDataRoutes, { prefix: '/health-data' });
  await app.register(deviceRoutes, { prefix: '/devices' });
  await app.register(notificationRoutes, { prefix: '/notifications' });
}