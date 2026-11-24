// ============================================
// CONTROLLERS EXPORTS - .NET: Controller Layer Composition
// ============================================

export * from './base.controller';
export * from './auth.controller';
export * from './user.controller';
export * from './pairing.controller';
export * from './health-data.controller';
export * from './device.controller';
export * from './notification.controller';
export * from './goals.controller';
export * from './dashboard.controller';

// Route registration functions
export { registerAuthRoutes } from './auth.controller';
export { registerUserRoutes } from './user.controller';
export { registerPairingRoutes } from './pairing.controller';
export { registerHealthDataRoutes } from './health-data.controller';
export { registerDeviceRoutes } from './device.controller';
export { registerNotificationRoutes } from './notification.controller';
export { registerGoalsRoutes } from './goals.controller';
export { registerDashboardRoutes } from './dashboard.controller';