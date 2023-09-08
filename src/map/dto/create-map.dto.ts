import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export class CreateMapDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  mainTable: string;

  @IsString()
  @IsNotEmpty()
  mapping: string;

  @IsString()
  @IsNotEmpty()
  filePath: string;

  @IsString()
  @IsNotEmpty()
  status: string;

  @IsString()
  @IsNotEmpty()
  action: string;
}
