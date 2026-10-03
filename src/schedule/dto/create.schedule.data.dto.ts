import { ArrayMinSize, IsArray, IsDateString } from 'class-validator';

export class CreateScheduleDatesDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsDateString({}, { each: true })
  dates: string[];
}
