import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsObject, ValidateNested } from 'class-validator';

import { DashboardNextPatrolDto } from './dashboard-next-patrol.dto.js';
import { DashboardTodayDto } from './dashboard-today.dto.js';
import { DashboardUserDto } from './dashboard-user.dto.js';

export class DashboardMeResponseDto {
  @ApiProperty({
    type: DashboardUserDto,
  })
  @IsObject()
  @ValidateNested()
  @Type(() => DashboardUserDto)
  user: DashboardUserDto;

  @ApiProperty({
    type: DashboardTodayDto,
  })
  @IsObject()
  @ValidateNested()
  @Type(() => DashboardTodayDto)
  today: DashboardTodayDto;

  @ApiPropertyOptional({
    type: DashboardNextPatrolDto,
    nullable: true,
  })
  @ValidateNested()
  @Type(() => DashboardNextPatrolDto)
  nextPatrol: DashboardNextPatrolDto | null;
}
