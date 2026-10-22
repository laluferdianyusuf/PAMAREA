import { IsNotEmpty, IsString } from 'class-validator';

export class ValidateNfcDto {
  @IsString()
  @IsNotEmpty()
  nfcUid: string;
}
