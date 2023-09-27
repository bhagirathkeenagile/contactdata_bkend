import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { EventService } from './events/events.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('HI')
  getHello() {
    return this.appService.getHello();
    // this.schedulerService.emitEvent();
  }
}
