import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';

@Injectable()
export class TaskService {
    constructor(
        private prisma: PrismaService,
        private ai: AiService,
    ) { }

    async createTask(text: string, orgId: string): Promise<string> {
        try {
            const extracted = await this.ai.extractTask(text);

            const task = await this.prisma.task.create({
                data: {
                    title: extracted.title,
                    description: extracted.description,
                    dueDate: extracted.dueDate,
                    orgId,
                }
            });

            let response = `✅ สร้างงานสำเร็จ!\n📋 ${extracted.title}`;
            if (extracted.description) response += `\n📝 ${extracted.description}`;
            if (extracted.dueDate) response += `\n📅 กำหนดส่ง: ${extracted.dueDate.toLocaleDateString('th-TH')}`;
            response += `\n🆔 ID: ${task.id}`;
            return response;
        } catch (error) {
            console.error('createTask error:', error);
            return '❌ สร้างงานไม่สำเร็จ กรุณาลองใหม่';
        }
    }

    async assignTask(assignee: string, description: string, orgId: string): Promise<string> {
        try {
            const extracted = await this.ai.extractTask(description);

            await this.prisma.task.create({
                data: {
                    title: extracted.title,
                    description: extracted.description,
                    dueDate: extracted.dueDate,
                    assignee,
                    orgId,
                }
            });

            let response = `✅ มอบหมายงานสำเร็จ!\n👤 ผู้รับผิดชอบ: @${assignee}\n📋 ${extracted.title}`;
            if (extracted.dueDate) response += `\n📅 กำหนดส่ง: ${extracted.dueDate.toLocaleDateString('th-TH')}`;
            return response;
        } catch (error) {
            console.error('assignTask error:', error);
            return '❌ มอบหมายงานไม่สำเร็จ กรุณาลองใหม่';
        }
    }

    async getMyTasks(assignee: string, orgId: string): Promise<string> {
        try {
            const tasks = await this.prisma.task.findMany({
                where: { assignee, orgId, status: 'pending' },
                orderBy: { createdAt: 'desc' },
                take: 20,
            });

            if (tasks.length === 0) return '📝 ไม่มีงานค้าง';

            return `📝 งานของคุณ (${tasks.length}):\n` + tasks.map((t, i) =>
                `${i + 1}. ${t.title} ${t.dueDate ? `📅 ${t.dueDate.toLocaleDateString('th-TH')}` : ''} 🟡`
            ).join('\n');
        } catch (error) {
            console.error('getMyTasks error:', error);
            return '❌ โหลดงานไม่สำเร็จ กรุณาลองใหม่';
        }
    }

    async getAllTasks(orgId: string): Promise<string> {
        try {
            const tasks = await this.prisma.task.findMany({
                where: { orgId, status: 'pending' },
                orderBy: { createdAt: 'desc' },
                take: 30,
            });

            if (tasks.length === 0) return '📝 ไม่มีงานในกลุ่มนี้';

            return `📝 งานทั้งหมด (${tasks.length}):\n` + tasks.map((t, i) =>
                `${i + 1}. ${t.title} ${t.assignee ? `👤 @${t.assignee}` : ''} ${t.dueDate ? `📅 ${t.dueDate.toLocaleDateString('th-TH')}` : ''}`
            ).join('\n');
        } catch (error) {
            console.error('getAllTasks error:', error);
            return '❌ โหลดงานไม่สำเร็จ กรุณาลองใหม่';
        }
    }
}
