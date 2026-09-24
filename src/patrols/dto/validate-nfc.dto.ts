import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ValidateNfcDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  uid: string;
}
