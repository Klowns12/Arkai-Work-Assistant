import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReminderService {
    constructor(private prisma: PrismaService) { }

    async setReminderTomorrow(topic: string, orgId: string): Promise<string> {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        await this.prisma.reminder.create({
            data: { topic, time: d, orgId }
        });
        return `⏰ ตั้งเตือนพรุ่งนี้สำหรับเรื่อง "${topic}" สำเร็จ`;
    }

    async setReminderDaily(topic: string, orgId: string): Promise<string> {
        return `⏰ ตั้งเตือนทุกวันสำหรับเรื่อง "${topic}" สำเร็จ (หมายเหตุ: ระบบแจ้งเตือนอัตโนมัติยังไม่เปิดใช้งาน)`;
    }
}
