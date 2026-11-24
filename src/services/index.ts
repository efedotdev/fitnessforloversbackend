// ============================================
// SERVICES EXPORTS - .NET: Service Layer Composition Root
// ============================================

export * from './auth.service';
export * from './user.service';
export * from './pairing.service';
export * from './health-data.service';
export * from './device.service';
export * from './notification.service';
export * from './goal.service';
export * from './dashboard.service';

// Service instances for DI - .NET: services.AddScoped<IAuthService, AuthService>()
export { authService } from './auth.service';
export { userService } from './user.service';
export { pairingService } from './pairing.service';
export { healthDataService } from './health-data.service';
export { deviceService } from './device.service';
export { notificationService } from './notification.service';
export { goalService } from './goal.service';
export { dashboardService } from './dashboard.service';