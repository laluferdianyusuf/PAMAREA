import {
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateQuestionOptionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  value: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  label: string;

  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder: number;
}
