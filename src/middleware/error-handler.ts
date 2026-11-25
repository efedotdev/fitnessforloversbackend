import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { logger } from '../config/logger';

function getValidationDetails(error: FastifyError | ZodError) {
  if (error instanceof ZodError) {
    return error.issues.map((issue) => ({
      field: issue.path.join('.'),
      instancePath: issue.path.join('.'),
      keyword: issue.code,
      message: getSafeZodMessage(issue.code),
    }));
  }

  return (error.validation ?? []).map((issue) => ({
    instancePath: issue.instancePath,
    schemaPath: issue.schemaPath,
    keyword: issue.keyword,
    message: issue.message,
    params: issue.params,
  }));
}

function getSafeZodMessage(code: string) {
  switch (code) {
    case 'invalid_type':
      return 'Invalid value type';
    case 'invalid_string':
      return 'Invalid string';
    case 'invalid_enum_value':
      return 'Invalid enum value';
    case 'too_small':
      return 'Value is too small';
    case 'too_big':
      return 'Value is too large';
    case 'unrecognized_keys':
      return 'Unrecognized field';
    default:
      return 'Invalid value';
  }
}

export async function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) {
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

  if (error instanceof ZodError || error.validation) {
    const details = getValidationDetails(error);
    if (process.env['NODE_ENV'] === 'development') {
      logger.warn({
        method: request.method,
        url: request.url,
        validationContext: error.validationContext,
        details,
      }, 'Request validation failed');
    }

    return reply.code(400).send({
      error: 'Validation Error',
      message: 'Invalid request data',
      details,
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
  logger.error({ err: error, url: request.url, method: request.method }, 'Unhandled error');

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