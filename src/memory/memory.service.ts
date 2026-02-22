import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MemoryService {
    constructor(private prisma: PrismaService) { }

    async saveMemory(text: string, orgId: string): Promise<string> {
        const type = text.includes('ตกลง') ? 'agreement' : (text.includes('รับผิดชอบ') ? 'responsibility' : 'general');
        await this.prisma.memory.create({
            data: { text, type, orgId }
        });
        return `✅ บันทึกความจำ: "${text}" เรียบร้อยครับ`;
    }

    async recallAgreement(orgId: string): Promise<string> {
        const memories = await this.prisma.memory.findMany({
            where: { orgId, type: 'agreement' },
            orderBy: { createdAt: 'desc' },
            take: 5
        });

        if (memories.length === 0) return '🧠 ยังไม่มีข้อตกลงที่ถูกบันทึกไว้ในกลุ่มนี้ครับ';
        return `🤝 ข้อตกลงล่าสุดที่เราบันทึกไว้:\n` + memories.map((m, i) => `${i + 1}. ${m.text}`).join('\n');
    }

    async recallResponsibility(project: string, orgId: string): Promise<string> {
        const memories = await this.prisma.memory.findMany({
            where: { orgId, type: 'responsibility', text: { contains: project } },
            orderBy: { createdAt: 'desc' }
        });

        if (memories.length === 0) return `🤷 ไม่พบผู้รับผิดชอบสำหรับงานหรือโปรเจคที่มีคำว่า "${project}" ครับ`;
        return `📌 ความรับผิดชอบเกี่ยวกับ "${project}":\n` + memories.map((m, i) => `${i + 1}. ${m.text}`).join('\n');
    }
}
