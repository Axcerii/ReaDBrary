// prisma.config.ts (à la racine, à côté de package.json)
import dotenv from 'dotenv';
import { env, PrismaConfig } from 'prisma/config';
import * as path from 'node:path';

dotenv.config();

export default {
  datasource: {
    url: env('DATABASE_URL'),
  },
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
  },
} satisfies PrismaConfig;