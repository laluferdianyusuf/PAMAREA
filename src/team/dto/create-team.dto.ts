import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateTeamDto {
  @IsUUID()
  siteId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  code: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
