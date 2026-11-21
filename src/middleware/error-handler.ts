import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { logger } from '../config/logger';

export async function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Validation errors (Zod)
  if (error instanceof ZodError) {
    return reply.code(400).send({
      error: 'Validation Error',
      message: 'Invalid request data',
      details: error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
      statusCode: 400,
    });
  }

  // Prisma errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002': // Unique constraint violation
        return reply.code(409).send({
          error: 'Conflict',
          message: 'A record with this value already exists',
          field: (error.meta as any)?.target,
          statusCode: 409,
        });
      case 'P2025': // Record not found
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Record not found',
          statusCode: 404,
        });
      default:
        logger.error({ error, code: error.code }, 'Prisma error');
    }
  }

  // Fastify validation errors
  if (error.validation) {
    return reply.code(400).send({
      error: 'Validation Error',
      message: 'Invalid request',
      details: error.validation,
      statusCode: 400,
    });
  }

  // JWT errors
  if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
    return reply.code(401).send({
      error: 'Unauthorized',
      message: error.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token',
      statusCode: 401,
    });
  }

  // Rate limit errors
  if (error.statusCode === 429) {
    return reply.code(429).send({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.',
      statusCode: 429,
    });
  }

  // Log unexpected errors
  logger.error({ error, url: request.url, method: request.method }, 'Unhandled error');

  // Default error response
  const statusCode = error.statusCode || 500;
  const message = statusCode === 500 ? 'Internal Server Error' : error.message;

  return reply.code(statusCode).send({
    error: statusCode === 500 ? 'Internal Server Error' : error.name || 'Error',
    message,
    statusCode,
    ...(process.env['NODE_ENV'] === 'development' && { stack: error.stack }),
  });
}