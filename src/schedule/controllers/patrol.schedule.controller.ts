import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { User } from '../../generated/prisma/client.js';
import { RoleName } from '../../generated/prisma/enums.js';
import { AddAssignmentDto } from '../dto/add.assignment.dto.js';
import { CreatePatrolScheduleDto } from '../dto/create.schedule.dto.js';
import { ExtendDatesDto } from '../dto/entend.dates.dto.js';
import { ScheduleFilterDto } from '../dto/schedule.filter.dto.js';
import { UpdateAssignmentDto } from '../dto/update.assignment.dto.js';
import { UpdatePatrolScheduleDto } from '../dto/update.schedule.dto.js';
import { PatrolScheduleService } from '../services/patrol.schedule.service.js';
import { RosterExcelService } from '../services/roster-excel.service.js';
import { RosterImportService } from '../services/roster-import.service.js';

@Controller('patrol-schedules')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PatrolScheduleController {
  constructor(
    private readonly service: PatrolScheduleService,
    private readonly rosterExcelService: RosterExcelService,
    private readonly rosterImportService: RosterImportService,
  ) {}

  @Post()
  @Roles(RoleName.ADMIN)
  create(@CurrentUser() user: User, @Body() dto: CreatePatrolScheduleDto) {
    return this.service.create(dto, user.id);
  }

  @Get()
  findAll(@Query() query: ScheduleFilterDto) {
    return this.service.findAll(query);
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

  @Get(':id')
  @Roles(RoleName.ADMIN)
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Roles(RoleName.ADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePatrolScheduleDto,
    @CurrentUser() user: User,
  ) {
    return this.service.update(id, dto, user.id);
  }

  @Get('roster/template')
  @Roles(RoleName.ADMIN)
  async downloadRosterTemplate(
    @Query('siteId') siteId: string,
    @Query('month', ParseIntPipe) month: number,
    @Query('year', ParseIntPipe) year: number,
    @Res() res: Response,
  ) {
    const buffer = await this.rosterExcelService.createTemplate(
      siteId,
      month,
      year,
    );

    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="roster-${month}-${year}.xlsx"`,
      'Content-Length': buffer.length,
    });

    res.end(buffer);
  }

  /**
   * POST /patrol-schedules/roster/preview
   * Upload Excel untuk validasi tanpa menyimpan.
   */
  @Post('roster/preview')
  @Roles(RoleName.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  )
  async previewRoster(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('File Excel wajib diupload');
    }

    return this.rosterImportService.preview(file.buffer);
  }

  @Post('roster/import')
  @Roles(RoleName.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  )
  async importRoster(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: User,
  ) {
    if (!file) {
      throw new BadRequestException('File Excel wajib diupload');
    }

    return this.rosterImportService.importRoster(file.buffer, user.id);
  }

  @Post(':id/activate')
  @Roles(RoleName.ADMIN)
  activate(@Param('id') id: string, @CurrentUser() user: User) {
    return this.service.activate(id, user.id);
  }

  @Post(':id/archive')
  @Roles(RoleName.ADMIN)
  archive(@Param('id') id: string, @CurrentUser() user: User) {
    return this.service.archive(id, user.id);
  }

  @Delete(':id')
  @Roles(RoleName.ADMIN)
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.service.remove(id, user.id);
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
  @Post(':id/assignment')
  async addAssignment(
    @Param('id') scheduleId: string,
    @Body() dto: AddAssignmentDto,
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
    @CurrentUser() user: User,
  ) {
    return this.service.updateAssignment(
      assignmentId,
      user.id,
      dto.endDate,
      dto.status,
    );
  }
}
