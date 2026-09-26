import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateNfcTagDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  uid: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  label?: string;
}
