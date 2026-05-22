import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ParcelhiveAuthService } from './parcelhive-auth.service';
import { ParcelhiveClient } from './parcelhive.client';
import { ParcelhiveOrdersService } from './parcelhive-orders.service';

@Module({
  imports: [HttpModule],
  providers: [ParcelhiveAuthService, ParcelhiveClient, ParcelhiveOrdersService],
  exports: [ParcelhiveClient, ParcelhiveOrdersService],
})
export class ParcelhiveModule {}
