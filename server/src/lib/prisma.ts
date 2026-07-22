import { PrismaClient } from '@prisma/client';

// Single shared client (connection pooling handled by Prisma). Scalable default.
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'production' ? ['warn', 'error'] : ['warn', 'error'],
});
