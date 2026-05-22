import { Controller, Get, Post, Body } from '@nestjs/common';
import { SystemService } from './system.service';

@Controller('system')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  // GET /system/status
  @Get('status')
  async status() {
    return this.systemService.getStatus();
  }

  // POST /system/enable
  @Post('on')
  async enable() {
    return this.systemService.enable();
  }

  // POST /system/disable
  @Post('off')
  async disable(@Body('reason') reason?: string) {
    return this.systemService.disable(reason);
  }


  // GET /system/parcelhive-status
  @Get('parcelhive-status')
  async parcelhiveStatus() {
    return this.systemService.getParcelhiveStatus();
  }

  // POST /system/parcelhive-on
  @Post('parcelhive-on')
  async parcelhiveOn() {
    return this.systemService.enableParcelhive();
  }

  // POST /system/parcelhive-off
  @Post('parcelhive-off')
  async parcelhiveOff() {
    return this.systemService.disableParcelhive();
  }

  //for showing data in dashboard
  @Get('order-count')
  async orderCount() {
    return this.systemService.getOrderCount();
  }

 // POST /system/verify-pin
  @Post('verify-pin')
  async verifyPin(@Body('pin') pin: string) {
    return this.systemService.verifyPin(pin);
  }
}
