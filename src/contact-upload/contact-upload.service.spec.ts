import { Test, TestingModule } from '@nestjs/testing';
import { ContactUploadService } from './contact-upload.service';

describe('ContactUploadService', () => {
  let service: ContactUploadService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ContactUploadService],
    }).compile();

    service = module.get<ContactUploadService>(ContactUploadService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
