import { PartialType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-users.dto.js';

export class UpdateUserDto extends PartialType(CreateUserDto) {}
