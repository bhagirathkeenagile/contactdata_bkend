import { Injectable, Get, Res } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { CreateJobDto } from './dtos/create-job.dto';
import { Jobs } from '@prisma/client';
import { ExcelService } from 'src/excel/excel.service';
import { Cron } from '@nestjs/schedule';
import { MailService } from 'src/mail/mail.service';
import { ConfigService } from '@nestjs/config';
import { Console } from 'console';
import { Prisma } from '@prisma/client';
import axios from 'axios';
import { stat } from 'fs';
import { createObjectCsvWriter } from 'csv-writer';
import * as fs from 'fs';

@Injectable()
export class JobsService {
  constructor(
    private prisma: PrismaService,
    private excelService: ExcelService,
    private mailService: MailService,
    private configService: ConfigService,
  ) {}

  /**
   * This function will save jobs to database
   * @param data CreateJobDto
   * @returns Jobs
   */
  async sendDataToJob(data: CreateJobDto): Promise<Jobs> {
    return await this.prisma.jobs.create({
      data: {
        ...data,
      },
    });
  }

  async ProcessContactRowsImmediately(mapId: number): Promise<{
    errorCode: 'ERROR' | 'NO_ERROR' | 'PROCESSING_FAILED';
    message: string;
    created: any;
    updated: any;
    TotalRecords: any;
    OutputValue: any;
  }> {
    try {
      console.log('mapId', mapId);
      console.log(`Total number of rows:`);
      const map = await this.prisma.mappingData.update({
        where: {
          id: mapId,
        },
        data: {
          status: 'PROCESSING',
        },
      });
      let created = 0;
      let updated = 0;
      const errorAccountsData = [];
      const errorContactsData = [];
      const SuccessContactsData = [];
      const OutputData = [];

      //console.log('map', map.mapping);
      const accountsFields = JSON.parse(map.mapping).filter(
        (a) => a.table.toLowerCase() === 'accounts' && a.mapped === 'Mapped',
      );
      const contactsFields = JSON.parse(map.mapping).filter(
        (a) => a.table.toLowerCase() === 'contacts' && a.mapped === 'Mapped',
      );

      //  console.log('accountsFields', accountsFields, contactsFields);
      const readExcelFile = await this.excelService.readExcelFile(map.filePath);
      // console.log('readExcelFile', {
      //   accountsFields,
      //   contactsFields,
      // });

      const totalRows = readExcelFile.length;
      let TotalRecords = 0;
      //readExcelFile.map(async (row) => {
      await Promise.all(
        readExcelFile.map(async (row) => {
          // check source table
          const accountsData = {};
          accountsFields.map((field) => {
            const cleanedcolumName = field.columnName.replace(
              /\s+\(required\)$/,
              '',
            );
            // NumberOfEmployees
            accountsData[
              cleanedcolumName.charAt(0).toUpperCase() +
                cleanedcolumName.slice(1).trim()
            ] = row[field.excelHeader];
          });
          //
          const contactsData: any = {};
          contactsFields.map((field) => {
            // console.log(
            //   'field-------------------------------------------------->',
            //   field,
            // );
            const cleanedcolumName = field.columnName.replace(
              /\s+\(required\)$/,
              '',
            );
            contactsData[
              cleanedcolumName.charAt(0).toUpperCase() +
                cleanedcolumName.slice(1).trim()
            ] = ['IsWarm__c'].includes(
              cleanedcolumName.charAt(0).toUpperCase() +
                cleanedcolumName.slice(1).trim(),
            )
              ? row[field.excelHeader] === 0
                ? false
                : true
              : row[field.excelHeader];
          });
          console.log('map.action line 119 ==>', map.action);

          if (map.action === 'Insert Only' || map.action === 'Insert') {
            contactsData.insert_map_history_id = map.id;

            /**
             * check if source table is account
             * TODO @Bhagirath: Map Fields
             */
            try {
              console.log('Try INside');
              //  console.log(' contactsData:', contactsData);
              // console.log('getContactsWithoutRank:');

              const createContact = await this.prisma.contact.create({
                data: {
                  ...contactsData,
                  Account: {
                    connectOrCreate: {
                      where: {
                        Name: accountsData['Name'],
                      },
                      create: {
                        ...accountsData,
                      },
                    },
                  },
                },
              });
              SuccessContactsData.push(contactsData);
              created++;
              //  console.log('createContact->', createContact);
            } catch (error) {
              console.log('Error occurred for contactsData:', error);
              console.log('Error occurred for accountsData:', accountsData);
              errorAccountsData.push(accountsData);
              errorContactsData.push(contactsData);

              // errorContactsData.push(...errorAccountsData);

              console.log('errorContactsData--', errorContactsData);

              const currentDate = new Date().toISOString().replace(/:/g, '-');
              const fileName = `uploads/Error_${currentDate}_map_${map.name}.csv`;
              OutputData['error_url'] = `jobs/${fileName}`;
              this.writeDataToCsv(errorContactsData, fileName);

              if (error instanceof Prisma.PrismaClientKnownRequestError) {
                if (error.code === 'P2002') {
                  // Handle the unique constraint violation error here
                  console.error(
                    'Unique constraint violation:',
                    error.meta.target,
                  );
                }
              }
              // return {
              //   errorCode: 'ERROR',
              //   message: 'Upload Failed',
              //   created: created,
              //   updated: updated,
              //   TotalRecords: totalRows,
              // };
            }
          }
          if (map.action === 'Update' || map.action === 'Insert And Update') {
            try {
              console.log('contactsData', contactsData);

              const upsertResult = await this.prisma.contact.upsert({
                where: {
                  contactIdentifier: {
                    Email: contactsData['Email'], // Replace with the actual field names
                    LastName: contactsData['LastName'], // Replace with the actual field names
                    FirstName: contactsData['FirstName'], // Replace with the actual field names
                  },
                },
                update: {
                  ...contactsData,
                  Account: {
                    // Update the related Account data
                    update: {
                      ...accountsData,
                    },
                  },
                },
                create: {
                  ...contactsData,
                  Account: {
                    connectOrCreate: {
                      where: {
                        Name: accountsData['Name'],
                      },
                      create: {
                        ...accountsData,
                      },
                    },
                  },
                },
              });
              SuccessContactsData.push(contactsData);
              if (upsertResult.id !== undefined) {
                //  created++; // If 'id' is present, a new record was created
              } else if (upsertResult.updated_at !== undefined) {
                updated++; // If 'updated_at' is present, an existing record was updated
              }
              updated++;
            } catch (error) {
              console.log('Error occurred for contactsData:', contactsData);
              console.log('Error occurred for accountsData:', accountsData);
              console.error('Unique constraint violation:', error);
              errorAccountsData.push(accountsData);
              errorContactsData.push(contactsData);
              /**
               * Email code start from here
               */

              if (error instanceof Prisma.PrismaClientKnownRequestError) {
                if (error.code === 'P2002') {
                  // Handle the unique constraint violation error here
                  console.error(
                    'Unique constraint violation:',
                    error.meta.target,
                  );
                }
              }
              return {
                errorCode: 'ERROR',
                message: 'Upload Failed',
                created: created,
                updated: updated,
                TotalRecords: totalRows,
                OutputValue: null,
              };
            }
          }
          TotalRecords++;
        }),
      );
      // console.log('errorAccountsData--', errorAccountsData);

      // errorContactsData.push(...errorAccountsData);

      console.log('errorContactsData--', errorContactsData);

      const currentDate = new Date().toISOString().replace(/:/g, '-');
      const fileName = `uploads/Error_${currentDate}_map_${map.name}.csv`;
      const SuccessFileName = `uploads/Success_${currentDate}_map_${map.name}.csv`;
      OutputData['error_url'] = `jobs/${fileName}`;
      OutputData['success_url'] = `jobs/${SuccessFileName}`;

      this.writeDataToCsv(errorContactsData, fileName);
      this.writeDataToCsv(SuccessContactsData, SuccessFileName);

      return {
        errorCode: 'NO_ERROR',
        message: 'Data Uploaded Successfully!',
        created: created,
        updated: updated,
        TotalRecords: totalRows,
        OutputValue: OutputData,
      };
    } catch (err) {
      console.log('errorCode' + err);

      const emailBody = {
        transactional_message_id: 96,
        to: 'bhagirathsingh@keenagile.com',
        from: 'support@itadusa.com',
        subject: 'Contact Import Summary',
        identifiers: {
          email: 'bhagirathsingh@keenagile.com',
        },
        message_data: {
          total_records: 0,
          inserted_records: 0,
          updated_records: 0,
          exist_records: '100',
          header_content: `Import process has been failed, and we found this error: ${err.message}`,
        },
      };

      this.configService.get<boolean>('SEND_EMAIL_AFTER_UPLOAD') &&
        (await this.mailService.sendUserConfirmation(
          emailBody,
          'Contact Upload Completed',
        ));

      return {
        errorCode: 'ERROR',
        message: 'Something went wrong',
        created: 0,
        updated: 0,
        TotalRecords: 0,
        OutputValue: null,
      };
    }
  }

