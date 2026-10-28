import { Type } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CreateTeamForUserDto } from './create-team.dto.js';

export class CreateUserDto {
  @IsUUID()
  @IsNotEmpty()
  roleId: string;

  @IsUUID()
  @IsOptional()
  siteId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  employeeNumber?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  fullName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  username: string;

  @IsEmail()
  @IsOptional()
  @MaxLength(150)
  email?: string;

  @IsString()
  @IsOptional()
  @MaxLength(30)
  phone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  photoUrl?: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsUUID('4')
  teamId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateTeamForUserDto)
  team?: CreateTeamForUserDto;
}
