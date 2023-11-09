import {
  Controller,
  Get,
  Post,
  Res,
  Headers,
  StreamableFile,
  Body,
  Param,
} from '@nestjs/common';

import { JobsService } from './jobs.service';
import * as fs from 'fs';
import { join } from 'path';
import type { Response } from 'express';
import { Auth } from 'src/auth.decorator';
import { MailService } from 'src/mail/mail.service';
import { ConfigService } from '@nestjs/config';

@Controller('jobs')
export class JobsController {
  constructor(
    private readonly jobsService: JobsService,
    private mailService: MailService,
    private configService: ConfigService,
  ) {}

  @Get('mmmtc')
  async mmmtc() {
    return this.jobsService.ProcessContactRowsImmediately(16);
  }

  @Post('rankings')
  async mmmtj(
    @Body() requestData: any,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile | null> {
    const {
      employeePercentageRequest,
      minimumCount,
      filterval,
      numberOfRecords,
      emailContact,
    } = requestData;

    if (emailContact && emailContact != '') {
      this.jobsService.sendDataToJobforEmail(requestData);
      return null;
    } else {
      const data = await this.jobsService.getEmployeeRankings(
        employeePercentageRequest,
        minimumCount,
        filterval,
        numberOfRecords,
        emailContact,
      );
      const file = fs.createReadStream(join(process.cwd(), 'uploads', data));
      const fileStats = fs.statSync(file.path);
      res.setHeader('Content-Length', fileStats.size);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader('Content-Disposition', `attachment; filename=${data}`);
      const fileStream = fs.createReadStream(file.path);
      return new StreamableFile(fileStream);
    }
    console.log('data--', requestData, emailContact);
  }

  @Get('updateScore')
  async score() {
    return await this.jobsService.createRankOnTitle();
  }

  @Post('score')
  async scorePost(@Auth() auth: string) {
    return auth;
  }

  @Get('uploads/:fileName')
  async downloadFile(@Param('fileName') fileName, @Res() res) {
    return res.sendFile(fileName, { root: './uploads' });
  }
}
