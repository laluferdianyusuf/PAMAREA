import { IsNotEmpty, IsString } from 'class-validator';

export class StartPatrolDto {
  @IsString()
  @IsNotEmpty()
  deviceId: string;
}
