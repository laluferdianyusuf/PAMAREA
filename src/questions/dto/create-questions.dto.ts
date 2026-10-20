import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  PhotoRequirement,
  QuestionType,
} from '../../generated/prisma/enums.js';

export class QuestionOptionDto {
  @IsString()
  @MaxLength(150)
  label: string;

  @IsOptional()
  @IsBoolean()
  isSafe?: boolean;
}

export class CreateQuestionDto {
  @IsString()
  @IsNotEmpty()
  questionText: string;

  @IsEnum(QuestionType)
  questionType: QuestionType;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsEnum(PhotoRequirement)
  photoRequirement?: PhotoRequirement;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  questionOptions?: QuestionOptionDto[];
}
