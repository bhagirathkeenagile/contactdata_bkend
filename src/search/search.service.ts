import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { SaveSearchDto } from './dto/saveSearch.dto';

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  async saveSearch(data: SaveSearchDto) {
    console.log("saveSearch : ",data);
    return await this.prisma.searches.create({
      data: {
        ...data,
        ...{
          Account: {
            connect: {
              id: 1,
            },
          },
        },
      },
    });
  }

  async getSearches() {
    return await this.prisma.searches.findMany({}); 
  }

  async deleteByIdSearchIteam(Id: any) {
    try {
      const deletedResponse = await this.prisma.searches.delete({
        where: {
          id: Number(Id)
        }
      })
      return { deletedResponse, message: "Iteam Deleted Successfully" }

    } catch (error) {
      return { message: "Have Problem for deletion", error: error.message }

    }
  }
}
