import { Injectable } from '@nestjs/common';
import { StorageService, StorageQuotaService } from '../storage';
import { TaskService } from '../task/task.service';
import { MemoryService } from '../memory/memory.service';
import { ReminderService } from '../reminder/reminder.service';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';

type CommandHandler = (
  argsText: string,
  orgId: string,
  context?: { sourceType: 'user' | 'group'; userId?: string; groupId?: string },
) => Promise<string> | string;

@Injectable()
export class CommandService {
  private commandMap: Map<string, CommandHandler>;

  constructor(
    private readonly storageService: StorageService,
    private readonly storageQuotaService: StorageQuotaService,
    private readonly taskService: TaskService,
    private readonly memoryService: MemoryService,
    private readonly reminderService: ReminderService,
    private readonly aiService: AiService,
    private readonly prisma: PrismaService,
  ) {
    this.commandMap = new Map<string, CommandHandler>();
    this.registerCommands();
  }

  private registerCommands() {
    // ─── 1. ไฟล์ / Files ─────────────────────────
    // ส่งไฟล์เข้ามา = เก็บอัตโนมัติ (ไม่ต้องใช้คำสั่ง)
    this.registerAliases(
      ['files', 'ไฟล์'],
      async (_args, orgId) => await this.getRecentFiles(orgId),
    );
    this.registerAliases(
      ['file', 'ไฟล์ประเภท'],
      async (args, orgId) => await this.filesByType(args, orgId),
    );

    // ─── 2. สรุปแชท / Summary ────────────────────
    this.registerAliases(
      ['summary', 'สรุป'],
      async (_args, orgId) => await this.summarizeToday(orgId),
    );
    this.registerAliases(
      ['yesterday', 'เมื่อวาน'],
      async (_args, orgId) => await this.summarizeYesterday(orgId),
    );

    // ─── 3. งาน / Tasks ──────────────────────────
    this.registerAliases(
      ['task', 'งาน'],
      async (args, orgId) => {
        if (!args) return '📋 วิธีใช้ / Usage:\n/task ส่งรายงานพรุ่งนี้\n/task Submit report by Friday';
        return await this.taskService.createTask(args, orgId);
      },
    );
    this.registerAliases(
      ['mytasks', 'งานของฉัน'],
      async (_args, orgId, context) => await this.taskService.getMyTasks(context?.userId || 'unknown', orgId),
    );
    this.registerAliases(
      ['alltasks', 'งานทั้งหมด'],
      async (_args, orgId) => await this.taskService.getAllTasks(orgId),
    );
    this.registerAliases(
      ['assign', 'มอบหมาย'],
      async (args, orgId) => {
        const parts = args.split(' ');
        if (parts.length < 2) return '📋 วิธีใช้ / Usage:\n/assign @ชื่อ งานที่ต้องทำ\n/assign @john finish design';
        const user = parts[0].replace('@', '');
        const desc = parts.slice(1).join(' ');
        return await this.taskService.assignTask(user, desc, orgId);
      },
    );

    // ─── 4. ความจำ / Memory ──────────────────────
    this.registerAliases(
      ['note', 'บันทึก', 'จำ'],
      async (args, orgId) => await this.memoryService.saveMemory(args, orgId),
    );
    this.registerAliases(
      ['agreements', 'ข้อตกลง'],
      async (_args, orgId) => await this.memoryService.recallAgreement(orgId),
    );

    // ─── 5. เตือน / Remind ───────────────────────
    this.registerAliases(
      ['remind', 'เตือน'],
      async (args, orgId) => await this.reminderService.setReminderTomorrow(args, orgId),
    );

    // ─── 6. ระบบ / System ────────────────────────
    this.registerAliases(
      ['help', 'วิธีใช้', 'menu'],
      () => this.help(),
    );
  }

  private registerAliases(aliases: string[], handler: CommandHandler) {
    for (const alias of aliases) {
      this.commandMap.set(alias.toLowerCase(), handler);
    }
  }

  async handle(
    text: string,
    context?: { sourceType: 'user' | 'group'; userId?: string; groupId?: string },
  ): Promise<string> {
    const normalizedText = text.trim();
    const orgId = context?.groupId || context?.userId || 'personal';

    if (!normalizedText.startsWith('/')) {
      return 'พิมพ์ /help เพื่อดูคำสั่ง 📚';
    }

    const commandText = normalizedText.substring(1).trim();
    const [rawCommand, ...args] = commandText.split(' ');
    const command = rawCommand.toLowerCase();
    const argsText = args.join(' ');

    const handler = this.commandMap.get(command);
    if (handler) {
      return await handler(argsText, orgId, context);
    }

    return '❓ ไม่รู้จักคำสั่ง\nพิมพ์ /help เพื่อดูคำสั่งทั้งหมด';
  }

  // ═══════════════════════════════════════════════
  // File Upload (auto-save, no link shown)
  // ═══════════════════════════════════════════════
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

      await this.prisma.file.create({
        data: {
          filename,
          storageKey: key,
          storageUrl: url,
          contentType,
          sizeBytes: fileBuffer.length,
          uploadedBy: context.userId || 'unknown',
          orgId,
        },
      });

