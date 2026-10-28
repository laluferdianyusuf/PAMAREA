import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import type { User } from '../generated/prisma/client.js';
import { RoleName } from '../generated/prisma/enums.js';
import { CreateUserDto } from './dto/create-users.dto.js';
import { UpdateUserDto } from './dto/update-users.dto.js';
import { UsersService } from './users.service.js';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll() {
    return this.usersService.findAllUsers();
  }

  @Get('security')
  findAllSecurityUsers() {
    return this.usersService.findAllSecurityUsers();
  }

  @Get('active')
  findActive() {
    return this.usersService.findAllActiveUsers();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findUserById(id);
  }

  @Patch(':id/photo')
  @UseGuards(JwtAuthGuard)
  changeUserPhoto(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() file: any,
    @CurrentUser() user: User,
  ) {
    return this.usersService.changeUserPhoto(id, file, user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN)
  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() user: User) {
    return this.usersService.createUser(dto, user?.id);
  }

  @UseGuards(JwtAuthGuard)
  @Roles(RoleName.ADMIN)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: User,
  ) {
    return this.usersService.updateUser(id, dto, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Roles(RoleName.ADMIN)
  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string, @CurrentUser() user: User) {
    return this.usersService.deactivateUser(id, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Roles(RoleName.ADMIN)
  @Patch(':id/activate')
  activate(@Param('id') id: string, @CurrentUser() user: User) {
    return this.usersService.activateUser(id, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Roles(RoleName.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.usersService.removeUser(id, user.id);
  }
}
