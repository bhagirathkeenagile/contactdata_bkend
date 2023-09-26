import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { JobsService } from 'src/jobs/jobs.service';
import { MailService } from 'src/mail/mail.service';
import { PrismaService } from 'src/prisma.service';

@Injectable()
export class SchedulerService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private jobsService: JobsService,
    private mailService: MailService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async handleCron() {
    //this.logger.debug('Called when the current second is 45');
    //console.log(new Date());

    console.log('Start Time--', new Date());
    //console.log('cron job started-');
    //console.log('URL----', process.env.APP_URL);
    const allQueuedJobs = await this.prisma.jobs.findMany({
      where: {
        status: 'PENDING',
      },
    });
    console.log('cron job started--', new Date());
    // Check if there are no queued jobs
    if (allQueuedJobs.length === 0) {
      console.log('No queued jobs found.');
      console.log('End Start Time--', new Date());
      return;
    }

    allQueuedJobs.map(async (job) => {
      const updateJobStatus = await this.prisma.jobs.update({
        where: {
          id: job.id,
        },
        data: {
          status: 'PROCESSING',
        },
      });
      console.log('Start to call Method...');
      const status = await this.jobsService.ProcessContactRowsImmediately(
        job.mapId,
      );
      console.log('status--', status);
      if (status.errorCode === 'NO_ERROR') {
        const emailBody = {
          transactional_message_id: 96,
          to: 'bhagirathsingh@keenagile.com',
          from: 'support@itadusa.com',
          subject: 'Contact Import Summary from Backend Process',
          identifiers: {
            email: 'bhagirathsingh@keenagile.com',
          },
          message_data: {
            total_records: status.TotalRecords,
            inserted_records: status.created,
            updated_records: status.updated,
            error_url: status.OutputValue.error_url,
            success_url: status.OutputValue.success_url,
            exist_records: '100',
            header_content:
              'Your Contact Data Import process has been completed, please check the details below: ',
          },
          disable_message_retention: false,
          send_to_unsubscribed: true,
          tracked: true,
          queue_draft: false,
          disable_css_preprocessing: true,
        };

        this.configService.get<boolean>('SEND_EMAIL_AFTER_UPLOAD') &&
          (await this.mailService.sendUserConfirmation(
            emailBody,
            'Contact Upload Completed',
          ));
        console.log('Email Sent ');
      }
      if (status.errorCode === 'NO_ERROR') {
        const updateJobStatus = await this.prisma.jobs.update({
          where: {
            id: job.id,
          },
          data: {
            status: 'Complete',
          },
        });
      }
    });
  }
}
