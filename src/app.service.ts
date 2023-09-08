import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello() {
    return {
      applicationName: 'Api Server',
      version: '0.1.0',
    };
  }
}
