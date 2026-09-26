import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class AssignQuestionDto {
  @IsUUID()
  @IsNotEmpty()
  patrolPointId: string;

  @IsUUID()
  @IsNotEmpty()
  questionId: string;

  @IsInt()
  @IsOptional()
  @Min(0)
  @Max(9999)
  sortOrder?: number;

  @IsBoolean()
  @IsOptional()
  isRequired?: boolean;
}
