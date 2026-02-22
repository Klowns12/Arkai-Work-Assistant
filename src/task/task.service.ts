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
        const extracted = await this.ai.extractTask(text);

        const task = await this.prisma.task.create({
            data: {
                title: extracted.title,
                description: extracted.description,
                dueDate: extracted.dueDate,
                orgId,
            }
        });

        let response = `✅ สร้างงานสำเร็จ / Task created!\n📋 ${extracted.title}`;
        if (extracted.description) response += `\n📝 ${extracted.description}`;
        if (extracted.dueDate) response += `\n📅 กำหนดส่ง / Due: ${extracted.dueDate.toLocaleDateString('th-TH')}`;
        response += `\n🆔 ID: ${task.id}`;
        return response;
    }

    async assignTask(assignee: string, description: string, orgId: string): Promise<string> {
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

        let response = `✅ มอบหมายงานสำเร็จ / Task assigned!\n👤 ผู้รับผิดชอบ / Assignee: @${assignee}\n📋 ${extracted.title}`;
        if (extracted.dueDate) response += `\n📅 กำหนดส่ง / Due: ${extracted.dueDate.toLocaleDateString('th-TH')}`;
        return response;
    }

    async getMyTasks(assignee: string, orgId: string): Promise<string> {
        const tasks = await this.prisma.task.findMany({
            where: { assignee, orgId, status: 'pending' },
            orderBy: { createdAt: 'desc' }
        });

        if (tasks.length === 0) return '📝 ไม่มีงานค้าง / No pending tasks';

        return `📝 งานของคุณ / Your tasks (${tasks.length}):\n` + tasks.map((t, i) =>
            `${i + 1}. ${t.title} ${t.dueDate ? `📅 ${t.dueDate.toLocaleDateString('th-TH')}` : ''} ${t.status === 'pending' ? '🟡' : '✅'}`
        ).join('\n');
    }

    async getAllTasks(orgId: string): Promise<string> {
        const tasks = await this.prisma.task.findMany({
            where: { orgId, status: 'pending' },
            orderBy: { createdAt: 'desc' }
        });

        if (tasks.length === 0) return '📝 ไม่มีงานในกลุ่มนี้ / No tasks in this group';

        return `📝 งานทั้งหมด / All tasks (${tasks.length}):\n` + tasks.map((t, i) =>
            `${i + 1}. ${t.title} ${t.assignee ? `👤 @${t.assignee}` : ''} ${t.dueDate ? `📅 ${t.dueDate.toLocaleDateString('th-TH')}` : ''}`
        ).join('\n');
    }
}
