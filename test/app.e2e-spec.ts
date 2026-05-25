import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';

jest.mock('../src/auth/auth', () => ({
  auth: {
    handler: jest.fn(),
    api: {},
  },
}));
jest.mock('@thallesp/nestjs-better-auth', () => ({
  AuthModule: {
    forRoot: jest.fn(() => ({
      module: class DummyModule {},
      imports: [],
      providers: [],
      exports: [],
    })),
  },
  AllowAnonymous: () => () => {},
  OptionalAuth: () => () => {},
  Public: () => () => {},
  Optional: () => () => {},
  Roles: () => () => {},
  OrgRoles: () => () => {},
  Session: () => () => {},
  BeforeHook: () => () => {},
  AfterHook: () => () => {},
  Hook: () => () => {},
}));

import { ConfigModule, ConfigService } from '@nestjs/config';
import * as dotenv from 'dotenv';

dotenv.config();

import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), AppModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string) => {
          if (key === 'DATABASE_URL') {
            const user = process.env.POSTGRES_USER;
            const pass = process.env.POSTGRES_PASSWORD;
            const port = process.env.POSTGRES_PORT_TEST;
            const db = process.env.POSTGRES_DB;
            return `postgresql://${user}:${pass}@localhost:${port}/${db}-test?schema=public`;
          }
          return process.env[key];
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  afterEach(async () => {
    await app.close();
  });
});
