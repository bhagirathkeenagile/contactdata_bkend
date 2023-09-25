import { Injectable, Logger, Get, Res } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { CreateJobDto } from './dtos/create-job.dto';
import { Jobs } from '@prisma/client';
import { ExcelService } from 'src/excel/excel.service';
import { Cron, CronExpression } from '@nestjs/schedule';
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
  private readonly logger = new Logger(JobsService.name);
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
      console.log('Start Time', new Date());
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

      // console.log('accountsFields', accountsFields, contactsFields);
      const readExcelFile = await this.excelService.readExcelFile(map.filePath);
      // console.log('readExcelFile', {
      //   accountsFields,
      //   contactsFields,
      // });

      const totalRows = readExcelFile.length;
      let TotalRecords = 0;
      const contactsData_new = [];
      const accountsData_new = [];
      const accountsMap = new Map<string, any>();
      const contactsDatawithAccount = [];
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

          for (const key in accountsData) {
            if (accountsData.hasOwnProperty(key)) {
              // Check if key is 'DOZISF__ZoomInfo_Id__c'

              if (key === 'BillingPostalCode') {
                accountsData[key] = String(accountsData[key]);
              }
              if (key === 'DOZISF__ZoomInfo_Id__c') {
                accountsData[key] = String(accountsData[key]);
              }
              if (key === 'BillingStreet') {
                accountsData[key] = String(accountsData[key]);
              }
            }
          }
          accountsData_new.push(accountsData);

          if (!accountsMap.has(accountsData['Name'])) {
            const account = accountsData;
            accountsMap.set(accountsData['Name'], account);
          }
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

          contactsFields.forEach((field) => {
            const cleanedColumnName = field.columnName.replace(
              /\s+\(required\)$/,
              '',
            );
          });

          /**
           * Convert type to String of Postal Code
           */

          for (const key in contactsData) {
            if (contactsData.hasOwnProperty(key)) {
              // Check if key is 'DOZISF__ZoomInfo_Id__c'
              if (key === 'DOZISF__ZoomInfo_Id__c') {
                contactsData[key] = String(contactsData[key]);
              }
              if (key === 'Quickmail_Tags__c') {
                contactsData[key] = String(contactsData[key]);
              }
              if (key === 'BillingPostalCode') {
                contactsData[key] = String(contactsData[key]);
              }
              if (key === 'MailingPostalCode') {
                contactsData[key] = String(contactsData[key]);
              }
            }
          }

          // console.log('contactsDatacontactsData->>', contactsData);
          contactsData['AccountName'] = accountsData['Name'];

          contactsData_new.push(contactsData);
          // contactsData.push(contactsData,Name:accountsData['Name']);

          contactsDatawithAccount.push(contactsData);

          if (
            map.action === 'Update__1' ||
            map.action === 'Insert And Update__1'
          ) {
            try {
              // console.log('contactsData', contactsData);

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

      /**
       * New Bulk Code for Insert and Update
       */
      console.log('Map Action', map.action);
      let errorString = '';
      if (map.action === 'Update' || map.action === 'Insert And Update') {
        console.log('Insert And Update Query Start Time', new Date());

        const allAccounts = await this.prisma.accounts.findMany();

        const AllaccountsMap = new Map<string, any>();
        const bulkAccountToInsert = [];
        const bulkAccountToUpdate = [];
        const allAccountIds = [];
        const accountPromises = [];
        for (const account of allAccounts) {
          AllaccountsMap.set(account.Name, account);
          allAccountIds.push(account.id);
        }
        for (const accountData_new of accountsData_new) {
          if (AllaccountsMap.get(accountData_new.Name)) {
            accountData_new['id'] = AllaccountsMap.get(accountData_new.Name).id;
            bulkAccountToUpdate.push(accountData_new);
          } else {
            bulkAccountToInsert.push(accountData_new);
          }
        }
        console.log('bulkAccountToInsert Start...');
        console.log(
          'bulkAccountToInsert Length...',
          bulkAccountToInsert.length,
        );

        if (bulkAccountToInsert.length > 0) {
          for (let i = 0; i < bulkAccountToInsert.length; i += 50) {
            const batchToInsert = bulkAccountToInsert.slice(i, i + 50);
            console.log('Insert Loop Start--', i);
            try {
              //console.log('batchToInsert--', batchToInsert);
              const InsertStatus = accountPromises.push(
                await this.prisma.accounts.createMany({
                  data: batchToInsert,
                }),
              );
            } catch (err) {
              console.log('Account Error-', err.message);
              errorString += err.message + '<br>';
              errorContactsData.push(batchToInsert);
            }
          }
        }
        console.log('bulkAccountToInsert End');
        created = bulkAccountToInsert.length;
        updated = bulkAccountToUpdate.length;
        //  console.log('bulkAccountToUpdate Start...');
        //  console.log('Check-1', new Date());
        if (bulkAccountToUpdate.length > 0) {
          try {
            //  console.log('Check-2');
            const batchSize = 50;
            let startIndex = 0;

            while (startIndex < bulkAccountToUpdate.length) {
              //  console.log('Check-3');
              const endIndex = Math.min(
                startIndex + batchSize,
                bulkAccountToUpdate.length,
              );
              // console.log('Check-4');
              const batch = bulkAccountToUpdate.slice(startIndex, endIndex);

              // let combinedQuery;
              try {
                let combinedQuery = '';

                let ctr = 0;
                console.log('COunt of Batch -', batch.length);
                for (const record of batch) {
                  const { id, ...updateFields } = record;
                  const idsToUpdate = batch.map((record) => record.id);
                  // console.log('Check-8', new Date());

                  const updateFieldsString = Object.keys(updateFields)
                    .filter((key) => key !== 'id')
                    .map((key) => `${key} = '${updateFields[key]}'`)
                    .join(', ');

                  const updateQuery = `
                    UPDATE accounts
                    SET
                      ${updateFieldsString}
                    WHERE id = ${id};
                  `;
                  // const updateFieldsString = Object.keys(updateFields)
                  //   .filter((key) => key !== 'id')
                  //   .map((key) => {
                  //     if (typeof updateFields[key] === 'string') {
                  //       return `${key} = '${updateFields[key].replace(
                  //         /'/g,
                  //         "''",
                  //       )}'`;
                  //     } else {
                  //       return `${key} = ${updateFields[key]}`;
                  //     }
                  //   })
                  //   .join(', ');

                  // const updateQuery = `
                  //   UPDATE accounts
                  //   SET
                  //   ${updateFieldsString}
                  //   WHERE id = ${id};
                  //   `;

                  //  console.log('Check-9', new Date());

                  combinedQuery += updateQuery + '\n';
                  //  console.log('combinedQuery-', combinedQuery);
                }
                console.log('For loop end');

                // Now combinedQuery contains all the update queries joined together

                //  console.log('combinedQuery---', combinedQuery);

                const result = await this.prisma.$queryRawUnsafe(combinedQuery);
                console.log('Check-10', new Date());
                console.log(`Committed updates for ${batch.length} records.`);
              } catch (error) {
                console.error('Transaction error:', error);
                errorString += error.message + '<br>';
                throw error; // Handle or log the error as needed
              }

              startIndex += batchSize;
            }
            await this.prisma.$disconnect();
          } catch (err) {
            console.log(err.message);
            // return;
          }
        }
        console.log('bulkAccountToUpdate End');
        /** Contact Process start from here */
        console.log('Contact Process start...');
        const allContacts = await this.prisma.contact.findMany();
        const allNewAccounts = await this.prisma.accounts.findMany();
        const AllNewaccountsMap = new Map<string, any>();
        for (const account of allNewAccounts) {
          AllNewaccountsMap.set(account.Name, account);
        }

        const AllcontactsMap = new Map<string, any>();
        const bulkContactToInsert = [];
        const bulkContactToUpdate = [];
        const allContactIds = [];

        for (const contact of allContacts) {
          AllcontactsMap.set(contact.Email, contact);
          allContactIds.push(contact.id);
        }
        console.log('contactsData_new Length-', contactsData_new.length);
        for (const contactData_new of contactsData_new) {
          if (AllNewaccountsMap.get(contactData_new.AccountName)) {
            contactData_new['AccountId'] = AllNewaccountsMap.get(
              contactData_new.AccountName,
            ).id;
          }

          if (AllcontactsMap.get(contactData_new.Email)) {
            contactData_new['id'] = AllcontactsMap.get(
              contactData_new.Email,
            ).id;
            bulkContactToUpdate.push(contactData_new);
          } else {
            bulkContactToInsert.push(contactData_new);
          }
        }
        console.log('bulkContactToInsert Start...');
        console.log('bulkContactToInsert Length-', bulkContactToInsert.length);

        if (bulkContactToInsert.length > 0) {
          const contactPromises = [];
          for (let i = 0; i < bulkContactToInsert.length; i += 50) {
            const batchToInsert = bulkContactToInsert.slice(i, i + 50);
            try {
              //console.log('batchToInsert--', batchToInsert);

              const modifiedBatch = batchToInsert.map((item) => {
                const { AccountName, ...rest } = item; // Destructure AccountName and get the rest of the object
                return rest; // Return the modified object without AccountName
              });
              //  console.log('modifiedBatch--', modifiedBatch);
              const InsertStatus = contactPromises.push(
                await this.prisma.contact.createMany({
                  data: modifiedBatch,
                }),
              );
            } catch (err) {
              console.log('ERRRRR-', err.message);
              errorString += err.message + '<br>';

              errorContactsData.push(batchToInsert);
            }
          }
        }
        console.log('bulkContactToUpdate Start...');
        console.log('bulkContactToUpdate Length-', bulkContactToUpdate.length);
        // update contacts start from here
        if (bulkContactToUpdate.length > 0) {
          try {
            const batchSize = 100;
            let startIndex = 0;
            // console.log('While-1');
            while (startIndex < bulkContactToUpdate.length) {
              //  console.log('While-2');
              const endIndex = Math.min(
                startIndex + batchSize,
                bulkContactToUpdate.length,
              );
              //  console.log('While-3');
              const batch = bulkContactToUpdate.slice(startIndex, endIndex);

              try {
                //  await this.prisma.$transaction(
                //  async (transaction) => {
                //  console.log('While-4');
                let combinedQuery = '';
                for (const record of batch) {
                  //  console.log('While-5');
                  const { id, AccountName, ...updateFields } = record; // Destructure AccountName and get the rest of the object
                  const idsToUpdate = batch.map((record) => record.id);
                  //  console.log('updateFields---', updateFields);

                  const updateFieldsString = Object.keys(updateFields)
                    .filter((key) => key !== 'id')
                    .map((key) => `${key} = '${updateFields[key]}'`)
                    .join(', ');

                  const updateQuery = `
                    UPDATE Contact
                    SET
                      ${updateFieldsString}
                    WHERE id = ${id};
                  `;

                  // const updateFieldsString = Object.keys(updateFields)
                  //   .filter((key) => key !== 'id')
                  //   .map(
                  //     (key) =>
                  //       `${key} = '${updateFields[key].replace(/'/g, "''")}'`,
                  //   )
                  //   .join(', ');

                  // const updateQuery = `
                  // UPDATE Contact
                  // SET
                  // ${updateFieldsString}
                  // WHERE id = ${id};
                  // `;

                  combinedQuery += updateQuery + '\n';
                }
                //console.log('combinedQuery---', combinedQuery);
                const result = await this.prisma.$queryRawUnsafe(combinedQuery);

                console.log(
                  `Committed updates Contact for ${batch.length} records.`,
                );
              } catch (error) {
                console.error('Transaction error:', error);
                errorString += error.message + '<br>';
                throw error; // Handle or log the error as needed
              }

              startIndex += batchSize;
            }

            //  await this.prisma.$disconnect();

            // console.log('updateAccounts--', updateFields);
          } catch (err) {
            console.log(err.message);
            // return;
          }
        }

        console.log('bulkAccountToUpdate-->', bulkAccountToUpdate.length);
        console.log('bulkAccountToInsert-->', bulkAccountToInsert.length);
      }

      /**
       * New Bulk test insert code start frm here
       */
      if (map.action === 'Insert Only' || map.action === 'Insert') {
        const accountsToInsert = Array.from(accountsMap.values());

        const accountPromises = [];
        for (let i = 0; i < accountsToInsert.length; i += 100) {
          const batchToInsert = accountsToInsert.slice(i, i + 100);
          try {
            const InsertStatus = accountPromises.push(
              await this.prisma.accounts.createMany({
                data: batchToInsert,
              }),
            );
          } catch (err) {
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
            // errorContactsData.push(batchToInsert);
          }
        }

        /**
         * make map of aCCOUNT id with Name
         */
        const allAccounts = await this.prisma.accounts.findMany();
        const AllaccountsMap = new Map<string, any>();
        for (const account of allAccounts) {
          AllaccountsMap.set(account.Name, account.id);
        }

        const ContactDataToInsert = [];
        for (const contactDatawithAccount of contactsDatawithAccount) {
          const accountId = AllaccountsMap.get(
            contactDatawithAccount.AccountName,
          );
          contactDatawithAccount['AccountId'] = accountId;
          delete contactDatawithAccount['AccountName'];
          ContactDataToInsert.push(contactDatawithAccount);
        }

        const ContactPromises = [];
        for (let i = 0; i < ContactDataToInsert.length; i += 100) {
          const batchToInsert = ContactDataToInsert.slice(i, i + 100);
          try {
            const InsertStatus = ContactPromises.push(
              await this.prisma.contact.createMany({
                data: batchToInsert,
              }),
            );

            SuccessContactsData.push(batchToInsert);
          } catch (err) {
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
            errorContactsData.push(batchToInsert);
          }
        }
      }

      // errorContactsData.push(...errorAccountsData);

      // console.log('errorContactsData--', errorContactsData);

      const currentDate = new Date().toISOString().replace(/:/g, '-');
      const fileName = `uploads/Error_${currentDate}_map_${map.name}.csv`;
      const SuccessFileName = `uploads/Success_${currentDate}_map_${map.name}.csv`;
      OutputData['error_url'] = `jobs/${fileName}`;
      OutputData['success_url'] = `jobs/${SuccessFileName}`;
      console.log('errorString---->', errorString);

      this.writeDataToCsv(errorString, fileName);
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

  async writeDataToCsv(data: any, filePath: string) {
    if (typeof data != 'string' && data.length > 0) {
      const header = Object.keys(data[0]);
      const csvWriter = createObjectCsvWriter({
        path: filePath,
        header: header,
      });

      await csvWriter.writeRecords(data);
    } else {
      const csvWriter = createObjectCsvWriter({
        path: filePath,
        header: [{ id: 'message', title: 'Message' }],
      });
      if (data) {
        await csvWriter.writeRecords([{ message: data }]);
      } else {
        await csvWriter.writeRecords([{ message: 'No data found' }]);
      }
    }
  }

  //@Cron('45 * * * * *')
  //@Cron(CronExpression.EVERY_10_SECONDS)
  async handleCron() {
    //this.logger.debug('Called when the current second is 45');
    console.log(new Date());

    //  console.log('Start Time--', new Date());
    // console.log('cron job started-');
    // console.log('URL----', process.env.APP_URL);
    // const allQueuedJobs = await this.prisma.jobs.findMany({
    //   where: {
    //     status: 'PENDING',
    //   },
    // });
    // console.log('Pending Time--', new Date());
    // // Check if there are no queued jobs
    // if (allQueuedJobs.length === 0) {
    //   console.log('No queued jobs found.');
    //   console.log('End Start Time--', new Date());
    //   return;
    // }

    // allQueuedJobs.map(async (job) => {
    //   const updateJobStatus = await this.prisma.jobs.update({
    //     where: {
    //       id: job.id,
    //     },
    //     data: {
    //       status: 'PROCESSING',
    //     },
    //   });
    //   console.log('Start to call Method...');
    //   const status = await this.ProcessContactRowsImmediately(job.mapId);
    //   console.log('status--', status);
    //   if (status.errorCode === 'NO_ERROR') {
    //     const emailBody = {
    //       transactional_message_id: 96,
    //       to: 'bhagirathsingh@keenagile.com',
    //       from: 'support@itadusa.com',
    //       subject: 'Contact Import Summary from Backend Process',
    //       identifiers: {
    //         email: 'bhagirathsingh@keenagile.com',
    //       },
    //       message_data: {
    //         total_records: status.TotalRecords,
    //         inserted_records: status.created,
    //         updated_records: status.updated,
    //         exist_records: '100',
    //         header_content:
    //           'Your Contact Data Import process has been completed, please check the details below: ',
    //       },
    //       disable_message_retention: false,
    //       send_to_unsubscribed: true,
    //       tracked: true,
    //       queue_draft: false,
    //       disable_css_preprocessing: true,
    //     };

    //     this.configService.get<boolean>('SEND_EMAIL_AFTER_UPLOAD') &&
    //       (await this.mailService.sendUserConfirmation(
    //         emailBody,
    //         'Contact Upload Completed',
    //       ));
    //     console.log('Email Sent ');
    //   }
    //   if (status.errorCode === 'NO_ERROR') {
    //     const updateJobStatus = await this.prisma.jobs.update({
    //       where: {
    //         id: job.id,
    //       },
    //       data: {
    //         status: 'Complete',
    //       },
    //     });
    //   }
    // });
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
