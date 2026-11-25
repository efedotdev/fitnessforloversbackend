import { FastifyRequest, FastifyReply } from 'fastify';
import { ZodFastifyInstance } from '../types/fastify';
import { BaseController, getUserId } from './base.controller';
import { userService } from '../services';
import {
  UpdateProfileRequest,
  UpdatePreferencesRequest,
  profileResponseSchema,
  preferencesResponseSchema,
  deleteAccountResponseSchema,
  publicUserResponseSchema,
  updatePreferencesRequestSchema,
  updateProfileRequestSchema,
} from '../dtos';
import { idParamSchema } from '../dtos/common';

// ============================================
// USER CONTROLLER - .NET: UserController
// ============================================
// Presentation layer: HTTP handling for user profile and preferences

export class UserController extends BaseController {
  // GET /users/me - Get Current User Profile
  // .NET: [HttpGet("me")] public async Task<IActionResult> GetProfile()
  async getProfile(request: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(request);
    const result = await userService.getProfile(userId);
    return this.ok(reply, { user: result });
  }

  // PATCH /users/me - Update Profile
  // .NET: [HttpPatch("me")] public async Task<IActionResult> UpdateProfile(UpdateProfileRequest request)
  async updateProfile(request: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(request);
    const body = request.body as UpdateProfileRequest;
    const result = await userService.updateProfile(userId, body);
    return this.ok(reply, { user: result });
  }

  // GET /users/me/preferences - Get Preferences
  // .NET: [HttpGet("me/preferences")] public async Task<IActionResult> GetPreferences()
  async getPreferences(request: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(request);
    const result = await userService.getPreferences(userId);
    return this.ok(reply, { preferences: result });
  }

  // PATCH /users/me/preferences - Update Preferences
  // .NET: [HttpPatch("me/preferences")] public async Task<IActionResult> UpdatePreferences(UpdatePreferencesRequest request)
  async updatePreferences(request: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(request);
    const body = request.body as UpdatePreferencesRequest;
    const result = await userService.updatePreferences(userId, body);
    return this.ok(reply, { preferences: result });
  }

  // DELETE /users/me - Delete Account
  // .NET: [HttpDelete("me")] public async Task<IActionResult> DeleteAccount()
  async deleteAccount(request: FastifyRequest, reply: FastifyReply) {
    const userId = getUserId(request);
    const result = await userService.deleteAccount(userId);
    return this.ok(reply, result);
  }

  // GET /users/:id - Get Public Profile
  // .NET: [HttpGet("{id}")] public async Task<IActionResult> GetPublicProfile(string id)
  async getPublicProfile(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const result = await userService.getPublicProfile(id);
    return this.ok(reply, { user: result });
  }
}

// Register routes
export function registerUserRoutes(app: ZodFastifyInstance) {
  const controller = new UserController();

  app.get('/users/me', {
    schema: {
      tags: ['Users'],
      summary: 'Get the authenticated user profile and preferences',
      response: { 200: profileResponseSchema },
    },
  }, controller.getProfile.bind(controller));
  app.patch('/users/me', {
    schema: {
      tags: ['Users'],
      summary: 'Update the authenticated user profile',
      body: updateProfileRequestSchema,
      response: { 200: profileResponseSchema },
    },
  }, controller.updateProfile.bind(controller));

  app.get('/users/me/preferences', {
    schema: {
      tags: ['Users'],
      summary: 'Get user preferences',
      response: { 200: preferencesResponseSchema },
    },
  }, controller.getPreferences.bind(controller));
  app.patch('/users/me/preferences', {
    schema: {
      tags: ['Users'],
      summary: 'Update user preferences and sharing scope',
      body: updatePreferencesRequestSchema,
      response: { 200: preferencesResponseSchema },
    },
  }, controller.updatePreferences.bind(controller));

  app.delete('/users/me', {
    schema: {
      tags: ['Users'],
      summary: 'Delete the authenticated user account',
      response: { 200: deleteAccountResponseSchema },
    },
  }, controller.deleteAccount.bind(controller));
  app.get('/users/:id', {
    schema: {
      tags: ['Users'],
      summary: 'Get a public user profile',
      params: idParamSchema,
      response: { 200: publicUserResponseSchema },
    },
  }, controller.getPublicProfile.bind(controller));
}