  @Get()
  async writeDataToCsv(data: any[], filePath: string) {
    const header = Object.keys(data[0]);
    const csvWriter = createObjectCsvWriter({
      path: filePath,
      header: header,
    });

    await csvWriter.writeRecords(data);
  }

  @Cron('0 * * * * *')
  async handleCron() {
    console.log('cron job started');
    console.log('URL----', process.env.APP_URL);
    const allQueuedJobs = await this.prisma.jobs.findMany({
      where: {
        status: 'PENDING',
      },
    });
    // Check if there are no queued jobs
    if (allQueuedJobs.length === 0) {
      console.log('No queued jobs found.');
      return;
    }
    allQueuedJobs.map(async (job) => {
      const status = await this.ProcessContactRowsImmediately(job.mapId);
      console.log('status--', status);
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

  // @Cron('0 0 0 * * *')
  async handleScoreCron() {
    await this.createRankOnTitle();
    //
  }

  async createRankOnTitle() {
    const getContactsWithoutRank = await this.prisma.contact.findMany({
      where: {
        Title: { not: null },
      },
    });
    getContactsWithoutRank.map(async (contact) => {
      const title = contact.Title;
      const joiningDate = contact.created_at;
      const titleScore = await this.matchCriteriaRules(title, joiningDate);
      // console.log('titleScore', titleScore);
      await this.prisma.contact.update({
        where: {
          id: contact.id,
        },
        data: {
          Title_Score__c: titleScore,
        },
      });
    });
  }

  async matchCriteriaRules_old(
    title: string,
    joiningDate: string | Date,
  ): Promise<number> {
    const criteria = title.split(' ');
    let score = 0;
    let matchedScore = [];
    criteria.map((c, index) => {
      /*   if (this.matchDepartment(c)) {
           matchedScore.push('DEPARTMENT_MATCHED');
         }
         if (this.matchTitle(c)) {
           matchedScore.push('TILE_MATCHED');
         }
         if (this.matchTopPost(c)) {
           matchedScore.push('POST_MATCHED');
         }
         *
          * Since this is last index here we will calculate score based on matched criteria
          */
      if (index === criteria.length - 1) {
        // last index
        if (
          matchedScore.includes('DEPARTMENT_MATCHED') &&
          matchedScore.includes('TITLE_MATCHED')
        ) {
          score = score + 70;
          const getJoinedTime = this.getDuration(joiningDate, new Date());
          if (getJoinedTime > 365 && getJoinedTime < 365 * 2) {
            /**
             * @bhagirath Please add score to calculate score if joined date is between 1 to 2 years
             */
            score = score + 15;
          }
          if (getJoinedTime > 365 * 2 && getJoinedTime < 365 * 3) {
            /**
             * @bhagirath Please add score to calculate score if joined date is between 2 to 3 years
             */
            score = score + 10;
          }
          if (getJoinedTime > 365 * 3) {
            /**
             * @bhagirath Please add score to calculate if joined date is more than 3 years
             */
            score = score + 5;
          }
        }
        if (
          matchedScore.includes('DEPARTMENT_MATCHED') ||
          matchedScore.includes('TITLE_MATCHED')
        ) {
          score = score + 55;
          const getJoinedTime = this.getDuration(joiningDate, new Date());
          if (getJoinedTime > 365 && getJoinedTime < 365 * 2) {
            /**
             * @bhagirath Please add score to calculate score if joined date is between 1 to 2 years
             */
            score = score + 15;
          }
          if (getJoinedTime > 365 * 2 && getJoinedTime < 365 * 3) {
            /**
             * @bhagirath Please add score to calculate score if joined date is between 2 to 3 years
             */
            score = score + 10;
          }
          if (getJoinedTime > 365 * 3) {
            /**
             * @bhagirath Please add score to calculate if joined date is more than 3 years
             */
            score = score + 5;
          }
        }
        if (matchedScore.includes('POST_MATCHED')) {
          score = score + 75;

          const getJoinedTime = this.getDuration(joiningDate, new Date());
          if (getJoinedTime > 365 && getJoinedTime < 365 * 2) {
            /**
             * @bhagirath Please add score to calculate score if joined date is between 1 to 2 years
             */
            score = score + 15;
          }
          if (getJoinedTime > 365 * 2 && getJoinedTime < 365 * 3) {
            /**
             * @bhagirath Please add score to calculate score if joined date is between 2 to 3 years
             */
            score = score + 10;
          }
          if (getJoinedTime > 365 * 3) {
            /**
             * @bhagirath Please add score to calculate if joined date is more than 3 years
             */
            score = score + 5;
          }
        }
      }
    });
    return score;
  }
  async matchCriteriaRules(
    title: string,
    joiningDate: string | Date,
  ): Promise<number> {
    const criteria = title.split(' ');
    // console.log(criteria)
    let score = 0;
    let matchedScore = [];
    criteria.map((c, index) => {
      if (this.titleset1(c)) {
        matchedScore.push('titleset1');
      }
      if (this.titleset2(c)) {
        matchedScore.push('titleset2');
      }
      if (this.titleset3(c)) {
        matchedScore.push('titleset3');
      }
      if (this.titleset4(c)) {
        matchedScore.push('titleset4');
      }
      /**
       * Since this is last index here we will calculate score based on matched criteria
       */
      if (index === criteria.length - 1) {
        // last index
        if (
          (matchedScore.includes('titleset1') &&
            matchedScore.includes('titleset2')) ||
          matchedScore.includes('titleset3')
        ) {
          //  console.log(matchedScore);
          score = score + 75;
        } else if (
          matchedScore.includes('titleset2') &&
          matchedScore.includes('titleset4')
        ) {
          score = score + 56.25;
        } else if (
          matchedScore.includes('titleset1') ||
          matchedScore.includes('titleset2')
        ) {
          score = score + 18.75;
        }
        const getJoinedTime = this.getDuration(joiningDate, new Date());
        console.log('getJoinedTime', joiningDate);
        if (getJoinedTime <= 365) {
          score = score + 20;
        } else if (getJoinedTime > 365 && getJoinedTime < 365 * 2) {
          score = score + 12.5;
        }
      }
    });
    return score;
  }

  /**
   * Match Department based on criteria
   * @bhagirath Add more departments here
   * @param str string
   * @returns boolean
   */
  titleset2(str: string) {
    return [
      'data center',
      'datacenter',
      'it',
      'technology',
      'storage',
      'infrastructure',
      'computer',
      'asset',
      'help desk',
    ].includes(str);
  }
  /**
   * Match Title based on criteria
   * @bhagirath Add more Titles here
   * @param str string
   * @returns boolean
   */
  titleset1(str: string) {
    return [
      'Manager',
      'mgr',
      'director',
      'vp',
      'vice president',
      'chief',
      'cio',
      'cto',
      'chief information officer',
      'chief technology officer',
    ].includes(str);
  }
  titleset3(str: string) {
    return [
      'cio',
      'cto',
      'chief information officer',
      'chief technology officer',
    ].includes(str);
  }
  /**
   * Match Post based on criteria
   * @bhagirath Add more Posts here
   * @param str string
   * @returns boolean
   */
  titleset4(str: string) {
    return ['senior', 'lead', 'admin', 'supervisor', 'coordinator'].includes(
      str,
    );
  }

  getDuration(d1: string | Date, d2: string | Date) {
    const date1 = new Date(d1).getTime();
    const date2 = new Date(d2).getTime();
    const diffTime = Math.abs(date2 - date1);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  async getEmployeeRankings(
    employeePercentageRequest: number,
    minimumCount: number,
    filter: string,
  ): Promise<any> {
    const filterval = JSON.parse(filter);
    const employeePercentage = employeePercentageRequest / 100;
    const allContacts = await this.prisma.contact.findMany({
      where: {
        ...filterval,
      },
      select: {
        LastName: true,
        FirstName: true,
        AccountId: true,
        Email: true,
        Title: true,
        RingLead_Score__c: true,
        Account: {
          select: {
            Name: true,
            NumberOfEmployees: true,
          },
        },
      },
      orderBy: [
        {
          RingLead_Score__c: 'desc',
        },
        {
          FirstName: 'asc',
        },
      ],
    });
    console.log('allContacts :>> ', filter);
    let allContactsData = {};
    allContacts.map((contact) => {
      if (allContactsData[contact.Account.Name]) {
        contact['is_included'] = 'Excluded';
        allContactsData[contact.Account.Name]['contacts'].push(contact);
      } else {
        contact['is_included'] = 'Excluded';
        allContactsData[contact.Account.Name] = {
          name: contact.Account.Name,
          contacts: [contact],
        };
      }
    });
    for (const accountName in allContactsData) {
      const account = allContactsData[accountName];
      account.contacts.forEach((contact, index) => {
        let assa = contact.Account.NumberOfEmployees * employeePercentage;
        let calculated = assa < 1 ? 1 : assa > 3 ? 3 : Math.ceil(assa);
        contact.sequence = Math.ceil((index + 1) / calculated);
      });
    }
    const contactsArray = await this.createArrayWithContactsInOofNComplexity(
      allContactsData,
    );
    // Count the occurrences of each sequence value
    const sequenceCounts = {};
    contactsArray.forEach((item) => {
      const sequence = item.sequence;
      sequenceCounts[sequence] = (sequenceCounts[sequence] || 0) + 1;
    });

    // Update is_included based on the sequence count
    //   console.log('minimumCount -',minimumCount);
    contactsArray.forEach((item) => {
      const sequence = item.sequence;
      //      console.log('sequence -',sequence);
      //      console.log('sequenceCounts[sequence] -',sequenceCounts[sequence]);

      if (sequenceCounts[sequence] > minimumCount) {
        item.is_included = 'Included';
      }
    });

    //  write and excel file now
    return await this.excelService.writeExcelFile(
      contactsArray.map((item) => {
        return {
          'Account Name': item.Account.Name,
          'First Name': item.FirstName,
          'Last Name': item.LastName,
          Email: item.Email,
          Title: item.Title,
          'RingLead Score': item.RingLead_Score__c,
          Sequence: item.sequence,
          'Is Included': item.is_included,
        };
      }),
    );
  }

  async createArrayWithContactsInOofNComplexity(jsonData) {
    const contactsArray = [];
    const keys = Object.keys(jsonData);
    console.log(keys);
    for (const key of keys) {
      contactsArray.push(...jsonData[key].contacts);
    }
    return contactsArray;
  }
}
