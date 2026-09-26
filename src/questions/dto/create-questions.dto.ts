import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  PhotoRequirement,
  QuestionType,
} from '../../generated/prisma/enums.js';

export class CreateQuestionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  questionText: string;

  @IsEnum(QuestionType)
  questionType: QuestionType;

  @IsBoolean()
  @IsOptional()
  isRequired?: boolean;

  @IsEnum(PhotoRequirement)
  @IsOptional()
  photoRequirement?: PhotoRequirement;
}
