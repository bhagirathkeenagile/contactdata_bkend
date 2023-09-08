import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ExcelModule } from './excel/excel.module';
import { MapModule } from './map/map.module';
// import { CorsModule } from '@nestjs/platform-express';
import { JobsModule } from './jobs/jobs.module';
import { ContactUploadModule } from './contact-upload/contact-upload.module';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { MailModule } from './mail/mail.module';
import { SearchModule } from './search/search.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    ScheduleModule.forRoot(),
    ExcelModule,
    MapModule,
    JobsModule,
    ContactUploadModule,
    MailModule,
    SearchModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
