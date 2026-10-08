import { IsOptional, IsString } from 'class-validator';

export class AddAssignmentDto {
  @IsString()
  userId: string;

  @IsString()
  startDate: string;

  @IsOptional()
  @IsString()
  endDate?: string | null;

  @IsString()
  @IsOptional()
  createdById?: string;
}
