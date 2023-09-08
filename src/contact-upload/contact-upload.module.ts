import { Module } from '@nestjs/common';
import { ContactUploadController } from './contact-upload.controller';
import { ContactUploadService } from './contact-upload.service';

@Module({
  controllers: [ContactUploadController],
  providers: [ContactUploadService]
})
export class ContactUploadModule {}
