import { Injectable } from '@nestjs/common';
import * as xlsx from 'xlsx';
import fs from 'fs';

@Injectable()
export class ExcelService {
  constructor() {}

  async readExcelFile(filePath: string): Promise<any[]> {
    const workbook = xlsx.readFile(filePath);

    const sheetName = workbook.SheetNames[0];
    const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
      defval: '',
    });

    return sheetData;
  }

  async writeExcelFile(data: any[]) {
    const workbook = xlsx.utils.book_new();
    const sheet = xlsx.utils.json_to_sheet(data);
    // [
    //   { A: 1, B: 2 },
    //   { A: 3, B: 4 },
    // ]

    xlsx.utils.book_append_sheet(workbook, sheet, 'Sheet1');
    const generatedfileName = `Contacts_${new Date().toDateString()}.xlsx`;
    const fname = `uploads/${generatedfileName}`;
    xlsx.writeFile(workbook, fname);
    return generatedfileName;
  }
}
