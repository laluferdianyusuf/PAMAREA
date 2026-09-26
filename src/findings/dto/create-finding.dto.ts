import {
  IsEnum,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { FindingSeverity } from '../../generated/prisma/enums.js';

export class CreateFindingDto {
  @IsUUID()
  @IsNotEmpty()
  patrolId: string;

  @IsUUID()
  @IsNotEmpty()
  patrolPointId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsEnum(FindingSeverity)
  severity: FindingSeverity;
}
