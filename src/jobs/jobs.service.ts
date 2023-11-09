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
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { join } from 'path';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  constructor(
    private prisma: PrismaService,
    private excelService: ExcelService,
    private mailService: MailService,
    private configService: ConfigService,
    private eventEmitter: EventEmitter2,
  ) {}

  emitEvent() {
    this.eventEmitter.emit('msg.sent', this.newevent());
  }
  newevent() {
    return 'This is new test from method';
  }

  @OnEvent('msg.sent')
  listentToEvent(msg: string) {
    console.log('Message Received: ', msg);
  }

  /**
   * This function will save jobs to database
   * @param data CreateJobDto
   * @returns Jobs
   */
  async sendDataToJob(data: CreateJobDto): Promise<Jobs> {
    const returndata = await this.prisma.jobs.create({
      data: {
        ...data,
      },
    });
    this.handleCron();
    return returndata;
  }

  async sendDataToJobforEmail(dataVal: any) {
    const data = await this.getEmployeeRankings(
      dataVal.employeePercentageRequest,
      dataVal.minimumCount,
      dataVal.filterval,
      dataVal.numberOfRecords,
      dataVal.emailContact,
    );

    const file = fs.createReadStream(join(process.cwd(), 'uploads', data));
    const fileStats = fs.statSync(file.path);
    // res.setHeader('Content-Length', fileStats.size);
    // res.setHeader(
    //   'Content-Type',
    //   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    // );
    // res.setHeader('Content-Disposition', `attachment; filename=${data}`);
    const fileStream = fs.createReadStream(file.path);
    console.log('File Path', file.path);

    const publicUrl = `${process.env.APP_URL}/jobs/uploads/${data}`;

    /**Email code start from here */

    const emailBody = {
      transactional_message_id: 97,
      to: 'bhagirathsingh@keenagile.com',
      from: 'support@itadusa.com',
      subject: 'Contact Export Summary',
      identifiers: {
        email: 'bhagirathsingh@keenagile.com',
      },
      message_data: {
        error_url_act: publicUrl,
        total_records: data.numberOfRecords,
        header_content:
          'Your Contact Data Export process has been completed, please check the details below: ',
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
        'Contact Export Completed',
      ));

    //return new StreamableFile(fileStream);
  }

  async sendDataToJobforIds(
    data: CreateJobDto,
    contactIds: number[],
  ): Promise<Jobs> {
    try {
      const chunkSize = 1000; // Set an appropriate chunk size based on your database's limitations
      for (let i = 0; i < contactIds.length; i += chunkSize) {
        const chunk = contactIds.slice(i, i + chunkSize);

        console.log('chunkchunk--', i);
        const updateContactStatus = await this.prisma.contact.updateMany({
          where: {
            id: {
              in: chunk,
            },
          },
          data: {
            export_status: 'Included',
          },
        });
      }
    } catch (error) {
      console.error('Error updating  data:', error);
    }

    return null;
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
      let acnt_inserted = 0;
      let acnt_updated = 0;
      let acnt_failed = 0;
      let cnt_inserted = 0;
      let cnt_updated = 0;
      let cnt_failed = 0;
      const errorAccountsData = [];
      const errorContactsData = [];
      const SuccessContactsData = [];
      const SuccessAccountsData = [];
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

      const totalRows = readExcelFile.length;
      let TotalRecords = 0;
      const contactsData_new = [];
      const accountsData_new = [];
      const accountsMap = new Map<string, any>();

      const contactsDatawithAccount = [];
      const excelFileMap = new Map<string, any>();
      const excelFileMapContacts = new Map<string, any>();
      await Promise.all(
        readExcelFile.map(async (row, index) => {
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
          accountsData['acnt_key'] = accountsData['Name'] + '_' + index;

          excelFileMap.set(accountsData['Name'] + '_' + index, row);

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
              if (key === 'Name') {
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
          excelFileMapContacts.set(
            contactsData['FirstName'] +
              '_' +
              contactsData['LastName'] +
              '_' +
              contactsData['Email'] +
              '_' +
              index,
            row,
          );
          contactsData['cnt_key'] =
            contactsData['FirstName'] +
            '_' +
            contactsData['LastName'] +
            '_' +
            contactsData['Email'] +
            '_' +
            index;

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
              if (key === 'DOZISF__ZoomInfo_Company_ID__c') {
                contactsData[key] = String(contactsData[key]);
              }
            }
          }

          // console.log('contactsDatacontactsData->>', contactsData);
          contactsData['AccountName'] = accountsData['Name'];

          contactsData_new.push(contactsData);
          // contactsData.push(contactsData,Name:accountsData['Name']);

          contactsDatawithAccount.push(contactsData);
          // make excel map

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

        const bulkAccountToInsert = [];
        const bulkAccountToUpdate = [];
        const uniqueData = [];

        accountsData_new.forEach((item) => {
          if (!uniqueData[item.Name]) {
            uniqueData[item.Name] = item;
          }
        });

        const result = Object.values(uniqueData);
        console.log('result count ', result.length);
        const AccountNameBatchSize = 20; // Set the batch size
        const AllaccountsMap = new Map<string, any>();
        for (let i = 0; i < result.length; i += AccountNameBatchSize) {
          const batch = result.slice(i, i + AccountNameBatchSize);
          const AccountNames = batch.map((account) => account.Name);

          const allAccounts = await this.prisma.accounts.findMany({
            select: {
              id: true,
              Name: true,
            },
            where: {
              Name: {
                in: AccountNames,
              },
            },
          });

          const accountLookup = {};

          for (const account of allAccounts) {
            accountLookup[account.Name] = account.id;
            AllaccountsMap.set(account.Name, account);
          }
          console.log('Count of loop start from =', i);
        }
        for (let i = 0; i < result.length; i += AccountNameBatchSize) {
          const batch = result.slice(i, i + AccountNameBatchSize);
          const AccountNames = batch.map((account) => account.Name);
          console.log('batch--', batch.length);
          for (const account of batch) {
            if (AllaccountsMap.get(account.Name)) {
              account['id'] = AllaccountsMap.get(account.Name).id;
              bulkAccountToUpdate.push(account);
            } else {
              bulkAccountToInsert.push(account);
            }
          }
        }

        // const allAccounts = await this.prisma.accounts.findMany({
        //   select: {
        //     id: true,
        //     Name: true,
        //   },
        // });
        // const AllaccountsMap = new Map<string, any>();
        // const bulkAccountToInsert = [];
        // const bulkAccountToUpdate = [];
        // const allAccountIds = [];
        const accountPromises = [];
        // for (const account of allAccounts) {
        //   AllaccountsMap.set(account.Name, account);
        //   allAccountIds.push(account.id);
        // }

        // const uniqueData = [];

        // accountsData_new.forEach((item) => {
        //   if (!uniqueData[item.Name]) {
        //     uniqueData[item.Name] = item;
        //   }
        // });

        // const result = Object.values(uniqueData);

        // for (const accountData_new of result) {
        //   if (AllaccountsMap.get(accountData_new.Name)) {
        //     accountData_new['id'] = AllaccountsMap.get(accountData_new.Name).id;
        //     bulkAccountToUpdate.push(accountData_new);
        //   } else {
        //     bulkAccountToInsert.push(accountData_new);
        //   }
        // }
        console.log('bulkAccountToInsert Start...');
        console.log(
          'bulkAccountToInsert Length...',
          bulkAccountToInsert.length,
        );

        if (bulkAccountToInsert.length > 0) {
          for (let i = 0; i < bulkAccountToInsert.length; i += 50) {
            const batchToInsert = bulkAccountToInsert.slice(i, i + 50);
            const batchToInsert_data = bulkAccountToInsert
              .slice(i, i + 50)
              .map(({ acnt_key, ...rest }) => rest);

            console.log('Insert Loop Start--', i);
            try {
              //console.log('batchToInsert--', batchToInsert);
              const InsertStatus = accountPromises.push(
                await this.prisma.accounts.createMany({
                  data: batchToInsert_data,
                }),
              );
              for (const record of bulkAccountToInsert) {
                SuccessAccountsData.push(excelFileMap.get(record.acnt_key));
              }
              acnt_inserted += batchToInsert.length;
            } catch (err) {
              errorString += err.message + '<br>';

              for (const record of batchToInsert) {
                const { acnt_key, ...rest } = record;
                try {
                  await this.prisma.accounts.create({
                    data: rest,
                  });
                  SuccessAccountsData.push(excelFileMap.get(record.acnt_key));
                } catch (err) {
                  console.log('ERRRRRRR--', err.message);

                  const ErrorRow = excelFileMap.get(record.acnt_key);
                  if (err instanceof Prisma.PrismaClientValidationError) {
                    // Handle Prisma client validation error
                    const startIndex = err.message.indexOf('})') + 2;
                    const extractedMessage = err.message.substring(startIndex);
                    const cleanedString = extractedMessage.replace(/\n/g, '');
                    ErrorRow[
                      'Error_message'
                    ] = `Validation error: ${cleanedString}`;
                  } else if (
                    err instanceof Prisma.PrismaClientKnownRequestError
                  ) {
                    if (err.code === 'P2002') {
                      ErrorRow[
                        'Error_message'
                      ] = `Duplicate field value: ${err.meta.target}`;
                    } else if (err.code === 'P2003') {
                      ErrorRow[
                        'Error_message'
                      ] = `Invalid input data: ${err.meta.target}`;
                    } else {
                      ErrorRow['Error_message'] = err.message;
                    }
                  }
                  acnt_failed++;
                  errorAccountsData.push(ErrorRow);
                }
              }
            }
          }
        }

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
                  const { id, ...updateFieldss } = record;
                  const idsToUpdate = batch.map((record) => record.id);
                  // console.log('Check-8', new Date());
                  const { acnt_key, ...updateFields } = updateFieldss;

                  const updateFieldsString = Object.keys(updateFields)
                    .filter((key) => key !== 'id')
                    .map((key) => `${key} = '${updateFields[key]}'`)
                    .join(', ');

                  const updateQuery = `
                    UPDATE account_new
                    SET
                      ${updateFieldsString}
                    WHERE id = ${id};
                  `;

                  combinedQuery += updateQuery + '\n';

                  SuccessAccountsData.push(excelFileMap.get(record.acnt_key));

                  //  console.log('combinedQuery-', combinedQuery);
                }
                console.log('For loop end');

                // Now combinedQuery contains all the update queries joined together

                //  console.log('combinedQuery---', combinedQuery);

                const result = await this.prisma.$queryRawUnsafe(combinedQuery);
                acnt_updated += batch.length;
                console.log('Check-10', new Date());
                console.log(
                  `Committed Accounts updates for ${batch.length} records.`,
                );
              } catch (error) {
                for (const record of batch) {
                  const { id, acnt_key, ...updateFieldss } = record;
                  //errorAccountsData.push(record);
                  try {
                    const updateErrorAccounts =
                      await this.prisma.accounts.update({
                        where: {
                          id: id,
                        },
                        data: updateFieldss,
                      });
                  } catch (err) {
                    const ErrorRow = excelFileMap.get(record.acnt_key);
                    if (err instanceof Prisma.PrismaClientValidationError) {
                      // Handle Prisma client validation error
                      const startIndex = err.message.indexOf('})') + 2;
                      const extractedMessage =
                        err.message.substring(startIndex);
                      const cleanedString = extractedMessage.replace(/\n/g, '');
                      ErrorRow[
                        'Error_message'
                      ] = `Validation error: ${cleanedString}`;
                    } else if (
                      err instanceof Prisma.PrismaClientKnownRequestError
                    ) {
                      if (err.code === 'P2002') {
                        ErrorRow[
                          'Error_message'
                        ] = `Duplicate field value: ${err.meta.target}`;
                      } else if (err.code === 'P2003') {
                        ErrorRow[
                          'Error_message'
                        ] = `Invalid input data: ${err.meta.target}`;
                      } else {
                        ErrorRow['Error_message'] = err.message;
                      }
                    }
                    errorAccountsData.push(ErrorRow);
                  }
                }

                // const ErrorRow = excelFileMap.get(record.acnt_key);
                //   errorAccountsData.push(ErrorRow);

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
        //  console.log('errorAccountsData-->', errorAccountsData);

        // console.log('errorAccountsData-->>', errorAccountsData);

        /** Contact Process start from here */
        console.log('Contact Process start...');

        //const allNewAccounts = await this.prisma.accounts.findMany();
        const AllNewaccountsMap = new Map<string, any>();

        for (let i = 0; i < result.length; i += AccountNameBatchSize) {
          const batch = result.slice(i, i + AccountNameBatchSize);
          const AccountNames = batch.map((account) => account.Name);

          const allNewAccounts = await this.prisma.accounts.findMany({
            select: {
              id: true,
              Name: true,
            },
            where: {
              Name: {
                in: AccountNames,
              },
            },
          });

          const accountLookup = {};

          for (const account of allNewAccounts) {
            AllNewaccountsMap.set(account.Name, account);
          }
        }

        const AllcontactsMap = new Map<string, any>();
        const allContactIds = [];

        for (let i = 0; i < contactsData_new.length; i += 15) {
          const batch = contactsData_new.slice(i, i + 15);

          const emailAddresses = batch.map((contact) => contact.Email);

          const allContacts = await this.prisma.contact.findMany({
            select: {
              id: true,
              Email: true,
            },
            where: {
              Email: {
                in: emailAddresses,
              },
            },
          });

          for (const contact of allContacts) {
            AllcontactsMap.set(contact.Email, contact);
            allContactIds.push(contact.id);
          }
        }

        const bulkContactToInsert = [];
        const bulkContactToUpdate = [];

        console.log('contactsData_new Length-', contactsData_new.length);
        for (const contactData_new of contactsData_new) {
          if (AllNewaccountsMap.get(contactData_new.AccountName)) {
            contactData_new['AccountId'] = AllNewaccountsMap.get(
              contactData_new.AccountName,
            ).id;

            if (AllcontactsMap.get(contactData_new.Email)) {
              contactData_new['id'] = AllcontactsMap.get(
                contactData_new.Email,
              ).id;
              bulkContactToUpdate.push(contactData_new);
            } else {
              bulkContactToInsert.push(contactData_new);
            }
          } else {
            const errorData = excelFileMapContacts.get(contactData_new.cnt_key);
            errorData['Error_message'] =
              'Account not Inserted, there may be some issue with account';
            errorAccountsData.push(errorData);
          }
        }
        console.log('bulkContactToInsert Start...');
        console.log('bulkContactToInsert Length-', bulkContactToInsert.length);

        if (bulkContactToInsert.length > 0) {
          const contactPromises = [];
          for (let i = 0; i < bulkContactToInsert.length; i += 50) {
            const batchToInsert = bulkContactToInsert.slice(i, i + 50);
            const batchToInsert_data = bulkContactToInsert
              .slice(i, i + 50)
              .map(({ acnt_key, ...rest }) => rest);
            let modifiedBatch = [];
            try {
              //console.log('batchToInsert--', batchToInsert);

              modifiedBatch = batchToInsert_data.map((item) => {
                const { AccountName, cnt_key, ...rest } = item; // Destructure AccountName and get the rest of the object
                return rest; // Return the modified object without AccountName
              });
              //  console.log('modifiedBatch--', modifiedBatch);
              const InsertStatus = contactPromises.push(
                await this.prisma.contact.createMany({
                  data: modifiedBatch,
                }),
              );
              console.log('No of Contact Insrted-', modifiedBatch.length);
              cnt_inserted += modifiedBatch.length;
              for (const record of modifiedBatch) {
                SuccessAccountsData.push(
                  excelFileMapContacts.get(record.cnt_key),
                );
              }
            } catch (err) {
              errorString += err.message + '<br>';
              for (const record of batchToInsert) {
                const { AccountName, cnt_key, ...rest } = record;
                try {
                  await this.prisma.contact.create({
                    data: rest,
                  });

                  SuccessAccountsData.push(
                    excelFileMapContacts.get(record.cnt_key),
                  );

                  console.log('Single Record Insert-');
                } catch (err) {
                  cnt_failed++;
                  const ErrorRow = excelFileMapContacts.get(record.cnt_key);
                  if (err instanceof Prisma.PrismaClientValidationError) {
                    // Handle Prisma client validation error
                    const startIndex = err.message.indexOf('})') + 2;
                    const extractedMessage = err.message.substring(startIndex);
                    const cleanedString = extractedMessage.replace(/\n/g, '');
                    ErrorRow[
                      'Error_message'
                    ] = `Validation error: ${cleanedString}`;
                  } else if (
                    err instanceof Prisma.PrismaClientKnownRequestError
                  ) {
                    if (err.code === 'P2002') {
                      ErrorRow[
                        'Error_message'
                      ] = `Duplicate field value: ${err.meta.target}`;
                    } else if (err.code === 'P2003') {
                      ErrorRow[
                        'Error_message'
                      ] = `Invalid input data: ${err.meta.target}`;
                    } else {
                      ErrorRow['Error_message'] = err.message;
                    }
                  }
                  errorAccountsData.push(ErrorRow);
                  //  console.log('ERRRRR IN Single-', rest, err.message);
                }
              }
            }
          }
        }
        // console.log('errorAccountsData--', errorAccountsData);

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
                  const { id, AccountName, cnt_key, ...updateFields } = record; // Destructure AccountName and get the rest of the object
                  const idsToUpdate = batch.map((record) => record.id);

                  const updateFieldsString = Object.keys(updateFields)
                    .filter((key) => key !== 'id')
                    .map((key) => `${key} = '${updateFields[key]}'`)
                    .join(', ');

                  const updateQuery = `
                    UPDATE contact_new
                    SET
                      ${updateFieldsString}
                    WHERE id = ${id};
                  `;
                  const exists = SuccessAccountsData.some(
                    (contact) =>
                      contact.AccountName === record.AccountName &&
                      contact.Email === record.Email,
                  );
                  if (!exists) {
                    SuccessAccountsData.push(
                      excelFileMapContacts.get(record.cnt_key),
                    );
                  }
                  combinedQuery += updateQuery + '\n';
                }
                //  console.log('combinedQuery---', combinedQuery);
                const result = await this.prisma.$queryRawUnsafe(combinedQuery);
                cnt_updated += batch.length;
                console.log(
                  `Committed updates Contact for ${batch.length} records.`,
                );
              } catch (error) {
                for (const record of batch) {
                  const { id, AccountName, cnt_key, ...updateCntFields } =
                    record;
                  try {
                    console.log('updateCntFields', updateCntFields);
                    await this.prisma.contact.update({
                      where: {
                        id: id,
                      },
                      data: updateCntFields,
                    });

                    const exists = SuccessAccountsData.some(
                      (contact) =>
                        contact.AccountName === record.AccountName &&
                        contact.Email === record.Email,
                    );
                    if (!exists) {
                      SuccessAccountsData.push(
                        excelFileMapContacts.get(record.cnt_key),
                      );
                    }
                  } catch (err) {
                    console.log('err-', err.message);
                    cnt_failed++;
                    errorString += error.message + '<br>';
                    const ErrorRow = excelFileMapContacts.get(record.cnt_key);
                    if (err instanceof Prisma.PrismaClientValidationError) {
                      // Handle Prisma client validation error
                      const startIndex = err.message.indexOf('})') + 2;
                      const extractedMessage =
                        err.message.substring(startIndex);
                      const cleanedString = extractedMessage.replace(/\n/g, '');
                      ErrorRow[
                        'Error_message'
                      ] = `Validation error: ${cleanedString}`;
                    } else if (
                      err instanceof Prisma.PrismaClientKnownRequestError
                    ) {
                      if (err.code === 'P2002') {
                        ErrorRow[
                          'Error_message'
                        ] = `Duplicate field value: ${err.meta.target}`;
                      } else if (err.code === 'P2003') {
                        ErrorRow[
                          'Error_message'
                        ] = `Invalid input data: ${err.meta.target}`;
                      } else {
                        ErrorRow['Error_message'] = err.message;
                      }
                    }
                    errorAccountsData.push(ErrorRow);
                    console.log('Error is ', err.msg);
                  }

                  //errorContactsData.push(batch);
                }
                console.error('Transaction error:', error.message);
                errorString += error.message + '<br>';
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
        //console.log('errorContactsData-->', errorContactsData);

        console.log('bulkAccountToUpdate-->', bulkAccountToUpdate.length);
        console.log('bulkAccountToInsert-->', bulkAccountToInsert.length);
      }

      /**
       * New Bulk test insert code start frm here
       */
      if (map.action === 'Insert Only' || map.action === 'Insert') {
        console.log('Insert Only Start from here at ', new Date());

        const bulkAccountToInsert = [];
        const bulkAccountToUpdate = [];
        const uniqueData = [];

        accountsData_new.forEach((item) => {
          if (!uniqueData[item.Name]) {
            uniqueData[item.Name] = item;
          }
        });

        const result = Object.values(uniqueData);
        console.log('result count ', result.length);
        const AccountNameBatchSize = 100; // Set the batch size
        const AllaccountsMap = new Map<string, any>();
        for (let i = 0; i < result.length; i += AccountNameBatchSize) {
          const batch = result.slice(i, i + AccountNameBatchSize);
          const AccountNames = batch.map((account) => account.Name);

          const allAccounts = await this.prisma.accounts.findMany({
            select: {
              id: true,
              Name: true,
            },
            where: {
              Name: {
                in: AccountNames,
              },
            },
          });

          const accountLookup = {};

          for (const account of allAccounts) {
            accountLookup[account.Name] = account.id;
            AllaccountsMap.set(account.Name, account);
          }
          console.log('Count of loop start from =', i);
        }
        for (let i = 0; i < result.length; i += AccountNameBatchSize) {
          const batch = result.slice(i, i + AccountNameBatchSize);
          const AccountNames = batch.map((account) => account.Name);
          console.log('batch--', batch.length);
          for (const account of batch) {
            if (AllaccountsMap.get(account.Name)) {
              account['id'] = AllaccountsMap.get(account.Name).id;
              // bulkAccountToUpdate.push(account);
            } else {
              bulkAccountToInsert.push(account);
            }
          }
        }

        const accountPromises = [];

        console.log('bulkAccountToInsert Start...');
        console.log(
          'bulkAccountToInsert Length...',
          bulkAccountToInsert.length,
        );

        if (bulkAccountToInsert.length > 0) {
          for (let i = 0; i < bulkAccountToInsert.length; i += 50) {
            const batchToInsert = bulkAccountToInsert.slice(i, i + 50);
            const batchToInsert_data = bulkAccountToInsert
              .slice(i, i + 50)
              .map(({ acnt_key, ...rest }) => rest);

            console.log('Insert Loop Start--', i);
            try {
              //console.log('batchToInsert--', batchToInsert);
              const InsertStatus = accountPromises.push(
                await this.prisma.accounts.createMany({
                  data: batchToInsert_data,
                }),
              );
              for (const record of bulkAccountToInsert) {
                SuccessAccountsData.push(excelFileMap.get(record.acnt_key));
              }
              acnt_inserted += batchToInsert.length;
            } catch (err) {
              errorString += err.message + '<br>';

              for (const record of batchToInsert) {
                const { acnt_key, ...rest } = record;
                try {
                  await this.prisma.accounts.create({
                    data: rest,
                  });
                  SuccessAccountsData.push(excelFileMap.get(record.acnt_key));
                } catch (err) {
                  console.log('ERRRRRRR--', err.message);

                  const ErrorRow = excelFileMap.get(record.acnt_key);
                  if (err instanceof Prisma.PrismaClientValidationError) {
                    // Handle Prisma client validation error
                    const startIndex = err.message.indexOf('})') + 2;
                    const extractedMessage = err.message.substring(startIndex);
                    const cleanedString = extractedMessage.replace(/\n/g, '');
                    ErrorRow[
                      'Error_message'
                    ] = `Validation error: ${cleanedString}`;
                  } else if (
                    err instanceof Prisma.PrismaClientKnownRequestError
                  ) {
                    if (err.code === 'P2002') {
                      ErrorRow[
                        'Error_message'
                      ] = `Duplicate field value: ${err.meta.target}`;
                    } else if (err.code === 'P2003') {
                      ErrorRow[
                        'Error_message'
                      ] = `Invalid input data: ${err.meta.target}`;
                    } else {
                      ErrorRow['Error_message'] = err.message;
                    }
                  }
                  acnt_failed++;
                  errorAccountsData.push(ErrorRow);
                }
              }
            }
          }
        }

        created = bulkAccountToInsert.length;

        /** Contact Process start from here */
        console.log('Contact Process start...');

        //const allNewAccounts = await this.prisma.accounts.findMany();
        const AllNewaccountsMap = new Map<string, any>();

        for (let i = 0; i < result.length; i += AccountNameBatchSize) {
          const batch = result.slice(i, i + AccountNameBatchSize);
          const AccountNames = batch.map((account) => account.Name);
          console.log('AccountNames Loop...', i);
          const allNewAccounts = await this.prisma.accounts.findMany({
            select: {
              id: true,
              Name: true,
            },
            where: {
              Name: {
                in: AccountNames,
              },
            },
          });

          const accountLookup = {};

          for (const account of allNewAccounts) {
            AllNewaccountsMap.set(account.Name, account);
          }
        }

        const AllcontactsMap = new Map<string, any>();
        const allContactIds = [];

        /**code for creating temp table */

        const contactPromises = [];
        let modifiedBatch1 = [];

        const randomNumber = Math.floor(1000 + Math.random() * 9000);
        const randomString = randomNumber.toString();
        for (let i = 0; i < contactsData_new.length; i += 150) {
          const batch = contactsData_new.slice(i, i + 150);
          const emailAddresses = batch.map((contact) => contact.Email);

          try {
            const values = emailAddresses
              .map((email) => `('${email}', '${randomString}')`)
              .join(',');

            let sqlQuery = `
              INSERT INTO temp_email (email, refno)
              VALUES 
                ${values}
              ;
            `;
            //  console.log('sqlQuerysqlQuery', sqlQuery);
            const result = await this.prisma.$queryRawUnsafe(sqlQuery);

            //   console.log('Data inserted successfully:', result);
          } catch (error) {
            console.error('Error inserting data:', error);
          } finally {
            await this.prisma.$disconnect();
          }
        }

        let sqlCountQuery = `
        select * from contact_new where email IN (select email from temp_email); 
      `;
        const CountResult = (await this.prisma.$queryRawUnsafe(
          sqlCountQuery,
        )) as any[];

        for (const contact of CountResult) {
          AllcontactsMap.set(contact.Email, contact);
          // allContactIds.push(contact.id);
        }

        // for (let i = 0; i < contactsData_new.length; i += 100) {
        //   const batch = contactsData_new.slice(i, i + 100);
        //   console.log('Contact Find Loop...', i);
        //   const emailAddresses = batch.map((contact) => contact.Email);

        //   // console.log('emailAddresses', emailAddresses);

        //   const allContacts = await this.prisma.contact.findMany({
        //     select: {
        //       id: true,
        //       Email: true,
        //     },
        //     where: {
        //       Email: {
        //         in: emailAddresses,
        //       },
        //     },
        //   });

        //   for (const contact of allContacts) {
        //     AllcontactsMap.set(contact.Email, contact);
        //     // allContactIds.push(contact.id);
        //   }
        // }

        const bulkContactToInsert = [];

        console.log('contactsData_new Length-', contactsData_new.length);
        for (const contactData_new of contactsData_new) {
          if (AllNewaccountsMap.get(contactData_new.AccountName)) {
            contactData_new['AccountId'] = AllNewaccountsMap.get(
              contactData_new.AccountName,
            ).id;

            if (AllcontactsMap.get(contactData_new.Email)) {
              contactData_new['id'] = AllcontactsMap.get(
                contactData_new.Email,
              ).id;
              // bulkContactToUpdate.push(contactData_new);
            } else {
              bulkContactToInsert.push(contactData_new);
            }
          } else {
            const errorData = excelFileMapContacts.get(contactData_new.cnt_key);
            errorData['Error_message'] =
              'Account not Inserted, there may be some issue with account';
            errorAccountsData.push(errorData);
          }
        }
        console.log('bulkContactToInsert Start...');
        console.log(
          'Contact bulkContactToInsert Length-',
          bulkContactToInsert.length,
        );

        if (bulkContactToInsert.length > 0) {
          const contactPromises = [];
          for (let i = 0; i < bulkContactToInsert.length; i += 50) {
            const batchToInsert = bulkContactToInsert.slice(i, i + 50);
            const batchToInsert_data = bulkContactToInsert
              .slice(i, i + 50)
              .map(({ acnt_key, ...rest }) => rest);
            let modifiedBatch = [];
            try {
              //console.log('batchToInsert--', batchToInsert);

              modifiedBatch = batchToInsert_data.map((item) => {
                const { AccountName, cnt_key, ...rest } = item; // Destructure AccountName and get the rest of the object
                return rest; // Return the modified object without AccountName
              });
              //  console.log('modifiedBatch--', modifiedBatch);
              const InsertStatus = contactPromises.push(
                await this.prisma.contact.createMany({
                  data: modifiedBatch,
                }),
              );
              console.log('No of Contact Insrted-', modifiedBatch.length);
              cnt_inserted += modifiedBatch.length;
              for (const record of modifiedBatch) {
                SuccessAccountsData.push(
                  excelFileMapContacts.get(record.cnt_key),
                );
              }
            } catch (err) {
              errorString += err.message + '<br>';
              for (const record of batchToInsert) {
                const { AccountName, cnt_key, ...rest } = record;
                try {
                  await this.prisma.contact.create({
                    data: rest,
                  });

                  SuccessAccountsData.push(
                    excelFileMapContacts.get(record.cnt_key),
                  );

                  console.log('Single Record Insert-');
                } catch (err) {
                  cnt_failed++;
                  const ErrorRow = excelFileMapContacts.get(record.cnt_key);
                  if (err instanceof Prisma.PrismaClientValidationError) {
                    // Handle Prisma client validation error
                    const startIndex = err.message.indexOf('})') + 2;
                    const extractedMessage = err.message.substring(startIndex);
                    const cleanedString = extractedMessage.replace(/\n/g, '');
                    ErrorRow[
                      'Error_message'
                    ] = `Validation error: ${cleanedString}`;
                  } else if (
                    err instanceof Prisma.PrismaClientKnownRequestError
                  ) {
                    if (err.code === 'P2002') {
                      ErrorRow[
                        'Error_message'
                      ] = `Duplicate field value: ${err.meta.target}`;
                    } else if (err.code === 'P2003') {
                      ErrorRow[
                        'Error_message'
                      ] = `Invalid input data: ${err.meta.target}`;
                    } else {
                      ErrorRow['Error_message'] = err.message;
                    }
                  }
                  errorAccountsData.push(ErrorRow);
                  //  console.log('ERRRRR IN Single-', rest, err.message);
                }
              }
            }
          }
        }

        let DelSqlQuery = `
        DELETE FROM temp_email WHERE refno = '${randomString}';
        `;
        //  console.log('sqlQuerysqlQuery', sqlQuery);
        const DelResult = await this.prisma.$queryRawUnsafe(DelSqlQuery);
        /*
        Old Code start from here */
        // const accountsToInsert = Array.from(accountsMap.values());
        // console.log('Total Account to Insert -', accountsToInsert.length);
        // const accountPromises = [];
        // for (let k = 0; k < accountsToInsert.length; k += 100) {
        //   console.log('I am here 1111');
        //   const batchToInsert = accountsToInsert.slice(k, k + 100);
        //   console.log('I am here 222');
        //   const batchToInsert_data = accountsToInsert
        //     .slice(k, k + 100)
        //     .map(({ acnt_key, ...rest }) => rest);
        //   console.log('I am here 3333');
        //   try {
        //     const InsertStatus = accountPromises.push(
        //       await this.prisma.accounts.createMany({
        //         data: batchToInsert_data,
        //       }),
        //     );
        //     console.log(
        //       'accounts Inserted in Many--',
        //       batchToInsert_data.length,
        //     );
        //     for (const record of accountsToInsert) {
        //       SuccessAccountsData.push(excelFileMap.get(record.acnt_key));
        //     }
        //     acnt_inserted += batchToInsert_data.length;
        //   } catch (err) {
        //     for (const record of batchToInsert) {
        //       const { acnt_key, ...rest } = record;
        //       try {
        //         await this.prisma.accounts.create({
        //           data: rest,
        //         });
        //         SuccessAccountsData.push(excelFileMap.get(record.acnt_key));
        //         acnt_inserted++;
        //         console.log('accounts Inserted in Single--', acnt_inserted);
        //       } catch (err) {
        //         //console.log('ERRRRRRR--', err.message);
        //         const ErrorRow = excelFileMap.get(record.acnt_key);
        //         //  console.log('ErrorRowErrorRow--', ErrorRow);
        //         if (
        //           ErrorRow &&
        //           err instanceof Prisma.PrismaClientValidationError
        //         ) {
        //           // Handle Prisma client validation error
        //           const startIndex = err.message.indexOf('})') + 2;
        //           const extractedMessage = err.message.substring(startIndex);
        //           const cleanedString = extractedMessage.replace(/\n/g, '');
        //           ErrorRow[
        //             'Error_message'
        //           ] = `Validation error: ${cleanedString}`;
        //         } else if (
        //           err instanceof Prisma.PrismaClientKnownRequestError
        //         ) {
        //           if (err.code === 'P2002') {
        //             ErrorRow[
        //               'Error_message'
        //             ] = `Duplicate field value: ${err.meta.target}`;
        //           } else if (err.code === 'P2003') {
        //             ErrorRow[
        //               'Error_message'
        //             ] = `Invalid input data: ${err.meta.target}`;
        //           } else {
        //             ErrorRow['Error_message'] = err.message;
        //           }
        //         }
        //         acnt_failed++;
        //         errorAccountsData.push(ErrorRow);
        //       }
        //     }
        //   }
        // }
        // /**
        //  * make map of aCCOUNT id with Name
        //  */
        // const AllaccountsMap = new Map<string, any>();
        // const uniqueData = [];
        // const AccountNameBatchSize = 20;
        // accountsData_new.forEach((item) => {
        //   if (!uniqueData[item.Name]) {
        //     uniqueData[item.Name] = item;
        //   }
        // });
        // const result = Object.values(uniqueData);
        // for (let i = 0; i < result.length; i += AccountNameBatchSize) {
        //   const batch = result.slice(i, i + AccountNameBatchSize);
        //   const AccountNames = batch.map((account) => account.Name);
        //   const allAccounts = await this.prisma.accounts.findMany({
        //     select: {
        //       id: true,
        //       Name: true,
        //     },
        //     where: {
        //       Name: {
        //         in: AccountNames,
        //       },
        //     },
        //   });
        //   const accountLookup = {};
        //   console.log('allAccounts-', allAccounts.length);
        //   for (const account of allAccounts) {
        //     accountLookup[account.Name] = account.id;
        //     AllaccountsMap.set(account.Name, account);
        //   }
        // }
        // const ContactDataToInsert = [];
        // for (const contactDatawithAccount of contactsDatawithAccount) {
        //   const accountEntry = AllaccountsMap.get(
        //     contactDatawithAccount.AccountName,
        //   );
        //   if (accountEntry) {
        //     const accountId = accountEntry.id;
        //     contactDatawithAccount['AccountId'] = accountId;
        //     delete contactDatawithAccount['AccountName'];
        //     ContactDataToInsert.push(contactDatawithAccount);
        //   } else {
        //     console.log(
        //       `Account with name ${contactDatawithAccount.AccountName} not found in AllaccountsMap`,
        //     );
        //   }
        // }
        // console.log('Total Contact to Insert -', ContactDataToInsert.length);
        // const ContactPromises = [];
        // for (let cti = 0; cti < ContactDataToInsert.length; cti += 100) {
        //   const batchToInsert = ContactDataToInsert.slice(cti, cti + 100);
        //   const batchToInsert_data = ContactDataToInsert.slice(
        //     cti,
        //     cti + 100,
        //   ).map(({ cnt_key, ...rest }) => rest);
        //   try {
        //     console.log(
        //       'contact Inserted in Many--',
        //       batchToInsert_data.length,
        //     );
        //     const InsertStatus = ContactPromises.push(
        //       await this.prisma.contact.createMany({
        //         data: batchToInsert_data,
        //       }),
        //     );
        //     cnt_inserted += batchToInsert_data.length;
        //     for (const record of batchToInsert_data) {
        //       SuccessAccountsData.push(
        //         excelFileMapContacts.get(record.cnt_key),
        //       );
        //     }
        //   } catch (err) {
        //     for (const record of batchToInsert) {
        //       const { AccountName, cnt_key, ...rest } = record;
        //       try {
        //         await this.prisma.contact.create({
        //           data: rest,
        //         });
        //         SuccessAccountsData.push(
        //           excelFileMapContacts.get(record.cnt_key),
        //         );
        //         cnt_inserted++;
        //         console.log('contact Inserted in Single--', cnt_inserted);
        //       } catch (err) {
        //         cnt_failed++;
        //         const ErrorRow = excelFileMapContacts.get(record.cnt_key);
        //         if (
        //           ErrorRow &&
        //           err instanceof Prisma.PrismaClientValidationError
        //         ) {
        //           // Handle Prisma client validation error
        //           const startIndex = err.message.indexOf('})') + 2;
        //           const extractedMessage = err.message.substring(startIndex);
        //           const cleanedString = extractedMessage.replace(/\n/g, '');
        //           ErrorRow[
        //             'Error_message'
        //           ] = `Validation error: ${cleanedString}`;
        //         } else if (
        //           err instanceof Prisma.PrismaClientKnownRequestError
        //         ) {
        //           if (err.code === 'P2002') {
        //             ErrorRow[
        //               'Error_message'
        //             ] = `Duplicate field value: ${err.meta.target}`;
        //           } else if (err.code === 'P2003') {
        //             ErrorRow[
        //               'Error_message'
        //             ] = `Invalid input data: ${err.meta.target}`;
        //           } else {
        //             ErrorRow['Error_message'] = err.message;
        //           }
        //         }
        //         errorAccountsData.push(ErrorRow);
        //         console.log('ERRRRR IN Single-', rest, err.message);
        //       }
        //     }
        //   }
        // }
      }

      // errorContactsData.push(...errorAccountsData);

      // console.log('errorContactsData--', errorContactsData);

      const currentDate = new Date().toISOString().replace(/:/g, '-');
      const fileName_contacts = `uploads/Err_cnt_${currentDate}_map_${map.name}.csv`;
      const fileName_Accounts = `uploads/Err_act_${currentDate}_map_${map.name}.csv`;
      const SuccessFileName_cnt = `uploads/Success_cnt_${currentDate}_map_${map.name}.csv`;
      const SuccessFileName_act = `uploads/Success_act_${currentDate}_map_${map.name}.csv`;
      OutputData[
        'error_url_cnt'
      ] = `${process.env.APP_URL}/jobs/${fileName_contacts}`;
      OutputData[
        'error_url_act'
      ] = `${process.env.APP_URL}/jobs/${fileName_Accounts}`;
      OutputData[
        'success_url_cnt'
      ] = `${process.env.APP_URL}/jobs/${SuccessFileName_cnt}`;
      OutputData[
        'success_url_act'
      ] = `${process.env.APP_URL}/jobs/${SuccessFileName_act}`;
      OutputData['acnt_inserted'] = acnt_inserted;
      OutputData['acnt_updated'] = acnt_updated;
      OutputData['acnt_failed'] = acnt_failed;
      OutputData['cnt_inserted'] = cnt_inserted;
      OutputData['cnt_updated'] = cnt_updated;
      OutputData['cnt_failed'] = cnt_failed;
      //console.log('errorString--->', errorString);

      //  const flattenedData = [].concat.apply([], errorContactsData);
      console.log(
        'errorAccountsData-->',

        errorAccountsData.length,
      );

      if (errorAccountsData.length > 0) {
        const flattenedData = [].concat.apply([], errorAccountsData);
        this.writeDataToCsv(errorAccountsData, fileName_Accounts);
      }

      const inputArray = [
        /* Your array of objects here */
      ]; // Your provided data

      const uniqueArray = [];
      const usedKeys = new Map();
      let filteredArray = [];
      // console.log('SuccessAccountsData---', SuccessAccountsData);
      if (SuccessAccountsData.length > 0) {
        for (const item of SuccessAccountsData) {
          if (item !== undefined) {
            const firstIndexValue = item[Object.keys(item)[0]]; // Get the value of the first index

            if (!usedKeys.has(firstIndexValue)) {
              usedKeys.set(firstIndexValue, true); // Mark this key as used
              uniqueArray.push(item);
            }
          }
        }
      }

      filteredArray = uniqueArray.filter(
        (item) => !item.hasOwnProperty('Error_message'),
      );
      if (filteredArray) {
        this.writeDataToCsv(filteredArray, SuccessFileName_act);
      }
      return {
        errorCode: 'NO_ERROR',
        message: 'Data Uploaded Successfully!',
        created: created,
        updated: updated,
        TotalRecords: totalRows,
        OutputValue: OutputData,
      };
    } catch (err) {
      console.log('errorCode line 1118', err.message);

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
          header_content: `Import process has been failed, and we found this error: ${err.lineNumber}: ${err.message}`,
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

  async writeDataToCsv(data: any[], filePath: string) {
    if (data && data.length > 0) {
      const rows = data.map((item) => {
        return Object.values(item).map((value) => {
          if (value === null || value === '') {
            return '""'; // Replace with empty string
          }

          if (typeof value === 'string' && value.includes(',')) {
            return `"${value}"`;
          }

          return value;
        });
      });

      const header = Object.keys(data[0]);
      const csvContent = `${header.join(',')}\n${rows
        .map((row) => row.join(','))
        .join('\n')}`;

      try {
        fs.writeFileSync(filePath, csvContent);
      } catch (error) {
        console.error(`Error writing CSV file: ${error}`);
      }
    } else {
      const csvWriter = createObjectCsvWriter({
        path: filePath,
        header: [{ id: 'message', title: 'Message' }],
      });
    }
  }

  async handleCronforCntIds() {
    console.log('Start Time--', new Date());
    //console.log('cron job started-');
    //console.log('URL----', process.env.APP_URL);
    const allQueuedJobs = await this.prisma.jobs.findMany({
      where: {
        status: 'PENDING',
        jobType: 'ContactInclude',
      },
    });

    if (allQueuedJobs.length === 0) {
      console.log('No queued jobs found.');
      console.log('End Start Time--', new Date());
      return;
    }

    console.log('cron job started--', new Date());

    allQueuedJobs.map(async (job) => {
      const updateJobStatus = await this.prisma.jobs.update({
        where: {
          id: job.id,
          jobType: 'ContactInclude',
        },
        data: {
          status: 'PROCESSING',
        },
      });

      let sqlCntQuery = `
        SELECT contactid FROM contact_included_update WHERE jobid = job.id; 
      `; // Assuming you're using parameterized queries to prevent SQL injection

      const SqlCountResult = (await this.prisma.$queryRawUnsafe(sqlCntQuery, [
        job.id,
      ])) as { contactid: string }[];

      // Check if there are any contacts to update
      if (SqlCountResult.length > 0) {
        const contactIdsToUpdate = SqlCountResult.map((row) =>
          parseInt(row.contactid, 10),
        );

        // Update the export_status for the contacts
        const updateContactStatus = await this.prisma.contact.updateMany({
          where: {
            id: {
              in: contactIdsToUpdate,
            },
          },
          data: {
            export_status: 'Included',
          },
        });
      } else {
        console.log('No contacts to update');
      }
    });
  }
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
      const status = await this.ProcessContactRowsImmediately(job.mapId);
      console.log('status--', status);
      if (status.errorCode === 'NO_ERROR') {
        const emailBody = {
          transactional_message_id: 96,
          to: job.email ? job.email : 'bhagirathsingh@keenagile.com',
          from: 'support@itadusa.com',
          subject: 'Contact Import Summary from Backend Process',
          identifiers: {
            email: job.email ? job.email : 'bhagirathsingh@keenagile.com',
          },
          message_data: {
            total_records: status.TotalRecords,
            acnt_inserted_records: status.OutputValue.acnt_inserted,
            acnt_updated_records: status.OutputValue.acnt_updated,
            acnt_failed_records: status.OutputValue.acnt_failed,
            cnt_inserted_records: status.OutputValue.cnt_inserted,
            cnt_updated_records: status.OutputValue.cnt_updated,
            cnt_failed_records: status.OutputValue.cnt_updated,
            error_url_cnt: status.OutputValue.error_url_cnt,
            error_url_act: status.OutputValue.error_url_act,
            success_url_cnt: status.OutputValue.success_url_cnt,
            success_url_act: status.OutputValue.success_url_act,
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

  //@Cron('45 * * * * *')
  //@Cron(CronExpression.EVERY_10_SECONDS)
  async handleCron11() {
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
    numberOfRecords: string,
    emailContact: string,
  ): Promise<any> {
    console.log('test 1111', filter);
    const filterval = JSON.parse(filter);
    const employeePercentage = employeePercentageRequest / 100;
    const allContacts = await this.prisma.contact.findMany({
      where: {
        ...filterval,
      },
      take: Number(numberOfRecords),
      select: {
        id: true,
        LastName: true,
        FirstName: true,
        AccountId: true,
        Email: true,
        Title: true,
        RingLead_Score__c: true,
        // Account: {
        //   select: {
        //     Name: true,
        //     NumberOfEmployees: true,
        //   },
        // },
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
    // const Allaccountids =[];
    // allContacts.map((contact) => {
    //   Allaccountids.push(contact.AccountId)
    // })
    // const uniqueAccountid = [...new Set(Allaccountids)];
    const allAccount = await this.prisma.accounts.findMany({
      select: {
        id: true,
        Name: true,
        NumberOfEmployees: true,
      },
    });
    console.log('test22222');
    let allContactsData = {};
    allContacts.map((contact) => {
      if (allContactsData[contact.AccountId]) {
        contact['is_included'] = 'Excluded';
        allContactsData[contact.AccountId]['contacts'].push(contact);
      } else {
        contact['is_included'] = 'Excluded';
        allContactsData[contact.AccountId] = {
          name: contact.AccountId,
          contacts: [contact],
        };
      }
    });
    for (const accountName in allContactsData) {
      const account = allContactsData[accountName];
      account.contacts.forEach((contact, index) => {
        let assa =
          allAccount.find((account) => account.id === contact.AccountId)
            ?.NumberOfEmployees * employeePercentage;
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
    const includeContactsID = [];
    const allContactIds = [];
    contactsArray.forEach((item) => {
      const sequence = item.sequence;

      //      console.log('sequence -',sequence);
      //      console.log('sequenceCounts[sequence] -',sequenceCounts[sequence]);

      if (sequenceCounts[sequence] > minimumCount) {
        includeContactsID.push(item.id);
        item.is_included = 'Included';
        allContactIds.push(item.id);
      }
    });

    this.sendDataToJobforIds(
      {
        mapId: 1,
        status: 'PENDING',
        email: null,
        jobType: 'ContactInclude',
      },
      allContactIds,
    );

    //  write and excel file now
    return await this.excelService.writeExcelFile(
      contactsArray
        .filter((item) => {
          const accountName = allAccount.find(
            (account) => account.id === item.AccountId,
          )?.Name;
          return accountName !== undefined && accountName.trim() !== ''; // Skip items with blank 'Account Name'
        })
        .map((item) => ({
          'Account Name': allAccount.find(
            (account) => account.id === item.AccountId,
          )?.Name,
          'First Name': item.FirstName,
          'Last Name': item.LastName,
          Email: item.Email,
          Title: item.Title,
          'RingLead Score': item.RingLead_Score__c,
          Sequence: item.sequence,
          'Is Included': item.is_included,
        })),
    );
  }

  async getEmployeeRankingswithEmail(
    employeePercentageRequest: number,
    minimumCount: number,
    filter: string,
    numberOfRecords: string,
    emailContact: string,
  ): Promise<any> {
    console.log('test 1111', filter);
    const filterval = JSON.parse(filter);
    const employeePercentage = employeePercentageRequest / 100;
    const allContacts = await this.prisma.contact.findMany({
      where: {
        ...filterval,
      },
      take: Number(numberOfRecords),
      select: {
        id: true,
        LastName: true,
        FirstName: true,
        AccountId: true,
        Email: true,
        Title: true,
        RingLead_Score__c: true,
        // Account: {
        //   select: {
        //     Name: true,
        //     NumberOfEmployees: true,
        //   },
        // },
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
    // const Allaccountids =[];
    // allContacts.map((contact) => {
    //   Allaccountids.push(contact.AccountId)
    // })
    // const uniqueAccountid = [...new Set(Allaccountids)];
    const allAccount = await this.prisma.accounts.findMany({
      select: {
        id: true,
        Name: true,
        NumberOfEmployees: true,
      },
    });
    console.log('test22222');
    let allContactsData = {};
    allContacts.map((contact) => {
      if (allContactsData[contact.AccountId]) {
        contact['is_included'] = 'Excluded';
        allContactsData[contact.AccountId]['contacts'].push(contact);
      } else {
        contact['is_included'] = 'Excluded';
        allContactsData[contact.AccountId] = {
          name: contact.AccountId,
          contacts: [contact],
        };
      }
    });
    for (const accountName in allContactsData) {
      const account = allContactsData[accountName];
      account.contacts.forEach((contact, index) => {
        let assa =
          allAccount.find((account) => account.id === contact.AccountId)
            ?.NumberOfEmployees * employeePercentage;
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
    const includeContactsID = [];
    const allContactIds = [];
    contactsArray.forEach((item) => {
      const sequence = item.sequence;

      //      console.log('sequence -',sequence);
      //      console.log('sequenceCounts[sequence] -',sequenceCounts[sequence]);

      if (sequenceCounts[sequence] > minimumCount) {
        includeContactsID.push(item.id);
        item.is_included = 'Included';
        allContactIds.push(item.id);
      }
    });

    this.sendDataToJobforIds(
      {
        mapId: 1,
        status: 'PENDING',
        email: null,
        jobType: 'ContactInclude',
      },
      allContactIds,
    );

    //  write and excel file now
    return await this.excelService.writeExcelFile(
      contactsArray
        .filter((item) => {
          const accountName = allAccount.find(
            (account) => account.id === item.AccountId,
          )?.Name;
          return accountName !== undefined && accountName.trim() !== ''; // Skip items with blank 'Account Name'
        })
        .map((item) => ({
          'Account Name': allAccount.find(
            (account) => account.id === item.AccountId,
          )?.Name,
          'First Name': item.FirstName,
          'Last Name': item.LastName,
          Email: item.Email,
          Title: item.Title,
          'RingLead Score': item.RingLead_Score__c,
          Sequence: item.sequence,
          'Is Included': item.is_included,
        })),
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
