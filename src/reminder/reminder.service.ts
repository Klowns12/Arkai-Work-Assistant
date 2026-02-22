import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReminderService {
    constructor(private prisma: PrismaService) { }

    async setReminderTomorrow(topic: string, orgId: string): Promise<string> {
        if (!topic) {
            return '⏰ กรุณาระบุเรื่องที่ต้องการเตือน / Please specify a reminder topic\nExample: /remind Submit report';
        }
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(9, 0, 0, 0);
        await this.prisma.reminder.create({
            data: { topic, time: d, recurring: false, orgId }
        });
        return `⏰ ตั้งเตือนพรุ่งนี้ / Reminder set for tomorrow\n📋 เรื่อง / Topic: "${topic}"\n🕘 เวลา / Time: ${d.toLocaleDateString('th-TH')} 09:00`;
    }

    async setReminderDaily(topic: string, orgId: string): Promise<string> {
        if (!topic) {
            return '⏰ กรุณาระบุเรื่องที่ต้องการเตือน / Please specify a reminder topic\nExample: /daily Check emails';
        }
        const d = new Date();
        d.setHours(9, 0, 0, 0);
        await this.prisma.reminder.create({
            data: { topic, time: d, recurring: true, orgId }
        });
        return `⏰ ตั้งเตือนทุกวัน / Daily reminder set\n📋 เรื่อง / Topic: "${topic}"\n🔁 ทุกวัน เวลา 09:00 / Every day at 09:00`;
    }

    async getReminders(orgId: string): Promise<string> {
        const reminders = await this.prisma.reminder.findMany({
            where: { orgId },
            orderBy: { createdAt: 'desc' },
            take: 10
        });

        if (reminders.length === 0) return '📭 ไม่มีการเตือนความจำ / No reminders set';

        return `⏰ รายการเตือน / Reminders:\n` + reminders.map((r, i) =>
            `${i + 1}. ${r.topic} ${r.recurring ? '🔁' : '📌'} ${r.time.toLocaleDateString('th-TH')}`
        ).join('\n');
    }
}
