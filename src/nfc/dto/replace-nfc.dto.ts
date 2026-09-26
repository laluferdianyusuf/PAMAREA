import { IsNotEmpty, IsUUID } from 'class-validator';

export class ReplaceNfcTagDto {
  @IsUUID()
  @IsNotEmpty()
  newNfcTagId: string;
}
