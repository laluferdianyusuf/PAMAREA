import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { TeamStatus } from '../../generated/prisma/enums.js';

export class QueryTeamDto {
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @IsOptional()
  @IsEnum(TeamStatus)
  status?: TeamStatus;
}
