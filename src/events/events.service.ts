import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { SchedulerService } from 'src/scheduler/scheduler.service';

@Injectable()
export class EventService {
  constructor(private eventEmitter: EventEmitter2) {}

  //   emitEvent() {
  //     this.eventEmitter.emit('msg.sent', this.newevent());
  //   }
  //   newevent() {
  //     return 'This is new test from method';
  //   }

  //   @OnEvent('msg.sent')
  //   listentToEvent(msg: string) {
  //     console.log('Message Received: ', msg);
  //   }
}
