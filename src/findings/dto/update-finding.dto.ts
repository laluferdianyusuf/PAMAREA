import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { FindingSeverity } from '../../generated/prisma/enums.js';

export class UpdateFindingDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(FindingSeverity)
  @IsOptional()
  severity?: FindingSeverity;
}
