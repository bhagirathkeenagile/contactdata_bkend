// import * as Cryptr from 'cryptr';
// const Cryptr = require('cryptr');
// const cryptr = new Cryptr(process.env.SECRET_KEY || 'myTotallySecretKey');
import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

export const Auth = createParamDecorator((ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  const apiKey = request.headers['x-api-key'];

  if (!apiKey) {
    throw new UnauthorizedException('API key is required');
  }
  // const decryptedData = cryptr.decrypt(apiKey);
  // if (decryptedData.split('-')[0] !== process.env.API_KEY) {
  //   throw new UnauthorizedException('API key is invalid');
  // }
  // const accountId = decryptedData.split('-')[1];
  return '';
});
