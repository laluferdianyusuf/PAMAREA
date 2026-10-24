import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class RedirectCheckpointDto {
  @IsUUID()
  targetPatrolPointId: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}
