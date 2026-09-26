import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class ReplaceNfcAssignmentDto {
  @IsUUID()
  @IsNotEmpty()
  newNfcTagId: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;
}
