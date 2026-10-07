import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class PatrolAnswerItemDto {
  @IsUUID()
  questionId: string;

  @IsOptional()
  @IsString()
  answerValue?: string;

  @IsOptional()
  @IsString()
  answerLabel?: string;
}

export class SubmitAnswersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PatrolAnswerItemDto)
  answers: PatrolAnswerItemDto[];
}
