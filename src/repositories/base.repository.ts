import { PrismaClient, Prisma } from '@prisma/client';
import { prisma } from '../config/database';

// ============================================
// BASE REPOSITORY - .NET: Generic Repository Pattern
// ============================================
// In .NET: public interface IRepository<T> where T : class
// Provides CRUD operations + query building abstraction over Prisma

export interface IBaseRepository<T, TCreateInput, TUpdateInput, TWhereInput> {
  create(data: TCreateInput): Promise<T>;
  findById(id: string): Promise<T | null>;
  findMany(args?: {
    where?: TWhereInput;
    orderBy?: any;
    take?: number;
    skip?: number;
    include?: any;
  }): Promise<T[]>;
  count(where?: TWhereInput): Promise<number>;
  update(id: string, data: TUpdateInput): Promise<T>;
  delete(id: string): Promise<T>;
  exists(where: TWhereInput): Promise<boolean>;
}

export abstract class BaseRepository<T, TCreateInput, TUpdateInput, TWhereInput>
  implements IBaseRepository<T, TCreateInput, TUpdateInput, TWhereInput> {

  protected abstract model: any; // Prisma model delegate (e.g., prisma.user)

  async create(data: TCreateInput): Promise<T> {
    return this.model.create({ data }) as Promise<T>;
  }

  async findById(id: string): Promise<T | null> {
    return this.model.findUnique({ where: { id } }) as Promise<T | null>;
  }

  async findMany(args?: {
    where?: TWhereInput;
    orderBy?: any;
    take?: number;
    skip?: number;
    include?: any;
  }): Promise<T[]> {
    return this.model.findMany(args as any) as Promise<T[]>;
  }

  async count(where?: TWhereInput): Promise<number> {
    return this.model.count({ where: where as any }) as Promise<number>;
  }

  async update(id: string, data: TUpdateInput): Promise<T> {
    return this.model.update({ where: { id }, data }) as Promise<T>;
  }

  async delete(id: string): Promise<T> {
    return this.model.delete({ where: { id } }) as Promise<T>;
  }

  async exists(where: TWhereInput): Promise<boolean> {
    const count = await this.model.count({ where: where as any });
    return count > 0;
  }

  // Transaction helper - .NET: Unit of Work pattern
  async transaction<R>(fn: (tx: any) => Promise<R>): Promise<R> {
    return prisma.$transaction(fn);
  }
}