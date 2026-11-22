import { FastifyRequest, FastifyReply } from 'fastify';

// ============================================
// BASE CONTROLLER - .NET: ControllerBase
// ============================================
// Common controller functionality: response helpers, error handling

export abstract class BaseController {
  // Success response - .NET: return Ok(data)
  protected ok<T>(reply: FastifyReply, data: T, statusCode = 200) {
    return reply.code(statusCode).send({ success: true, data });
  }

  // Created response - .NET: return CreatedAtAction(...)
  protected created<T>(reply: FastifyReply, data: T) {
    return this.ok(reply, data, 201);
  }

  // No content response - .NET: return NoContent()
  protected noContent(reply: FastifyReply) {
    return reply.code(204).send();
  }

  // Error responses are handled by global error handler
  // Just throw AppError instances from services
}

// Type for request with user - .NET: ControllerBase.User property
export interface AuthenticatedRequest extends FastifyRequest {
  user: {
    id: string;
    email: string;
    appleUserId?: string;
    role: string;
  };
}

// Helper to get user ID from request - .NET: User.FindFirst(ClaimTypes.NameIdentifier)?.Value
export function getUserId(request: FastifyRequest): string {
  const user = (request as any).user;
  if (!user) {
    throw new Error('User not authenticated');
  }
  return user.id;
}