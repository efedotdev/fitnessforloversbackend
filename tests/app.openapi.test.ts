import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

describe('OpenAPI contract', () => {
  let app: FastifyInstance;
  let authService: typeof import('../src/services').authService;

  beforeAll(async () => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/fitnessforlovers';
    process.env.JWT_SECRET = 'test-jwt-secret-that-is-long-enough-123456';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-long-enough-123';
    process.env.APPLE_BUNDLE_ID = 'com.example.fitnessforlovers';

    const { buildApp } = await import('../src/app');
    ({ authService } = await import('../src/services'));
    app = await buildApp({ connectToDatabase: false });
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the generated contract at the configured documentation JSON endpoint', async () => {
    const response = await app.inject({ method: 'GET', url: '/documentation/json' });
    expect(response.statusCode).toBe(200);

    const contract = response.json();
    expect(contract.paths['/auth/register'].post).toBeDefined();
    expect(contract.paths['/auth/login'].post).toBeDefined();
    expect(contract.paths['/dashboard'].get).toBeDefined();
    expect(contract.paths['/goals'].post).toBeDefined();
    expect(contract.paths['/health-data/bulk'].post).toBeDefined();
    expect(contract.servers).toEqual([{ url: 'http://localhost:3000' }]);
    expect(contract.components.securitySchemes.bearerAuth).toEqual({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    });
    const pairingProperties = contract.paths['/pairings'].post.requestBody.content['application/json'].schema.properties;
    expect(pairingProperties).toHaveProperty('customTypes');
    expect(pairingProperties).not.toHaveProperty('customDataTypes');
    expect(pairingProperties).not.toHaveProperty('response');
    expect(contract.paths['/pairings'].post.responses['201'].content['application/json'].schema).toBeDefined();
    const healthSampleProperties = contract.paths['/health-data/bulk'].post.requestBody
      .content['application/json'].schema.properties.data.items.properties;
    expect(healthSampleProperties.sourceSampleId).toMatchObject({ type: 'string' });
    const goalResponse = contract.paths['/goals'].post.responses['201'].content['application/json'].schema;
    expect(JSON.stringify(goalResponse)).toContain('progressPercentage');
    expect(contract.paths['/auth/register'].post.security).toEqual([]);
    expect(contract.paths['/pairings'].post.security).toBeUndefined();
    expect(JSON.stringify(contract)).not.toContain('passwordHash');

    for (const path of Object.values(contract.paths)) {
      for (const operation of Object.values(path)) {
        if (!operation || typeof operation !== 'object') continue;
        const requestBody = operation.requestBody as { content?: Record<string, { schema?: unknown }> } | undefined;
        const requestSchema = requestBody?.content?.['application/json']?.schema;
        if (requestSchema && typeof requestSchema === 'object') {
          expect(requestSchema).not.toHaveProperty('response');
        }
        const responses = operation.responses as Record<string, { content?: Record<string, { schema?: unknown }> }> | undefined;
        for (const response of Object.values(responses ?? {})) {
          const schema = response.content?.['application/json']?.schema;
          if (schema) expect(typeof schema).toBe('object');
        }
      }
    }
  });

  it('rejects invalid registration input before calling the auth service', async () => {
    const register = vi.spyOn(authService, 'register');
    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { name: 'Efe', email: 'user@example.com', password: 'short' },
    });

    expect(response.statusCode).toBe(400);
    expect(register).not.toHaveBeenCalled();
    register.mockRestore();
  });

  it('validates and returns the email registration response contract', async () => {
    const createdAt = new Date('2026-11-24T00:00:00.000Z');
    const register = vi.spyOn(authService, 'register').mockResolvedValue({
      user: {
        id: 'user-id',
        name: 'Efe',
        email: 'user@example.com',
        avatarUrl: null,
        createdAt,
      },
      tokens: { accessToken: 'access-token', refreshToken: 'refresh-token' },
    } as never);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { name: ' Efe ', email: ' USER@Example.com ', password: 'StrongPassword123!' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      success: true,
      data: { user: { name: 'Efe', email: 'user@example.com' } },
    });
    expect(register).toHaveBeenCalledWith({
      name: 'Efe',
      email: 'user@example.com',
      password: 'StrongPassword123!',
    }, expect.anything());
    register.mockRestore();
  });

  it('rejects unauthenticated protected requests', async () => {
    const response = await app.inject({ method: 'GET', url: '/dashboard' });
    expect(response.statusCode).toBe(401);
  });
});
