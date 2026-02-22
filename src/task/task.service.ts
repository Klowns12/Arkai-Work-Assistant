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

        await this.prisma.task.create({
            data: {
                title: extracted.title,
                description: extracted.description,
                dueDate: extracted.dueDate,
                orgId,
            }
        });

        return `✅ สร้างงานใหม่: "${extracted.title}"\n${extracted.dueDate ? `กำหนดส่ง: ${extracted.dueDate.toLocaleDateString()}` : ''}`;
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

        return `✅ มอบหมายงาน "${extracted.title}" ให้ ${assignee} เรียบร้อย`;
    }

    async getMyTasks(assignee: string, orgId: string): Promise<string> {
        const tasks = await this.prisma.task.findMany({
            where: { assignee, orgId, status: 'pending' },
            orderBy: { createdAt: 'desc' }
        });

        if (tasks.length === 0) return '📝 คุณไม่มีงานค้างอยู่ในขณะนี้';

        return `📝 งานของคุณ:\n` + tasks.map((t, i) => `${i + 1}. ${t.title} ${t.dueDate ? `(เสร็จภายใน ${t.dueDate.toLocaleDateString()})` : ''}`).join('\n');
    }

    async getAllTasks(orgId: string): Promise<string> {
        const tasks = await this.prisma.task.findMany({
            where: { orgId, status: 'pending' },
            orderBy: { createdAt: 'desc' }
        });

        if (tasks.length === 0) return '📝 ไม่มีงานในกลุ่มขณะนี้';

        return `📝 งานประจำกลุ่ม:\n` + tasks.map((t, i) => `${i + 1}. ${t.title} ${t.assignee ? `(@${t.assignee})` : ''}`).join('\n');
    }
}
