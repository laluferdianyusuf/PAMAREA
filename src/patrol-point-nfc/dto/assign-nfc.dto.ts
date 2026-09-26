import { IsNotEmpty, IsUUID } from 'class-validator';

export class AssignNfcDto {
  @IsUUID()
  @IsNotEmpty()
  patrolPointId: string;

  @IsUUID()
  @IsNotEmpty()
  nfcTagId: string;
}
