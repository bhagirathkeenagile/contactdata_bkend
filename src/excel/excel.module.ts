import { Module } from '@nestjs/common';
import { ExcelService } from './excel.service';
import { ExcelController } from './excel.controller';
import { MulterModule } from '@nestjs/platform-express/multer/multer.module';

@Module({
  imports: [
    MulterModule.register({
      dest: './uploads', // Define the upload directory
    }),
  ],
  controllers: [ExcelController],
  providers: [ExcelService],
  exports: [ExcelService],
})
export class ExcelModule {}
