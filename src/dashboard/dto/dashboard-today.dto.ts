import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Max, Min } from 'class-validator';

export class DashboardTodayDto {
  @ApiProperty({
    example: '2026-10-03',
  })
  @IsString()
  date: string;

  @ApiProperty({
    example: 4,
  })
  @IsInt()
  @Min(0)
  completedPatrol: number;

  @ApiProperty({
    example: 6,
  })
  @IsInt()
  @Min(0)
  totalPatrol: number;

  @ApiProperty({
    example: 2,
  })
  @IsInt()
  @Min(0)
  pendingPatrol: number;

  @ApiProperty({
    example: 67,
  })
  @IsInt()
  @Min(0)
  @Max(100)
  completionPercentage: number;

  @ApiProperty({
    example: 92,
  })
  @IsInt()
  @Min(0)
  @Max(100)
  performance: number;

  @ApiProperty({
    example: 95,
  })
  @IsInt()
  @Min(0)
  @Max(100)
  scheduleCompliance: number;

  @ApiProperty({
    example: 90,
  })
  @IsInt()
  @Min(0)
  @Max(100)
  reportCompletion: number;
}
