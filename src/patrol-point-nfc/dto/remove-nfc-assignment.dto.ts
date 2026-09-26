import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RemoveNfcAssignmentDto {
  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;
}
