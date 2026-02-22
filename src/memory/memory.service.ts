import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MemoryService {
    constructor(private prisma: PrismaService) { }

    async saveMemory(text: string, orgId: string): Promise<string> {
        if (!text) {
            return '🧠 กรุณาระบุสิ่งที่ต้องการบันทึก / Please specify what to remember\nExample: /note We agreed to launch on Friday';
        }

        // Auto-detect memory type from both Thai and English keywords
        let type = 'general';
        const lowerText = text.toLowerCase();
        if (lowerText.includes('ตกลง') || lowerText.includes('agree') || lowerText.includes('decided') || lowerText.includes('สรุปว่า')) {
            type = 'agreement';
        } else if (lowerText.includes('รับผิดชอบ') || lowerText.includes('responsible') || lowerText.includes('assigned') || lowerText.includes('มอบหมาย')) {
            type = 'responsibility';
        }

        await this.prisma.memory.create({
            data: { text, type, orgId }
        });

        const typeLabel = type === 'agreement' ? '🤝 ข้อตกลง / Agreement' :
            type === 'responsibility' ? '👤 ความรับผิดชอบ / Responsibility' :
                '📝 บันทึกทั่วไป / General Note';

        return `✅ บันทึกสำเร็จ / Saved!\n${typeLabel}\n💬 "${text}"`;
    }

    async recallAgreement(orgId: string): Promise<string> {
        const memories = await this.prisma.memory.findMany({
            where: { orgId, type: 'agreement' },
            orderBy: { createdAt: 'desc' },
            take: 10
        });

        if (memories.length === 0) {
            // Fallback: search all memories
            const allMemories = await this.prisma.memory.findMany({
                where: { orgId },
                orderBy: { createdAt: 'desc' },
                take: 10
            });

            if (allMemories.length === 0) return '🧠 ยังไม่มีการบันทึกใดๆ / No memories saved yet\nใช้ /note หรือ /บันทึกว่า เพื่อบันทึก';

            return `🧠 บันทึกทั้งหมด / All memories (${allMemories.length}):\n` +
                allMemories.map((m, i) => `${i + 1}. ${m.text} (${m.createdAt.toLocaleDateString('th-TH')})`).join('\n');
        }

        return `🤝 ข้อตกลงที่บันทึกไว้ / Recorded agreements (${memories.length}):\n` +
            memories.map((m, i) => `${i + 1}. ${m.text} (${m.createdAt.toLocaleDateString('th-TH')})`).join('\n');
    }

    async recallResponsibility(project: string, orgId: string): Promise<string> {
        if (!project) {
            // Show all responsibilities
            const memories = await this.prisma.memory.findMany({
                where: { orgId, type: 'responsibility' },
                orderBy: { createdAt: 'desc' },
                take: 10
            });

            if (memories.length === 0) return '🧠 ยังไม่มีการบันทึกผู้รับผิดชอบ / No responsibilities recorded';

            return `👤 ผู้รับผิดชอบทั้งหมด / All responsibilities:\n` +
                memories.map((m, i) => `${i + 1}. ${m.text}`).join('\n');
        }

        const memories = await this.prisma.memory.findMany({
            where: { orgId, type: 'responsibility', text: { contains: project } },
            orderBy: { createdAt: 'desc' }
        });

        if (memories.length === 0) {
            // Broader search across all memory types
            const broadSearch = await this.prisma.memory.findMany({
                where: { orgId, text: { contains: project } },
                orderBy: { createdAt: 'desc' },
                take: 5
            });

            if (broadSearch.length === 0) return `🔍 ไม่พบข้อมูลเกี่ยวกับ "${project}" / No info found about "${project}"`;

            return `🔍 ผลค้นหา "${project}" / Search results:\n` +
                broadSearch.map((m, i) => `${i + 1}. ${m.text}`).join('\n');
        }

        return `👤 ผู้รับผิดชอบ "${project}" / Responsible for "${project}":\n` +
            memories.map((m, i) => `${i + 1}. ${m.text}`).join('\n');
    }
}
