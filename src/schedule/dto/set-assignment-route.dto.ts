import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class AssignmentRoutePointDto {
  @IsUUID()
  patrolPointId: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;
}

export class SetAssignmentRouteDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique((point: AssignmentRoutePointDto) => point.patrolPointId)
  @ValidateNested({ each: true })
  @Type(() => AssignmentRoutePointDto)
  points: AssignmentRoutePointDto[];
}
