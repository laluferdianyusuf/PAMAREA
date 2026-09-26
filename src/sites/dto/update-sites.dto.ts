import { Decimal } from '@prisma/client/runtime/client';
import { IsOptional, IsString } from 'class-validator';

export class UpdateSitesDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  latitude?: Decimal;

  @IsOptional()
  @IsString()
  longitude?: Decimal;
}
