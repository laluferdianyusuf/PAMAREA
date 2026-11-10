import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import {
  PhotoRequirement,
  QuestionStatus,
  QuestionType,
} from '../../generated/prisma/client.js';

class UpdateQuestionOptionItemDto {
  @IsString()
  label: string;

  @IsOptional()
  @IsBoolean()
  isSafe?: boolean;
}

export class UpdateQuestionDto {
  @IsOptional()
  @IsString()
  questionText?: string;

  @IsOptional()
  @IsEnum(QuestionType)
  questionType?: QuestionType;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsEnum(PhotoRequirement)
  photoRequirement?: PhotoRequirement;

  @IsOptional()
  @IsEnum(QuestionStatus)
  status?: QuestionStatus;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateQuestionOptionItemDto)
  questionOptions?: UpdateQuestionOptionItemDto[];
}
