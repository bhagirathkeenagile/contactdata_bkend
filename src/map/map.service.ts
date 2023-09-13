import { Injectable } from '@nestjs/common';
import { fetchAllRules } from 'src/ruleset';
import { PrismaService } from './../prisma.service';
import * as xlsx from 'xlsx';
import { CreateMapDto } from './dto/create-map.dto';
import { ConfigService } from '@nestjs/config';
import { JobsService } from 'src/jobs/jobs.service';
import { MailService } from 'src/mail/mail.service';

export interface TableData {
  table: string;
  name: string;
  excelHeader: string;
  mapped: string;
  columnName: string;
}

@Injectable()
export class MapService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private jobsService: JobsService,
    private mailService: MailService,
  ) {}

  async readExcelFile(filePath: string): Promise<any[]> {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
    return sheetData;
  }

  fetchRuleset() {
    return fetchAllRules();
  }

  async saveMappingData(data: CreateMapDto): Promise<{
    errorCode: 'ERROR' | 'NO_ERROR' | 'PROCESSING_FAILED';
  }> {
    const countExcelRows = (await this.readExcelFile(data.filePath)).length;
    // IMMEDIATE_ROWS_TO_PROCESS
    const IMMEDIATE_ROWS_TO_PROCESS =
      this.configService.get<number>('IMMEDIATE_ROWS_TO_PROCESS') || 10000;

    //console.log('body', data);
    // save mapping data to database
    const mappingData = await this.prisma.mappingData.create({
      data: {
        /**
         * spread operator is used to merge two objects
         * its equivalent to 
         * { name: data.name,
          mainTable: data.mainTable,
          mapping: data.mapping,
          filePath: data.filePath,
          status: data.status,
          action: data.action
        }
         */
        ...data,
        ...{
          created_at: new Date(),
          isDeleted: false,
        },
      },
    });
    /**
     * if excel file has more than IMMEDIATE_ROWS_TO_PROCESS rows then
     * create a job and send mapping data to job
     */
    if (countExcelRows > IMMEDIATE_ROWS_TO_PROCESS) {
      await this.jobsService.sendDataToJob({
        mapId: mappingData.id,
        status: 'PENDING',
      });
      return { errorCode: 'NO_ERROR' };
    }
    // process contact rows immediately
    const status = await this.jobsService.ProcessContactRowsImmediately(
      mappingData.id,
    );

    if (status.errorCode === 'NO_ERROR') {
      const emailBody = {
        transactional_message_id: 96,
        to: 'bhagirathsingh@keenagile.com',
        from: 'support@itadusa.com',
        subject: 'Contact Import Summary',
        identifiers: {
          email: 'bhagirathsingh@keenagile.com',
        },
        message_data: {
          total_records: status.TotalRecords,
          inserted_records: status.created,
          updated_records: status.updated,
          error_url: `${process.env.APP_URL}/${status.OutputValue.error_url}`,
          success_url: `${process.env.APP_URL}/${status.OutputValue.success_url}`,
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

    return { errorCode: status.errorCode };
  }

  async fetchMapData() {
    const mapListData = await this.prisma.mappingData.findMany({});
    return { mapListData: mapListData };
  }

  async fetchSingleMap(id: number | string) {
    const mapData = await this.prisma.mappingData.findUnique({
      where: {
        id: Number(id),
      },
    });
    return { mapData: mapData };
  }

  async fetchContacts(page: number, pageSize: number) {
    const skip = (page - 1) * pageSize;

    const contactdata = await this.prisma.contact.findMany({});
    console.log('contact data ==>', contactdata);
    const contacts = await this.prisma.contact.findMany({
      skip,
      take: Number(pageSize),
      include: {
        Account: true,
      },
    });

    const totalContacts = await this.prisma.contact.count();

    return {
      contacts: JSON.parse(
        JSON.stringify(contacts, (key, value) =>
          typeof value === 'bigint' ? value.toString() : value,
        ),
      ),
      contactCount: contacts.length,
      currentPage: page,
      pageSize,
      totalContacts,
    };
  }

  async fetcAllcontactData() {
    const contactListData = await this.prisma.contact.findMany();
    return {
      contacts: JSON.parse(
        JSON.stringify(contactListData, (key, value) =>
          typeof value === 'bigint' ? value.toString() : value,
        ),
      ),
    };
  }

  async fetchAccounts() {
    const contacts = await this.prisma.accounts.findMany({});
    return {
      accounts: JSON.parse(
        JSON.stringify(
          contacts,
          (key, value) =>
            typeof value === 'bigint' ? value.toString() : value, // return everything else unchanged
        ),
      ),
    };
  }

  async deleteByIdMapIteam(Id: any) {
    try {
      const deletedResponse = await this.prisma.mappingData.delete({
        where: {
          id: Number(Id),
        },
      });
      return { deletedResponse, message: 'Iteam Deleted Successfully' };
    } catch (error) {
      return { message: 'Have Problem for deletion', error: error.message };
    }
  }

  async fetchMapDataById(Id: any) {
    try {
      const mapFieldDataById = await this.prisma.mappingData.findUnique({
        where: {
          id: Number(Id),
        },
      });
      const tableData: TableData[] = JSON.parse(mapFieldDataById.mapping);
      const mappedData = tableData.filter((item) => item.mapped === 'Mapped');
      return { mapFiledData: mapFieldDataById, tableMappedData: mappedData };
    } catch (error) {
      return { message: 'Facing Problem To Fetch Data', error: error.message };
    }
  }

  async CloneMapDataById(Id: any) {
    const generateRandomWord = () => {
      const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
      const wordLength = 5;
      let randomWord = '';

      for (let i = 0; i < wordLength; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        randomWord += characters.charAt(randomIndex);
      }

      return randomWord;
    };

    // clone by id
    try {
      const userToCopy = await this.prisma.mappingData.findUnique({
        where: { id: Number(Id) },
      });

      const MapName = `${userToCopy.name}__${generateRandomWord()}`;
      const createClone = await this.prisma.mappingData.create({
        data: {
          name: MapName,
          mainTable: userToCopy.mainTable,
          mapping: userToCopy.mapping,
          filePath: userToCopy.filePath,
          status: userToCopy.status,
          action: userToCopy.action,
          ...{
            created_at: new Date(),
            isDeleted: false,
          },
        },
      });
      return { cloneData: createClone, message: 'clone created successfully' };
    } catch (error) {
      return { message: 'Facing Problem To Fetch Data', error: error.message };
    }
  }

  async updateMapDataById(Id: any, Data: any) {
    console.log(`Id : ${Id}, Data : ${Data}`);
    // Check if the map data exists
    const existingMap = await this.prisma.mappingData.findUnique({
      where: { id: Number(Id) },
    });

    if (!existingMap) {
      return { message: `Map with ID ${Id} not found.` };
    }
    // Update the map data
    try {
      const updatedMap = await this.prisma.mappingData.update({
        where: { id: Number(Id) },
        data: {
          name: Data.name,
          mainTable: Data.mainTable,
          mapping: Data.mapping,
          filePath: Data.filePath,
          status: Data.status,
          action: Data.action,
          ...{
            updated_at: new Date(),
            isDeleted: false,
          },
        },
      });
      const countExcelRows = (await this.readExcelFile(Data.filePath)).length;
      // IMMEDIATE_ROWS_TO_PROCESS
      const IMMEDIATE_ROWS_TO_PROCESS =
        this.configService.get<number>('IMMEDIATE_ROWS_TO_PROCESS') || 10000;
      if (countExcelRows > IMMEDIATE_ROWS_TO_PROCESS) {
        await this.jobsService.sendDataToJob({
          mapId: updatedMap.id,
          status: 'PENDING',
        });
        return { errorCode: 'NO_ERROR' };
      }
      // process contact rows immediately
      const status = await this.jobsService.ProcessContactRowsImmediately(
        updatedMap.id,
      );

      if (status.errorCode === 'NO_ERROR') {
        const emailBody = {
          transactional_message_id: 96,
          to: 'bhagirathsingh@keenagile.com',
          from: 'support@itadusa.com',
          subject: 'Contact Import Summary',
          identifiers: {
            email: 'bhagirathsingh@keenagile.com',
          },
          message_data: {
            total_records: status.TotalRecords,
            inserted_records: status.created,
            error_url: `${process.env.APP_URL}/${status.OutputValue.error_url}`,
            success_url: `${process.env.APP_URL}/${status.OutputValue.success_url}`,
            updated_records: status.updated,
            exist_records: '100',
            header_content:
              'Your Contact Data Import process has been completed, please check the details below: ',
            // err_url: status.OutputValue.',
          },
          disable_message_retention: false,
          send_to_unsubscribed: true,
          tracked: true,
          queue_draft: false,
          disable_css_preprocessing: true,
        };

        console.log('status.OutputValue----', status.OutputValue.error_url);

        this.configService.get<boolean>('SEND_EMAIL_AFTER_UPLOAD') &&
          (await this.mailService.sendUserConfirmation(
            emailBody,
            'Contact Upload Completed',
          ));
        console.log('Email Sent ');
      }

      return updatedMap;
    } catch (error) {
      console.log(error);
      return { message: 'Facing Problem To Update Data', error: error.message };
    }
  }
}
