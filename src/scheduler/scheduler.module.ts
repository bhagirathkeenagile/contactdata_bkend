import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerService } from './scheduler.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JobsModule } from 'src/jobs/jobs.module';
import { MailModule } from 'src/mail/mail.module';
import { ExcelModule } from 'src/excel/excel.module';
import { MapModule } from 'src/map/map.module';
import { ContactUploadModule } from 'src/contact-upload/contact-upload.module';
import { SearchModule } from 'src/search/search.module';
import { PrismaService } from 'src/prisma.service';
import { JobsService } from 'src/jobs/jobs.service';
import { MailService } from 'src/mail/mail.service';

@Module({
  providers: [
    PrismaService,
    SchedulerService,
    ConfigService,
    JobsService,
    MailService,
  ],
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
})
export class SchedulerModule {}
