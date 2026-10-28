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
import { CreateTeamForUserDto } from '../../users/dto/create-team.dto.js';

export class RegisterDto {
  @IsUUID()
  @IsNotEmpty()
  roleId: string;

  @IsUUID()
  @IsOptional()
  siteId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  fullName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  username: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  employeeNumber: string;

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
