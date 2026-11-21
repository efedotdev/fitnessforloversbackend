import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ZodSchema, ZodError } from 'zod';

export function validate(schema: ZodSchema, source: 'body' | 'query' | 'params' | 'headers' = 'body') {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = request[source];
      const parsed = schema.parse(data);
      (request as any)[source] = parsed; // Replace with validated data
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: 'Validation Error',
          message: `Invalid ${source}`,
          details: error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
          statusCode: 400,
        });
      }
      throw error;
    }
  };
}

export function validateAll(schemas: {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
  headers?: ZodSchema;
}) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const errors: any[] = [];

    for (const [source, schema] of Object.entries(schemas)) {
      if (!schema) continue;
      try {
        const data = request[source as keyof FastifyRequest];
        const parsed = schema.parse(data);
        (request as any)[source] = parsed;
      } catch (error) {
        if (error instanceof ZodError) {
          errors.push(...error.errors.map((e) => ({
            source,
            field: e.path.join('.'),
            message: e.message,
          })));
        } else {
          throw error;
        }
      }
    }

    if (errors.length > 0) {
      return reply.code(400).send({
        error: 'Validation Error',
        message: 'Invalid request data',
        details: errors,
        statusCode: 400,
      });
    }
  };
}