import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plant } from '@/database/entities/plant.entity';

@Injectable()
export class PlantsService {
  private plantCache: Map<string, Plant> = new Map();

  constructor(
    @InjectRepository(Plant)
    private plantRepository: Repository<Plant>,
  ) {}

  async findByCode(code: string): Promise<Plant | null> {
    // Check cache first
    if (this.plantCache.has(code)) {
      return this.plantCache.get(code);
    }

    const plant = await this.plantRepository.findOne({
      where: { code: code.toLowerCase() },
    });

    if (plant) {
      // Cache for 5 minutes
      this.plantCache.set(code, plant);
      setTimeout(() => this.plantCache.delete(code), 5 * 60 * 1000);
    }

    return plant;
  }

  async findById(id: string): Promise<Plant> {
    const plant = await this.plantRepository.findOne({ where: { id } });
    if (!plant) {
      throw new NotFoundException(`Plant with ID ${id} not found`);
    }
    return plant;
  }

  async findAll(): Promise<Plant[]> {
    return this.plantRepository.find({ where: { active: true } });
  }

  async clearCache(code?: string) {
    if (code) {
      this.plantCache.delete(code);
    } else {
      this.plantCache.clear();
    }
  }
}
