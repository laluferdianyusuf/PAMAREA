import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsString, IsUUID } from 'class-validator';

export class DashboardNextPatrolDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  id: string;

  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsUUID()
  patrolPointId: string;

  @ApiProperty({
    example: 'Pintu Utama',
  })
  @IsString()
  patrolPointName: string;

  @ApiProperty({
    example: 'Site A',
  })
  @IsString()
  siteName: string;

  @ApiProperty({
    example: '2026-10-03T10:00:00.000Z',
  })
  @IsDateString()
  scheduledStartAt: string;

  @ApiProperty({
    example: '2026-10-03T10:15:00.000Z',
  })
  @IsDateString()
  scheduledEndAt: string;

  @ApiProperty({
    example: 'PENDING',
  })
  @IsString()
  status: string;
}
