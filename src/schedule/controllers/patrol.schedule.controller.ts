import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { User } from '../../generated/prisma/client.js';
import { RoleName } from '../../generated/prisma/enums.js';
import { AddAssignmentDto } from '../dto/add.assignment.dto.js';
import { AddPointDto } from '../dto/add.point.dto.js';
import { CreatePatrolScheduleDto } from '../dto/create.schedule.dto.js';
import { ExtendDatesDto } from '../dto/entend.dates.dto.js';
import { ScheduleFilterDto } from '../dto/schedule.filter.dto.js';
import { UpdateAssignmentDto } from '../dto/update.assignment.dto.js';
import { UpdatePatrolScheduleDto } from '../dto/update.schedule.dto.js';
import { PatrolScheduleService } from '../services/patrol.schedule.service.js';

@Controller('patrol-schedules')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PatrolScheduleController {
  constructor(private readonly service: PatrolScheduleService) {}

  @Post()
  @Roles(RoleName.ADMIN)
  create(@CurrentUser() user: User, @Body() dto: CreatePatrolScheduleDto) {
    return this.service.create(dto, user.id);
  }

  @Get()
  findAll(@Query() query: ScheduleFilterDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @Roles(RoleName.ADMIN)
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Roles(RoleName.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdatePatrolScheduleDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/activate')
  @Roles(RoleName.ADMIN)
  activate(@Param('id') id: string) {
    return this.service.activate(id);
  }

  @Post(':id/archive')
  @Roles(RoleName.ADMIN)
  archive(@Param('id') id: string) {
    return this.service.archive(id);
  }

  @Delete(':id')
  @Roles(RoleName.ADMIN)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  /**
   * GET /patrol-schedules/roster?siteId=xxx&month=10&year=2026
   * Mengambil data roster bulanan untuk Dashboard Admin
   */
  @Get('roster')
  async getMonthlyRoster(
    @Query('siteId') siteId: string,
    @Query('month', ParseIntPipe) month: number,
    @Query('year', ParseIntPipe) year: number,
  ) {
    return this.service.getMonthlyRoster(siteId, month, year);
  }

  /**
   * POST /patrol-schedules/:id/extend-dates
   * Memperpanjang jadwal (tambah tanggal baru)
   */
  @Post(':id/extend-dates')
  async extendDates(
    @Param('id') scheduleId: string,
    @Body() dto: ExtendDatesDto,
    @CurrentUser() user: User, // Untuk mengambil userId dari token (jika ada AuthGuard)
  ) {
    return this.service.extendDates(scheduleId, dto.newDates, user.id);
  }

  /**
   * POST /patrol-schedules/:id/assignments
   * Menambahkan satpam ke jadwal yang sedang berjalan
   */
  @Post(':id/assignments')
  async addAssignment(
    @Param('id') scheduleId: string,
    @Body() dto: AddAssignmentDto,
    @Request() req: any,
    @CurrentUser() user: User,
  ) {
    return this.service.addAssignment(
      scheduleId,
      dto.userId,
      dto.startDate,
      dto.endDate ?? null,
      user.id,
    );
  }

  /**
   * PATCH /patrol-schedules/assignments/:assignmentId
   * Mengubah atau menonaktifkan tugas satpam (Resign/Cuti)
   */
  @Patch('assignments/:assignmentId')
  async updateAssignment(
    @Param('assignmentId') assignmentId: string,
    @Body() dto: UpdateAssignmentDto,
  ) {
    return this.service.updateAssignment(assignmentId, dto.endDate, dto.status);
  }

  /**
   * POST /patrol-schedules/:id/points
   * Menambahkan area/titik baru ke jadwal dengan menyisipkan checkpoint
   */
  @Post(':id/points')
  async addPoint(@Param('id') scheduleId: string, @Body() dto: AddPointDto) {
    // Default required ke true jika tidak dikirim dari client
    const isRequired = dto.required ?? true;

    return this.service.addPoint(
      scheduleId,
      dto.patrolPointId,
      dto.insertAtSequence,
      isRequired,
    );
  }
}
