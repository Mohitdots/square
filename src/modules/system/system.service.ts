import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class SystemService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus() {
    const row = await this.prisma.systemControl.findUnique({
      where: { type: 'MAIN' },
    });

    if (!row) {
      return { enabled: false, reason: 'System not configured' };
    }

    return {
      enabled: row.enabled,
      reason: row.enabled ? null : row.reason,
    };
  }

  async enable() {
    return this.prisma.systemControl.upsert({
      where: { type: 'MAIN' },
      update: { enabled: true, reason: null },
      create: { id: 1, type: 'MAIN', enabled: true },
    });
  }

  async disable(reason?: string) {
    return this.prisma.systemControl.upsert({
      where: { type: 'MAIN' },
      update: { enabled: false, reason },
      create: { id: 1, type: 'MAIN', enabled: false, reason },
    });
  }

  async isEnabled(): Promise<boolean> {
    const row = await this.prisma.systemControl.findUnique({
      where: { type: 'MAIN' },
    });
    return !!row && row.enabled === true;
  }

  // ParcelHive toggle — separate row identified by type: PARCELHIVE
  async getParcelhiveStatus() {
    const row = await this.prisma.systemControl.findUnique({ where: { type: 'PARCELHIVE' } });
    return { parcelhiveEnabled: row?.enabled ?? true };
  }

  async enableParcelhive() {
    return this.prisma.systemControl.upsert({
      where: { type: 'PARCELHIVE' },
      update: { enabled: true, reason: null },
      create: { id: 2, type: 'PARCELHIVE', enabled: true },
    });
  }

  async disableParcelhive() {
    return this.prisma.systemControl.upsert({
      where: { type: 'PARCELHIVE' },
      update: { enabled: false },
      create: { id: 2, type: 'PARCELHIVE', enabled: false },
    });
  }

  async isParcelhiveEnabled(): Promise<boolean> {
    const row = await this.prisma.systemControl.findUnique({ where: { type: 'PARCELHIVE' } });
    return row === null || row.enabled === true;
  }

   async getOrderCount() {
    const count = await this.prisma.order.count();
    return { totalOrders: count };
  }

 // 🔐 Verify PIN
async verifyPin(pin: string) {
  const admin = await this.prisma.adminSettings.findUnique({
    where: { id: 1 },
  });

  if (!admin || admin.accessPin !== pin) {
    return { success: false };
  }

  return { success: true };
}

  
}
