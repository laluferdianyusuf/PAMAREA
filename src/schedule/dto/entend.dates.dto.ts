import { IsArray, IsOptional, IsString } from 'class-validator';

export class ExtendDatesDto {
  @IsArray()
  @IsString({ each: true })
  newDates: string[];

  @IsString()
  @IsOptional()
  createdById?: string;
}