      return `📁 เก็บไฟล์สำเร็จ!\n📄 ${filename}\n📦 ${(fileBuffer.length / 1024).toFixed(1)} KB\n🔒 ใช้ /files เพื่อเรียกดู`;
    } catch (error) {
      if ((error as Error).message?.includes('quota')) {
        return '❌ พื้นที่เต็ม';
      }
      if ((error as Error).message?.includes('File too large')) {
        return '❌ ไฟล์ใหญ่เกินไป (max 20MB)';
      }
      return `❌ Error: ${(error as Error).message}`;
    }
  }

  // ═══════════════════════════════════════════════
  // File Search
  // ═══════════════════════════════════════════════
  private async getRecentFiles(orgId: string): Promise<string> {
    try {
      const files = await this.prisma.file.findMany({
        where: { orgId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      if (files.length === 0) return '📂 ยังไม่มีไฟล์\nส่งไฟล์/รูปเข้ามาในแชทได้เลย ระบบจะเก็บให้อัตโนมัติ!';

      const results: string[] = [];
      for (const f of files) {
        try {
          const tempUrl = await this.storageService.getPresignedUrl(f.storageKey, 3600);
          const ext = f.filename.split('.').pop()?.toUpperCase() || 'FILE';
          results.push(`${this.fileIcon(ext)} ${f.filename}\n   📦 ${(f.sizeBytes / 1024).toFixed(1)} KB | 📅 ${f.createdAt.toLocaleDateString('th-TH')}\n   🔗 ${tempUrl}`);
        } catch {
          results.push(`📄 ${f.filename} (ลิงก์ไม่พร้อม)`);
        }
      }
      return `📂 ไฟล์ทั้งหมด (${files.length} ล่าสุด):\n⏳ ลิงก์ใช้ได้ 1 ชม.\n\n` + results.join('\n\n');
    } catch (error) {
      console.error('getRecentFiles error:', error);
      return '❌ โหลดรายการไฟล์ไม่สำเร็จ ลองใหม่อีกครั้ง';
    }
  }

  private async filesByType(ext: string, orgId: string): Promise<string> {
    if (!ext) {
      return '📁 วิธีใช้: /file [นามสกุล]\nตัวอย่าง:\n/file pdf — ดูไฟล์ PDF\n/file jpg — ดูรูปภาพ JPG\n/file xls — ดูไฟล์ Excel';
    }

    try {
      const cleanExt = ext.toLowerCase().replace('.', '');
      const files = await this.prisma.file.findMany({
        where: { orgId, filename: { endsWith: `.${cleanExt}` } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      if (files.length === 0) return `📁 ไม่พบไฟล์ .${cleanExt}`;

      const results: string[] = [];
      for (const f of files) {
        try {
          const tempUrl = await this.storageService.getPresignedUrl(f.storageKey, 3600);
          results.push(`${this.fileIcon(cleanExt.toUpperCase())} ${f.filename}\n   📦 ${(f.sizeBytes / 1024).toFixed(1)} KB | 📅 ${f.createdAt.toLocaleDateString('th-TH')}\n   🔗 ${tempUrl}`);
        } catch {
          results.push(`📄 ${f.filename} (ลิงก์ไม่พร้อม)`);
        }
      }
      return `📁 ไฟล์ .${cleanExt} (${files.length}):\n⏳ ลิงก์ใช้ได้ 1 ชม.\n\n` + results.join('\n\n');
    } catch (error) {
      console.error('filesByType error:', error);
      return '❌ โหลดรายการไฟล์ไม่สำเร็จ ลองใหม่อีกครั้ง';
    }
  }

  private fileIcon(ext: string): string {
    const icons: Record<string, string> = {
      PDF: '📕', DOC: '📘', DOCX: '📘', XLS: '📗', XLSX: '📗',
      PPT: '📙', PPTX: '📙', JPG: '🖼️', JPEG: '🖼️', PNG: '🖼️',
      GIF: '🖼️', MP4: '🎬', MOV: '🎬', MP3: '🎵', M4A: '🎵',
      ZIP: '📦', RAR: '📦', TXT: '📝', CSV: '📊',
    };
    return icons[ext] || '📄';
  }

  // ═══════════════════════════════════════════════
  // Summarize Chat
  // ═══════════════════════════════════════════════
  private async summarizeToday(orgId: string): Promise<string> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const msgs = await this.prisma.message.findMany({
      where: { orgId, createdAt: { gte: today } },
      orderBy: { createdAt: 'asc' },
    });

    if (msgs.length === 0) return '📭 ยังไม่มีแชทวันนี้';

    return await this.aiService.summarizeText(
      msgs.map((m) => m.text).join('\n'),
    );
  }

  private async summarizeYesterday(orgId: string): Promise<string> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const msgs = await this.prisma.message.findMany({
      where: { orgId, createdAt: { gte: yesterday, lt: today } },
      orderBy: { createdAt: 'asc' },
    });

    if (msgs.length === 0) return '📭 ไม่มีแชทเมื่อวาน';

    return await this.aiService.summarizeText(
      msgs.map((m) => m.text).join('\n'),
    );
  }

  // ═══════════════════════════════════════════════
  // Help
  // ═══════════════════════════════════════════════
  private help(): string {
    return `📚 คำสั่ง Arkai:

📁 ไฟล์ — ส่งไฟล์/รูปเข้ามาเก็บอัตโนมัติ
• /files — ดูไฟล์ทั้งหมด (10 ล่าสุด)
• /file pdf — ดูเฉพาะไฟล์ PDF
• /file jpg — ดูเฉพาะรูปภาพ

📝 สรุปแชท
• /summary — สรุปแชทวันนี้ (AI)
• /yesterday — สรุปเมื่อวาน (AI)

✅ งาน
• /task [รายละเอียด] — สร้างงาน
• /assign @ชื่อ [งาน] — มอบหมาย
• /mytasks — งานของฉัน
• /alltasks — งานทั้งหมด

🧠 ความจำ
• /note [ข้อความ] — บันทึก
• /agreements — ดูข้อตกลง

⏰ เตือน
• /remind [เรื่อง] — เตือนพรุ่งนี้

💬 พิมพ์อะไรก็ได้ (ไม่มี /) AI จะคุยด้วย`;
  }
}