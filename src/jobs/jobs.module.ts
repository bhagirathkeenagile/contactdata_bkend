import { Module } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { PrismaService } from 'src/prisma.service';
import { ExcelModule } from 'src/excel/excel.module';
import { ExcelService } from 'src/excel/excel.service';
import { JobsController } from './jobs.controller';
import { MailModule } from 'src/mail/mail.module';
import { MailService } from 'src/mail/mail.service';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [ExcelModule, MailModule, ConfigModule],
  providers: [
    JobsService,
    PrismaService,
    ExcelService,
    MailService,
    ConfigService,
  ],
  controllers: [JobsController],
})
export class JobsModule {}
