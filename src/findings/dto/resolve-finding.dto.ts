import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ResolveFindingDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  resolutionNote: string;
}
