import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateSchedulePointDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  sequence?: number;

  @IsOptional()
  @IsBoolean()
  required?: boolean;
}
