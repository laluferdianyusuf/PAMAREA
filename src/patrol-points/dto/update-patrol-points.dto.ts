import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PatrolPointStatus } from '../../generated/prisma/enums.js';

export class UpdatePatrolPointDto {
  @IsString()
  @IsOptional()
  @MaxLength(50)
  code?: string;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  @IsOptional()
  latitude?: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  @IsOptional()
  longitude?: number;

  @IsInt()
  @Min(1)
  @Max(1000)
  @IsOptional()
  radiusMeters?: number;

  @IsEnum(PatrolPointStatus)
  @IsOptional()
  status?: PatrolPointStatus;
}
