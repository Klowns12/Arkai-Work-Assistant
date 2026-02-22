import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MemoryService {
    constructor(private prisma: PrismaService) { }

    async saveMemory(text: string, orgId: string): Promise<string> {
        if (!text) {
            return '🧠 กรุณาระบุสิ่งที่ต้องการบันทึก\nExample: /note ตกลงว่าจะเปิดตัวศุกร์นี้';
        }

        try {
            // Auto-detect memory type from both Thai and English keywords
            let type = 'general';
            const lowerText = text.toLowerCase();
            if (lowerText.includes('ตกลง') || lowerText.includes('agree') || lowerText.includes('decided') || lowerText.includes('สรุปว่า')) {
                type = 'agreement';
            } else if (lowerText.includes('รับผิดชอบ') || lowerText.includes('responsible') || lowerText.includes('assigned') || lowerText.includes('มอบหมาย')) {
                type = 'responsibility';
            }

            await this.prisma.memory.create({
                data: { text: text.substring(0, 2000), type, orgId } // Limit text length
            });

            const typeLabel = type === 'agreement' ? '🤝 ข้อตกลง' :
                type === 'responsibility' ? '👤 ความรับผิดชอบ' :
                    '📝 บันทึกทั่วไป';

            return `✅ บันทึกสำเร็จ!\n${typeLabel}\n💬 "${text.substring(0, 200)}"`;
        } catch (error) {
            console.error('saveMemory error:', error);
            return '❌ บันทึกไม่สำเร็จ กรุณาลองใหม่';
        }
    }

    async recallAgreement(orgId: string): Promise<string> {
        try {
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

                if (allMemories.length === 0) return '🧠 ยังไม่มีการบันทึกใดๆ\nใช้ /note เพื่อบันทึก';

                return `🧠 บันทึกทั้งหมด (${allMemories.length}):\n` +
                    allMemories.map((m, i) => `${i + 1}. ${m.text} (${m.createdAt.toLocaleDateString('th-TH')})`).join('\n');
            }

            return `🤝 ข้อตกลงที่บันทึกไว้ (${memories.length}):\n` +
                memories.map((m, i) => `${i + 1}. ${m.text} (${m.createdAt.toLocaleDateString('th-TH')})`).join('\n');
        } catch (error) {
            console.error('recallAgreement error:', error);
            return '❌ โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่';
        }
    }

    async recallResponsibility(project: string, orgId: string): Promise<string> {
        try {
            if (!project) {
                const memories = await this.prisma.memory.findMany({
                    where: { orgId, type: 'responsibility' },
                    orderBy: { createdAt: 'desc' },
                    take: 10
                });

                if (memories.length === 0) return '🧠 ยังไม่มีการบันทึกผู้รับผิดชอบ';

                return `👤 ผู้รับผิดชอบทั้งหมด:\n` +
                    memories.map((m, i) => `${i + 1}. ${m.text}`).join('\n');
            }

            const memories = await this.prisma.memory.findMany({
                where: { orgId, type: 'responsibility', text: { contains: project } },
                orderBy: { createdAt: 'desc' }
            });

            if (memories.length === 0) {
                const broadSearch = await this.prisma.memory.findMany({
                    where: { orgId, text: { contains: project } },
                    orderBy: { createdAt: 'desc' },
                    take: 5
                });

                if (broadSearch.length === 0) return `🔍 ไม่พบข้อมูลเกี่ยวกับ "${project}"`;

                return `🔍 ผลค้นหา "${project}":\n` +
                    broadSearch.map((m, i) => `${i + 1}. ${m.text}`).join('\n');
            }

            return `👤 ผู้รับผิดชอบ "${project}":\n` +
                memories.map((m, i) => `${i + 1}. ${m.text}`).join('\n');
        } catch (error) {
            console.error('recallResponsibility error:', error);
            return '❌ โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่';
        }
    }
}
