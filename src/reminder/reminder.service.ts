import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReminderService {
    constructor(private prisma: PrismaService) { }

    async setReminderTomorrow(topic: string, orgId: string): Promise<string> {
        if (!topic) {
            return '⏰ กรุณาระบุเรื่องที่ต้องการเตือน\nExample: /remind ส่งรายงาน';
        }

        try {
            const d = new Date();
            d.setDate(d.getDate() + 1);
            d.setHours(9, 0, 0, 0);
            await this.prisma.reminder.create({
                data: { topic: topic.substring(0, 500), time: d, recurring: false, orgId }
            });
            return `⏰ ตั้งเตือนพรุ่งนี้!\n📋 เรื่อง: "${topic.substring(0, 100)}"\n🕘 เวลา: ${d.toLocaleDateString('th-TH')} 09:00`;
        } catch (error) {
            console.error('setReminderTomorrow error:', error);
            return '❌ ตั้งเตือนไม่สำเร็จ กรุณาลองใหม่';
        }
    }

    async setReminderDaily(topic: string, orgId: string): Promise<string> {
        if (!topic) {
            return '⏰ กรุณาระบุเรื่องที่ต้องการเตือน\nExample: /daily เช็คอีเมล';
        }

        try {
            const d = new Date();
            d.setHours(9, 0, 0, 0);
            await this.prisma.reminder.create({
                data: { topic: topic.substring(0, 500), time: d, recurring: true, orgId }
            });
            return `⏰ ตั้งเตือนทุกวัน!\n📋 เรื่อง: "${topic.substring(0, 100)}"\n🔁 ทุกวัน เวลา 09:00`;
        } catch (error) {
            console.error('setReminderDaily error:', error);
            return '❌ ตั้งเตือนไม่สำเร็จ กรุณาลองใหม่';
        }
    }

    async getReminders(orgId: string): Promise<string> {
        try {
            const reminders = await this.prisma.reminder.findMany({
                where: { orgId },
                orderBy: { createdAt: 'desc' },
                take: 10
            });

            if (reminders.length === 0) return '📭 ไม่มีการเตือนความจำ';

            return `⏰ รายการเตือน:\n` + reminders.map((r, i) =>
                `${i + 1}. ${r.topic} ${r.recurring ? '🔁' : '📌'} ${r.time.toLocaleDateString('th-TH')}`
            ).join('\n');
        } catch (error) {
            console.error('getReminders error:', error);
            return '❌ โหลดรายการเตือนไม่สำเร็จ';
        }
    }
}
