// ============================================
// REPOSITORY EXPORTS - .NET: Repository Layer Composition Root
// ============================================
// Central export for all repositories (Dependency Injection registration point)

export * from './base.repository';
export * from './user.repository';
export * from './pairing.repository';
export * from './health-data.repository';
export * from './device.repository';
export * from './notification.repository';

// Repository instances for DI - .NET: services.AddScoped<IUserRepository, UserRepository>
export { userRepository, userPreferencesRepository } from './user.repository';
export { pairingRepository } from './pairing.repository';
export { healthDataRepository } from './health-data.repository';
export { deviceRepository } from './device.repository';
export { notificationRepository } from './notification.repository';