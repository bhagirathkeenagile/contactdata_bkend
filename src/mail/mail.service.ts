import { MailerService } from '@nestjs-modules/mailer';
import { Injectable } from '@nestjs/common';
import * as http from 'http';

@Injectable()
export class MailService {
  constructor(private mailerService: MailerService) {}

  async sendUserConfirmation(emailBody111: any, token: string) {
    /**
     * TODO:: Change this to your front-end URL
     * Change this to your front-end URL
     */
    const url = `example.com/auth/confirm?token=${token}`;
    console.log('Email Sent 00');
    // const emailBody = {
    //   to: 'bhagirathsingh@keenagile.com',
    //   transactional_message_id: 96,
    //   from: 'support@itadusa.com',
    //   subject: 'Contact Import Summary',
    //   identifiers: {
    //     email: 'bhagirathsingh@keenagile.com',
    //   },
    //   message_data: '',
    // };

    const emailBody = {
      transactional_message_id: 96,
      to: 'bhagirathsingh@keenagile.com',
      from: 'support@itadusa.com',
      subject: 'Contact Import Summary',
      identifiers: {
        email: 'bhagirathsingh@keenagile.com',
      },
      message_data: {
        total_records: '80',
        inserted_records: '70',
        updated_records: '10',
        exist_records: '100',
      },
      disable_message_retention: false,
      send_to_unsubscribed: true,
      tracked: true,
      queue_draft: false,
      disable_css_preprocessing: true,
    };

    console.log('Type of ', typeof emailBody);
    console.log('Email Sent 0001');
    const options = {
      hostname: 'api.customer.io',
      port: 80,
      path: '/v1/send/email',
      method: 'POST',
      headers: {
        Authorization: 'Bearer 044cdd2afc0e6cf8a20ac01188667f2a',
        'Content-Type': 'application/json',
      },
    };
    console.log('Email Sent 0002');
    return new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let content = '';

        res.on('data', (chunk) => {
          content += chunk;
        });
        console.log('Email Sent 0003');
        res.on('end', () => {
          const headers = res.headers;
          const status = res.statusCode;
          const response = { content, headers, status };
          console.log('response', response);
          resolve(response);
        });
      });

      req.on('error', (e) => {
        reject(e);
        console.log('Message error', e);
      });
      console.log('emailBody', typeof JSON.stringify(emailBody));

      req.write(JSON.stringify(emailBody111));
      req.end();
    });

    // await this.mailerService.sendMail({
    //   to: user.email,
    //   // from: '"Support Team" <support@example.com>', // override default from
    //   subject: 'File Upload Confirmation',
    //   template: './confirmation', // `.hbs` extension is appended automatically
    //   context: {
    //     // ✏️ filling curly brackets with content
    //     name: user.name,
    //     url,
    //   },
    // });
  }
}
