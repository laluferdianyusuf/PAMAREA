import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateNfcTagDto {
  @IsString()
  @IsOptional()
  @MaxLength(255)
  uid?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  label?: string;
}
