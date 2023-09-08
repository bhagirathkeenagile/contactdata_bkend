import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { SearchService } from './search.service';
import { SaveSearchDto } from './dto/saveSearch.dto';
import { GetSearchDto } from './dto/getSearch.dto';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Post('save')
  saveSearch(@Body() data: SaveSearchDto) {
    return this.searchService.saveSearch(data);
  }

  // get saved searces based on page
  @Get('getSaved')
  getSearches(@Body() data: GetSearchDto) {
    return this.searchService.getSearches();
  }

  @Delete('delsearchById/:id')
  async deleteMapdata(@Param('id') id: string | number) {
    console.log("ID to be delete =>", id);

    return await this.searchService.deleteByIdSearchIteam(id)
  }
}
