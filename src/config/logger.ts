import pino from 'pino';
import { config } from './index';

const transport = config.NODE_ENV === 'development'
  ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    }
  : undefined;

export const logger = pino({
  level: config.LOG_LEVEL,
  transport,
  base: {
    service: 'fitnessforlovers-backend',
  },
});