import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  PhotoRequirement,
  QuestionStatus,
} from '../../generated/prisma/enums.js';

export class UpdateQuestionDto {
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  questionText?: string;

  @IsBoolean()
  @IsOptional()
  isRequired?: boolean;

  @IsEnum(PhotoRequirement)
  @IsOptional()
  photoRequirement?: PhotoRequirement;

  @IsEnum(QuestionStatus)
  @IsOptional()
  status?: QuestionStatus;
}
