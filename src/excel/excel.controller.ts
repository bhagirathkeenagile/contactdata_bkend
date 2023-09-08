import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  Res,
  Body,
  Get,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ExcelService } from './excel.service';
import { fetchTableName, fetchUploadInfo } from 'src/ruleset';
import { diskStorage } from 'multer';
import { editFileName } from './file-upload.utils';

// const prisma = new PrismaClient();

@Controller('excel')
export class ExcelController {
  constructor(private readonly excelService: ExcelService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: editFileName,
      }),
    }),
  )
  async uploadFile(
    @UploadedFile() file,
    @Res() res,
    @Body('targetTable') targetTable: string,
  ) {
    try {
      if (!file) {
        throw new BadRequestException('No file uploaded.');
      }
      if (!targetTable) {
        throw new BadRequestException('No table chosen.');
      }

      const data = await this.excelService.readExcelFile(file.path);
      const keyFromExcel = Object.keys(data[0]);

      const tableData = await fetchUploadInfo(targetTable);
      return res
        .status(200)
        .json({ keyFromExcel, tableData, filePath: file.path });
    } catch (error) {
      if (error instanceof BadRequestException) {
        return res.status(400).json({ error: error.message });
      } else {
        return res
          .status(500)
          .json({ error: 'Internal Server Error', message: error.message });
      }
    }
  }

  @Get('tables')
  async tableName(@Res() res) {
    const tableName = await fetchTableName();
    const targets = tableName.map((item) => ({ label: item }));
    console.log('tableName----[ line 54 ]-->', tableName);
    return res.status(200).json({ targets });
  }
}
