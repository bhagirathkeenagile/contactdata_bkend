import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Get,
  Body,
  Delete,
  Param,
  Query,
  Put,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MapService } from './map.service';
import { CreateMapDto } from './dto/create-map.dto';

/**
 * Map Controller
 * @description This Controller is being used for uploading map data.
 * @method uploadFile() - This method is used for uploading excel file.
 * @method getRuleset() - This method is used for fetching ruleset.
 * @method createUser() - This method is used for creating user.
 */
@Controller('map')
export class MapController {
  constructor(private readonly mapService: MapService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('excelFile'))
  async uploadFile(@UploadedFile() file) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    const data = await this.mapService.readExcelFile(file.path);
    const keyFromExcel = Object.keys(data);
    return { keyFromExcel };
  }

  @Get('ruleset')
  async getRuleset() {
    const ruleset = this.mapService.fetchRuleset();
    return ruleset;
  }

  @Post('import')
  async createUser(@Body() data: CreateMapDto): Promise<{
    errorCode: 'ERROR' | 'NO_ERROR' | 'PROCESSING_FAILED';
    message?: string;
  }> {
    try {
      return await this.mapService.saveMappingData(data);
    } catch (err) {
      return {
        errorCode: 'ERROR',
        message: err.message,
      };
    }
  }

  @Get('list-mapData')
  async listMapData() {
    try {
      return await this.mapService.fetchMapData();
    } catch (error) {
      return {
        errorCode: 'ERROR',
        message: error.message,
      };
    }
  }

  @Post('get-single-map')
  async getSingleMap(@Body() data: { mapId: string | number }) {
    try {
      return await this.mapService.fetchSingleMap(data.mapId);
    } catch (error) {
      return {
        errorCode: 'ERROR',
        message: error.message,
      };
    }
  }

  @Get('get-contacts')
  async getContacts(
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 10,
  ) {
    try {
      return await this.mapService.fetchContacts(page, pageSize);
    } catch (error) {
      return {
        errorCode: 'ERROR',
        message: error.message,
      };
    }
  }

  @Post('list-contactData-filter')
  async filterlistContactData(
    @Body() requestData: any,
    @Query('page') page: number,
    @Query('pageSize') pageSize: number,
  ): Promise<any> {
    try {
      const { filterval, filterseconf } = requestData;
      console.log('filterval', filterval, filterseconf, page, pageSize);
      const data = await this.mapService.fetctfiltercontactData(
        filterval,
        page,
        pageSize,
      );
      console.log('data');
      return data;
    } catch (error) {
      return {
        errorCode: 'ERROR',
        message: error.message,
      };
    }
  }

  @Get('list-contactData')
  async listContactData() {
    try {
      return await this.mapService.fetcAllcontactData();
    } catch (error) {
      return {
        errorCode: 'ERROR',
        message: error.message,
      };
    }
  }

  @Post('get-account')
  async getAccounts() {
    try {
      return await this.mapService.fetchAccounts();
    } catch (error) {
      return {
        errorCode: 'ERROR',
        message: error.message,
      };
    }
  }

  // async getContactLevelMappings() {
  //   const contactLevelMappings = this.mapService.fetchContactLevelMappings();
  //   return contactLevelMappings;
  // }
  @Put('updatemapFiledById/:id')
  async updatemapFiledById(
    @Param('id') id: string | number,
    @Body() data: CreateMapDto,
  ) {
    return await this.mapService.updateMapDataById(id, data);
  }

  @Delete('delMapById/:id')
  async deleteMapdata(@Param('id') id: string | number) {
    return await this.mapService.deleteByIdMapIteam(id);
  }

  @Get('findMapDataById/:id')
  async findMapFieldDataById(@Param('id') id: string | number) {
    return await this.mapService.fetchMapDataById(id);
  }

  @Get('cloneMapFieldById/:id')
  async cloneMapFieldById(@Param('id') id: string | number) {
    return await this.mapService.CloneMapDataById(id);
  }
}
