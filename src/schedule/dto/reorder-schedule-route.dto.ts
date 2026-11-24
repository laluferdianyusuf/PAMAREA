import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';

class ReorderScheduleRoutePointDto {
  @IsUUID()
  patrolPointId: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;
}

export class ReorderScheduleRouteDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReorderScheduleRoutePointDto)
  points: ReorderScheduleRoutePointDto[];
}
