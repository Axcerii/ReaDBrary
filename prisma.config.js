// prisma.config.js (à la racine, à côté de package.json)
const path = require('node:path');
const dotenv = require('dotenv');
const { env } = require('prisma/config');

dotenv.config();

module.exports = {
  datasource: {
    // env() helper automatically reads from process.env and checks if it's set
    url: env('DATABASE_URL'),
  },
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'npx ts-node prisma/seed.ts',
  },
};
