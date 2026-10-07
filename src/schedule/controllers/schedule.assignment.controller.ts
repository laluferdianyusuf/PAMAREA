import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { User } from '../../generated/prisma/client.js';
import { RoleName } from '../../generated/prisma/enums.js';
import { CreateScheduleAssignmentDto } from '../dto/create.schedule.assignment.dto.js';
import { PatrolScheduleAssignmentService } from '../services/patrol.schedule.assignment.service.js';

@Controller('patrol-schedules/:scheduleId/assignments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PatrolScheduleAssignmentController {
  constructor(private readonly service: PatrolScheduleAssignmentService) {}

  @Post()
  @Roles(RoleName.ADMIN)
  create(
    @Param('scheduleId')
    scheduleId: string,
    @Body()
    dto: CreateScheduleAssignmentDto,
    @CurrentUser()
    user: User,
  ) {
    return this.service.create(scheduleId, dto, user.id);
  }

  @Post('assignments/bulk')
  async bulkAssignSatpam(
    @Body() dto: BulkAssignUserDto,
    @CurrentUser() user: any // Ambil ID admin yang sedang login
  ) {
    const result = await this.service.bulkAssignUser(dto, user.id);
    
    // Opsional: Langsung panggil generate() jika shift-nya melibatkan tanggal hari ini
    // Agar satpam langsung mendapat tugas di aplikasinya hari ini juga
    // const hariIni = new Date().toISOString().split('T')[0];
    // for (const assignment of result) {
    //    await this.generationService.generate(assignment.scheduleId, { startDate: hariIni, endDate: hariIni });
    // }

    return {
      message: 'Jadwal shift bergilir berhasil disimpan',
      data: result
    };
  }

  @Get()
  @Roles(RoleName.ADMIN)
  findAll(
    @Param('scheduleId')
    scheduleId: string,
  ) {
    return this.service.findAll(scheduleId);
  }

  @Delete(':assignmentId')
  @Roles(RoleName.ADMIN)
  remove(
    @Param('scheduleId')
    scheduleId: string,
    @Param('assignmentId')
    assignmentId: string,
  ) {
    return this.service.remove(scheduleId, assignmentId);
  }
}
