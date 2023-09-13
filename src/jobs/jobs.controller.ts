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

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get('mmmtc')
  async mmmtc() {
    return this.jobsService.ProcessContactRowsImmediately(16);
  }

  @Post('rankings')
  async mmmtj(
    @Body() requestData: any,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { employeePercentageRequest, minimumCount, filterval } = requestData;

    const data = await this.jobsService.getEmployeeRankings(
      employeePercentageRequest,
      minimumCount,
      filterval,
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
