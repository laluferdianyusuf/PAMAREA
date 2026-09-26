import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdatePointQuestionDto {
  @IsInt()
  @IsOptional()
  @Min(0)
  @Max(9999)
  sortOrder?: number;

  @IsBoolean()
  @IsOptional()
  isRequired?: boolean;
}
