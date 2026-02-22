import { Injectable } from '@nestjs/common';
import { StorageService, StorageQuotaService } from '../storage';
import { TaskService } from '../task/task.service';
import { MemoryService } from '../memory/memory.service';
import { ReminderService } from '../reminder/reminder.service';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CommandService {
  constructor(
    private readonly storageService: StorageService,
    private readonly storageQuotaService: StorageQuotaService,
    private readonly taskService: TaskService,
    private readonly memoryService: MemoryService,
    private readonly reminderService: ReminderService,
    private readonly aiService: AiService,
    private readonly prisma: PrismaService,
  ) { }

  async handle(text: string, context?: { sourceType: 'user' | 'group'; userId?: string; groupId?: string }): Promise<string> {
    const normalizedText = text.trim();
    const orgId = context?.groupId || context?.userId || 'personal';

    // Only support / prefix
    if (!normalizedText.startsWith('/')) {
      return 'กรุณาใช้รูปแบบ: /[คำสั่ง] เช่น /สรุปวันนี้ หรือ /help';
    }
    const commandText = normalizedText.substring(1).trim();

    const [command, ...args] = commandText.split(' ');
    const argsText = args.join(' ');

    // หมวดที่ 1: จัดการไฟล์
    if (command === 'เก็บไฟล์นี้' || command === 'เก็บไฟล์') {
      return this.storeFile();
    }
    if (command === 'หาไฟล์') {
      return this.findFile(argsText);
    }
    if (command === 'เปิดไฟล์ล่าสุด' || command === 'files') {
      return this.openRecentFile();
    }

    // หมวดที่ 2: สรุปการคุย
    if (command === 'สรุปวันนี้' || command === 'sum' || command === 'today') {
      return await this.summarizeToday(orgId);
    }
    if (command === 'สรุปเมื่อวาน') {
      return await this.summarizeYesterday(orgId);
    }
    if (command === 'สรุปเรื่อง') {
      return await this.summarizeTopic(argsText, orgId);
    }
    if (command === 'สรุปงานของ') {
      return await this.summarizeUserWork(argsText, orgId);
    }

    // หมวดที่ 3: งาน / Task
    if (command === 'สร้างงาน') {
      return await this.createTask('', orgId);
    }
    if (command === 'งาน:') {
      return await this.createTask(argsText, orgId);
    }
    if (command.startsWith('งาน:')) {
      return await this.createTask(command.substring(4).trim() + ' ' + argsText, orgId);
    }
    if (command === 'มอบหมาย') {
      return await this.assignTask(argsText, orgId);
    }
    if (command === 'งานของฉัน' || command === 'tasks') {
      return await this.taskService.getMyTasks(context?.userId || 'unknown', orgId);
    }
    if (command === 'งานทั้งหมด') {
      return await this.taskService.getAllTasks(orgId);
    }

    // หมวดที่ 4: เตือนความจำ
    if (command === 'เตือนพรุ่งนี้') {
      return await this.reminderService.setReminderTomorrow(argsText, orgId);
    }
    if (command === 'เตือนทุกวัน') {
      return await this.reminderService.setReminderDaily(argsText, orgId);
    }

    // หมวดที่ 5: Memory / บริบท
    if (command === 'บันทึกว่า') {
      return await this.memoryService.saveMemory(argsText, orgId);
    }
    if (command === 'เราตกลงอะไร') {
      return await this.memoryService.recallAgreement(orgId);
    }
    if (command === 'ใครรับผิดชอบ') {
      return await this.memoryService.recallResponsibility(argsText, orgId);
    }

    // หมวดที่ 6: สถานะ & ระบบ
    if (command === 'สถานะแพ็กเกจ') {
      return this.packageStatus();
    }
    if (command === 'พื้นที่เหลือเท่าไร' || command === 'storage') {
      return this.storageStatus(orgId);
    }
    if (command === 'วิธีใช้' || command === 'help') {
      return this.help();
    }

    return 'ไม่รู้จักคำสั่ง พิมพ์ /help เพื่อดูรายการคำสั่ง';
  }

  // File upload handler
  async handleFileUpload(
    fileBuffer: Buffer,
    filename: string,
    contentType: string,
    context: { sourceType: 'user' | 'group'; userId?: string; groupId?: string },
  ): Promise<string> {
    const orgId = context.groupId || context.userId || 'personal';

    try {
      await this.storageQuotaService.checkQuota(orgId, fileBuffer.length);
      const key = this.storageService.generateKey(orgId, filename);
      const url = await this.storageService.uploadFile(key, fileBuffer, contentType);
      await this.storageQuotaService.trackUpload(orgId, fileBuffer.length);
      return `📁 เก็บไฟล์สำเร็จ\nชื่อ: ${filename}\nขนาด: ${(fileBuffer.length / 1024).toFixed(1)} KB\nลิงก์: ${url}`;
    } catch (error) {
      if ((error as Error).message?.includes('quota')) {
        return '❌ พื้นที่จัดเก็บเต็ม กรุณาติดต่อแอดมิน';
      }
      if ((error as Error).message?.includes('File too large')) {
        return '❌ ไฟล์ใหญ่เกินไป (สูงสุด 20MB)';
      }
      return `❌ เกิดข้อผิดพลาด: ${(error as Error).message}`;
    }
  }

  // --- หมวดที่ 1: จัดการไฟล์ ---
  private storeFile(): string {
    return 'กำลังเก็บไฟล์... (ฟีเจอร์นี้ต้องแนบไฟล์มาพร้อมกับข้อความ)';
  }

  private findFile(query: string): string {
    if (!query) return 'กรุณาระบุชื่อไฟล์ที่ต้องการค้นหา เช่น: /หาไฟล์ report.pdf';
    return `กำลังค้นหาไฟล์ "${query}"... (ฟีเจอร์ค้นหาไฟล์อยู่ระหว่างพัฒนา)`;
  }

  private openRecentFile(): string {
    return 'กำลังเปิดไฟล์ล่าสุด... (ฟีเจอร์เปิดไฟล์ล่าสุดอยู่ระหว่างพัฒนา)';
  }

  // --- หมวดที่ 2: สรุปการคุย ---
  private async summarizeToday(orgId: string): Promise<string> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const msgs = await this.prisma.message.findMany({
      where: { orgId, createdAt: { gte: today } },
      orderBy: { createdAt: 'asc' }
    });

    if (msgs.length === 0) return '📭 ยังไม่มีการพูดคุยในวันนี้เลยครับ';

    const textToSummarize = msgs.map(m => m.text).join('\n');
    return await this.aiService.summarizeText(textToSummarize);
  }

  private async summarizeYesterday(orgId: string): Promise<string> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const msgs = await this.prisma.message.findMany({
      where: { orgId, createdAt: { gte: yesterday, lt: today } },
      orderBy: { createdAt: 'asc' }
    });

    if (msgs.length === 0) return '📭 ไม่มีบันทึกการพูดคุยของเมื่อวานครับ';

    return await this.aiService.summarizeText(msgs.map(m => m.text).join('\n'));
  }

  private async summarizeTopic(topic: string, orgId: string): Promise<string> {
    if (!topic) return 'กรุณาระบุหัวข้อที่ต้องการสรุป เช่น: /สรุปเรื่อง ประชุมลูกค้า';

    const msgs = await this.prisma.message.findMany({
      where: { orgId, text: { contains: topic } },
      orderBy: { createdAt: 'desc' },
      take: 50 // limitation for simple full text search
    });

    if (msgs.length === 0) return `📭 ไม่พบการพูดคุยเรื่อง "${topic}" ในแชทนี้ครับ`;

    return await this.aiService.summarizeText(msgs.map(m => m.text).reverse().join('\n'));
  }

  private async summarizeUserWork(mention: string, orgId: string): Promise<string> {
    if (!mention) return 'กรุณาระบุชื่อผู้ใช้ เช่น: /สรุปงานของ @username';

    const cleanMention = mention.replace('@', '');
    const tasks = await this.prisma.task.findMany({
      where: { assignee: cleanMention, orgId }
    });

    if (tasks.length === 0) return `📭 ไม่พบงานของ ${mention} ครับ`;

    return `📝 สรุปงานของ ${mention}:\n` + tasks.map((t, i) => `${i + 1}. ${t.title} [สถานะ: ${t.status}]`).join('\n');
  }

  // --- หมวดที่ 3: งาน / Task ---
  private async createTask(taskText: string, orgId: string): Promise<string> {
    if (!taskText) {
      return 'ฟอร์มสร้างงาน:\n1. ชื่องาน: ___\n2. รายละเอียด: ___\n3. กำหนดส่ง: ___\n\nหรือใช้รูปแบบเร็ว: /งาน: ส่งรายงานพรุ่งนี้';
    }
    return await this.taskService.createTask(taskText, orgId);
  }

  private async assignTask(args: string, orgId: string): Promise<string> {
    const parts = args.split(' ');
    if (parts.length < 2) {
      return 'กรุณาระบุรูปแบบ: /มอบหมาย @ชื่อ รายละเอียดงาน วันเวลา';
    }
    const user = parts[0].replace('@', '');
    const remaining = parts.slice(1).join(' ');
    return await this.taskService.assignTask(user, remaining, orgId);
  }

  // --- หมวดที่ 6: สถานะ & ระบบ ---
  private packageStatus(): string {
    return '✅ สถานะแพ็กเกจ: ใช้งานปกติ (Arkai AI Assistant Active)';
  }

  private storageStatus(orgId: string): string {
    const status = this.storageQuotaService.getStorageStatus(orgId);
    return `📊 พื้นที่จัดเก็บ\nใช้ไป: ${status.used}\nโควต้า: ${status.quota}\nคงเหลือ: ${100 - status.percentage}% (${status.fileCount} ไฟล์)`;
  }

  private help(): string {
    return `📚 รายการคำสั่งที่ใช้ได้:

📁 จัดการไฟล์
• /เก็บไฟล์นี้ (แนบไฟล์มาพร้อมกับข้อความ)
• /หาไฟล์ [ชื่อ]
• /เปิดไฟล์ล่าสุด (/files)

📝 สรุปการคุย
• /สรุปวันนี้ (/sum, /today)
• /สรุปเมื่อวาน
• /สรุปเรื่อง [หัวข้อ]
• /สรุปงานของ @ชื่อ

✅ งาน / Task
• /สร้างงาน
• /งาน: [รายละเอียดงาน]
• /มอบหมาย @ชื่อ [งาน]
• /งานของฉัน (/tasks)
• /งานทั้งหมด

⏰ เตือนความจำ
• /เตือนพรุ่งนี้ [เรื่อง]
• /เตือนทุกวัน [เรื่อง]

🧠 Memory / บริบท
• /บันทึกว่า [ข้อตกลงหรือความจำ]
• /เราตกลงอะไร
• /ใครรับผิดชอบ [โปรเจค/งาน]

📊 สถานะ & ระบบ
• /สถานะแพ็กเกจ
• /พื้นที่เหลือเท่าไร (/storage)
• /help`;
  }
}