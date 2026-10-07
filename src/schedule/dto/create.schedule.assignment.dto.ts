import { IsDateString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class CreateScheduleAssignmentDto {
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class AssignmentItemDto {
  @IsUUID()
  @IsNotEmpty()
  scheduleId: string;

  @IsDateString()
  @IsNotEmpty()
  startDate: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;
}

export class BulkAssignUserDto {
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssignmentItemDto)
  assignments: AssignmentItemDto[];
}
