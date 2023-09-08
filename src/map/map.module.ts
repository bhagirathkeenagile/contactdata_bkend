import { Module } from '@nestjs/common';
import { MapService } from './map.service';
import { MapController } from './map.controller';
import { PrismaService } from 'src/prisma.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JobsModule } from 'src/jobs/jobs.module';
import { JobsService } from 'src/jobs/jobs.service';
import { ExcelModule } from 'src/excel/excel.module';
import { ExcelService } from 'src/excel/excel.service';
import { MailModule } from 'src/mail/mail.module';
import { MailService } from 'src/mail/mail.service';

@Module({
  imports: [ConfigModule.forRoot(), JobsModule, ExcelModule, MailModule],
  controllers: [MapController],
  providers: [
    MapService,
    PrismaService,
    ConfigService,
    JobsService,
    ExcelService,
    MailService,
  ],
})
export class MapModule {}
