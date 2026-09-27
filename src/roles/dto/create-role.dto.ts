import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { RoleName } from '../../generated/prisma/enums.js';

export class CreateRoleDto {
  @IsEnum(RoleName)
  @IsNotEmpty()
  name: RoleName;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;
}
