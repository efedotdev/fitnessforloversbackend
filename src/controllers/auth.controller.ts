import { FastifyRequest, FastifyReply } from 'fastify';
import { ZodFastifyInstance } from '../types/fastify';
import { BaseController, getUserId, getUserTokenVersion } from './base.controller';
import { authService } from '../services';
import {
  AppleSignInRequest,
  RefreshTokenRequest,
  VerifyAppleRequest,
  RegisterRequest,
  LoginRequest,
  appleSignInRequestSchema,
  registerRequestSchema,
  loginRequestSchema,
  refreshTokenRequestSchema,
  verifyAppleRequestSchema,
  emailAuthResponseSchema,
  appleSignInResponseSchema,
  refreshResponseSchema,
  verifyAppleResponseSchema,
  meResponseSchema,
  logoutResponseSchema,
} from '../dtos';

// ============================================
// AUTH CONTROLLER - .NET: AuthController
// ============================================
// Presentation layer: HTTP handling for authentication endpoints

export class AuthController extends BaseController {
  async register(request: FastifyRequest, reply: FastifyReply) {
    const body = request.body as RegisterRequest;
    const result = await authService.register(body, request.server);
    return this.created(reply, result);
  }

  async login(request: FastifyRequest, reply: FastifyReply) {
    const body = request.body as LoginRequest;
    const result = await authService.login(body, request.server);
    return this.ok(reply, result);
  }

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
    const result = await authService.logout(userId, getUserTokenVersion(request));
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
export function registerAuthRoutes(app: ZodFastifyInstance) {
  const controller = new AuthController();

  // Public routes (no auth required)
  app.post('/auth/register', {
    schema: {
      tags: ['Authentication'],
      summary: 'Create an email and password account',
      body: registerRequestSchema,
      response: { 201: emailAuthResponseSchema },
      security: [],
    },
  }, controller.register.bind(controller));

  app.post('/auth/login', {
    schema: {
      tags: ['Authentication'],
      summary: 'Authenticate with email and password',
      body: loginRequestSchema,
      response: { 200: emailAuthResponseSchema },
      security: [],
    },
  }, controller.login.bind(controller));

  app.post('/auth/apple', {
    schema: {
      tags: ['Authentication'],
      summary: 'Sign in with Apple',
      security: [],
      body: appleSignInRequestSchema,
      response: { 201: appleSignInResponseSchema },
    },
  }, controller.appleSignIn.bind(controller));

  app.post('/auth/refresh', {
    schema: {
      tags: ['Authentication'],
      summary: 'Refresh the access and refresh tokens',
      security: [],
      body: refreshTokenRequestSchema,
      response: { 200: refreshResponseSchema },
    },
  }, controller.refreshToken.bind(controller));

  app.post('/auth/verify-apple', {
    schema: {
      tags: ['Authentication'],
      security: [],
      body: verifyAppleRequestSchema,
      response: { 200: verifyAppleResponseSchema },
    },
  }, controller.verifyApple.bind(controller));

  // Protected routes (auth required via global hook)
  app.post('/auth/logout', {
    schema: {
      tags: ['Authentication'],
      summary: 'Invalidate the current user token version',
      response: { 200: logoutResponseSchema },
    },
  }, controller.logout.bind(controller));
  app.get('/auth/me', {
    schema: {
      tags: ['Authentication'],
      summary: 'Get the authenticated user profile',
      response: { 200: meResponseSchema },
    },
  }, controller.getMe.bind(controller));
}