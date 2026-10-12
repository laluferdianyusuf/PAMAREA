import { IsOptional, IsString, MaxLength } from 'class-validator';

export class StartNextPatrolDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  deviceId?: string;
}
