import { Module } from '@nestjs/common';
import { SitesController } from './sites.controller.js';
import { SitesService } from './sites.service.js';

@Module({
  imports: [],
  controllers: [SitesController],
  providers: [SitesService],
  exports: [],
})
export class SitesModule {}
