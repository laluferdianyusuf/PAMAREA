import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateSchedulePointDto {
  @IsUUID()
  @IsNotEmpty()
  patrolPointId: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  sequence?: number;

  @IsOptional()
  @IsBoolean()
  required?: boolean;
}

export class CreateManySchedulePointsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  patrolPointIds: string[];

  @IsOptional()
  @IsBoolean()
  required?: boolean;
}
