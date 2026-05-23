jest.mock('../auth/auth', () => ({
  auth: {
    api: {
      getSession: jest.fn(),
    },
  },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ClubsController } from './clubs.controller';
import { ClubsService } from './clubs.service';

describe('ClubsController', () => {
  let controller: ClubsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClubsController],
      providers: [
        {
          provide: ClubsService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ClubsController>(ClubsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
