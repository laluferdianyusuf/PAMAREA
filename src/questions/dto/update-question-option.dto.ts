import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateQuestionOptionDto {
  @IsString()
  @IsOptional()
  @IsNotEmpty()
  @MaxLength(100)
  value?: string;

  @IsString()
  @IsOptional()
  @IsNotEmpty()
  @MaxLength(150)
  label?: string;

  @IsInt()
  @IsOptional()
  @Min(0)
  @Max(9999)
  sortOrder?: number;
}
