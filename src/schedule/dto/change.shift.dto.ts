import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateShiftChangeDto {
  @IsUUID()
  firstAssignmentId: string;

  @IsUUID()
  secondAssignmentId: string;

  @IsDateString()
  effectiveDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
