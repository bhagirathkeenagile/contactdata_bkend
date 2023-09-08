import { Test, TestingModule } from '@nestjs/testing';
import { ContactUploadController } from './contact-upload.controller';

describe('ContactUploadController', () => {
  let controller: ContactUploadController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContactUploadController],
    }).compile();

    controller = module.get<ContactUploadController>(ContactUploadController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
