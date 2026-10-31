import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { AbsenceType } from '../../generated/prisma/client.js';

export class CreateSecurityAbsenceDto {
  @IsUUID()
  userId: string;

  // Opsional jika admin hanya ingin mencatat ketidakhadiran
  // tanpa membuat petugas pengganti.
  @IsOptional()
  @IsUUID()
  replacementUserId?: string;

  @IsEnum(AbsenceType)
  type: AbsenceType;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
