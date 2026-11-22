import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { BaseController, getUserId } from './base.controller';
import { authService } from '../services';
import {
  AppleSignInRequest,
  RefreshTokenRequest,
  VerifyAppleRequest,
} from '../dtos';

// ============================================
// AUTH CONTROLLER - .NET: AuthController
// ============================================
// Presentation layer: HTTP handling for authentication endpoints

export class AuthController extends BaseController {
  // POST /auth/apple - Apple Sign In
  // .NET: [HttpPost("apple")] public async Task<IActionResult> AppleSignIn(AppleSignInRequest request)
  async appleSignIn(request: FastifyRequest, reply: FastifyReply) {
    const body = request.body as AppleSignInRequest;
    const result = await authService.appleSignIn(body, request.server);
    return this.ok(reply, result, 201);
  }

  // POST /auth/refresh - Refresh Access Token
  // .NET: [HttpPost("refresh")] public async Task<IActionResult> RefreshToken(RefreshTokenRequest request)
  async refreshToken(request: FastifyRequest, reply: FastifyReply) {
    const body = request.body as RefreshTokenRequest;
    const result = await authService.refreshToken(body, request.server);
    return this.ok(reply, result);
  }

  // POST /auth/verify-apple - Verify Apple Identity Token
  // .NET: [HttpPost("verify-apple")] public async Task<IActionResult> VerifyApple(VerifyAppleRequest request)
  async verifyApple(request: FastifyRequest, reply: FastifyReply) {
    const body = request.body as VerifyAppleRequest;
    const result = await authService.verifyAppleToken(body);
    return this.ok(reply, result);
  }

  // POST /auth/logout
  // .NET: [HttpPost("logout")] public async Task<IActionResult> Logout()
  async logout(request: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(request);
    const result = await authService.logout(userId);
    return this.ok(reply, result);
  }

  // GET /auth/me - Get Current User
  // .NET: [HttpGet("me")] public async Task<IActionResult> GetCurrentUser()
  async getMe(request: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(request);
    const result = await authService.getCurrentUser(userId);
    return this.ok(reply, { user: result });
  }
}

// Register routes - .NET: MapControllerRoute / MapControllers
export function registerAuthRoutes(app: FastifyInstance) {
  const controller = new AuthController();

  // Public routes (no auth required)
  app.post('/auth/apple', {
    schema: {
      body: {
        type: 'object',
        required: ['identityToken'],
        properties: {
          identityToken: { type: 'string' },
          authorizationCode: { type: 'string' },
          fullName: {
            type: 'object',
            properties: {
              givenName: { type: 'string' },
              familyName: { type: 'string' },
            },
          },
          email: { type: 'string', format: 'email' },
        },
      },
    },
  }, controller.appleSignIn.bind(controller));

  app.post('/auth/refresh', {
    schema: {
      body: {
        type: 'object',
        required: ['refreshToken'],
        properties: { refreshToken: { type: 'string' } },
      },
    },
  }, controller.refreshToken.bind(controller));

  app.post('/auth/verify-apple', {
    schema: {
      body: {
        type: 'object',
        required: ['identityToken'],
        properties: { identityToken: { type: 'string' } },
      },
    },
  }, controller.verifyApple.bind(controller));

  // Protected routes (auth required via global hook)
  app.post('/auth/logout', controller.logout.bind(controller));
  app.get('/auth/me', controller.getMe.bind(controller));
}