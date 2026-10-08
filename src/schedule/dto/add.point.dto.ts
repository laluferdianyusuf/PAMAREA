import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class AddPointDto {
  @IsString()
  patrolPointId: string;

  @IsNumber()
  insertAtSequence: number;

  @IsOptional()
  @IsBoolean()
  required?: boolean;
}
