import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrderStatus } from '@prisma/client';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertFromSquare(params: {
    squareOrderId: string;
    integrationNumber: string;
    squareCustomerId?: string;
    squareLocationId?: string;
    recipientPhone?: string;
    recipientEmail?: string;
    startsAt?: Date;
    endsAt?: Date;
    squareOrderPayload: unknown;
  }) {
    return this.prisma.order.upsert({
      where: { squareOrderId: params.squareOrderId },
      create: {
        squareOrderId: params.squareOrderId,
        integrationNumber: params.integrationNumber,
        squareCustomerId: params.squareCustomerId,
        squareLocationId: params.squareLocationId,
        recipientPhone: params.recipientPhone,
        recipientEmail: params.recipientEmail,
        startsAt: params.startsAt,
        endsAt: params.endsAt,
        squareOrderPayload: params.squareOrderPayload as any,
        status: OrderStatus.RECEIVED,
      },
      update: {
        squareCustomerId: params.squareCustomerId,
        squareLocationId: params.squareLocationId,
        recipientPhone: params.recipientPhone,
        recipientEmail: params.recipientEmail,
        startsAt: params.startsAt,
        endsAt: params.endsAt,
        squareOrderPayload: params.squareOrderPayload as any,
      },
    });
  }

  async markSentToParcelHive(orderId: string, parcelHiveOrderId?: string,collectPin?:string) {
    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.SENT_TO_PARCELHIVE,
        collectPin:collectPin,
        parcelHiveOrderId: parcelHiveOrderId ?? undefined,
      },
    });
  }

  async markLockerAssigned(
    orderId: string,
    data: {
      lockerUid?: string;
      lockerNumber?: string;
      depositPin?: string;
      collectPin?: string;
      qrCode?: string;
    },
  ) {
    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.LOCKER_ASSIGNED,
        lockerUid: data.lockerUid,
        lockerNumber: data.lockerNumber,
        depositPin: data.depositPin,
        collectPin: data.collectPin,
        qrCode: data.qrCode,
      },
    });
  }

  async markStorePickup(orderId: string, reason?: string) {
    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.STORE_PICKUP,
        lastError: reason,
      },
    });
  }

  async markFailed(orderId: string, err: string) {
    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.FAILED, lastError: err },
    });
  }
}
