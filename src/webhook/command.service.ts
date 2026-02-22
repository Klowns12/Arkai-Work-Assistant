import { Injectable } from '@nestjs/common';
import { StorageService, StorageQuotaService } from '../storage';
import { TaskService } from '../task/task.service';
import { MemoryService } from '../memory/memory.service';
import { ReminderService } from '../reminder/reminder.service';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';

type CommandHandler = (argsText: string, orgId: string, context?: { sourceType: 'user' | 'group'; userId?: string; groupId?: string }) => Promise<string> | string;

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
    // --- File Management ---
    this.registerAliases(['เก็บไฟล์นี้', 'เก็บไฟล์', 'upload', 'savefile'], (_args) => {
      return '📁 ส่งไฟล์/รูปภาพเข้ามาในแชทได้เลย ระบบจะเก็บให้อัตโนมัติ\n📁 Just send a file/image to this chat — it will be saved automatically!';
    });

    this.registerAliases(['หาไฟล์', 'findfile', 'search'], async (_args, orgId) => {
      return await this.findFiles(_args, orgId);
    });

    this.registerAliases(['เปิดไฟล์ล่าสุด', 'files', 'recentfiles'], async (_args, orgId) => {
      return await this.getRecentFiles(orgId);
    });

    // --- Summarize Chat ---
    this.registerAliases(['สรุปวันนี้', 'sum', 'today', 'summary'], async (_args, orgId) => {
      return await this.summarizeToday(orgId);
    });

    this.registerAliases(['สรุปเมื่อวาน', 'yesterday'], async (_args, orgId) => {
      return await this.summarizeYesterday(orgId);
    });

    this.registerAliases(['สรุปเรื่อง', 'topic', 'about'], async (args, orgId) => {
      return await this.summarizeTopic(args, orgId);
    });

    this.registerAliases(['สรุปงานของ', 'workof', 'userwork'], async (args, orgId) => {
      return await this.summarizeUserWork(args, orgId);
    });

    // --- Task Management ---
    this.registerAliases(['สร้างงาน', 'newtask', 'createtask'], async (_args, orgId) => {
      return await this.createTask('', orgId);
    });

    this.registerAliases(['มอบหมาย', 'assign'], async (args, orgId) => {
      return await this.assignTask(args, orgId);
    });

    this.registerAliases(['งานของฉัน', 'tasks', 'mytasks'], async (_args, orgId, context) => {
      return await this.taskService.getMyTasks(context?.userId || 'unknown', orgId);
    });

    this.registerAliases(['งานทั้งหมด', 'alltasks'], async (_args, orgId) => {
      return await this.taskService.getAllTasks(orgId);
    });

    // --- Reminders ---
    this.registerAliases(['เตือนพรุ่งนี้', 'remindtomorrow', 'remind'], async (args, orgId) => {
      return await this.reminderService.setReminderTomorrow(args, orgId);
    });

    this.registerAliases(['เตือนทุกวัน', 'reminddaily', 'daily'], async (args, orgId) => {
      return await this.reminderService.setReminderDaily(args, orgId);
    });

    // --- Memory ---
    this.registerAliases(['บันทึกว่า', 'note', 'remember', 'save'], async (args, orgId) => {
      return await this.memoryService.saveMemory(args, orgId);
    });

    this.registerAliases(['เราตกลงอะไร', 'agreements', 'decided'], async (_args, orgId) => {
      return await this.memoryService.recallAgreement(orgId);
    });

    this.registerAliases(['ใครรับผิดชอบ', 'whois', 'responsible'], async (args, orgId) => {
      return await this.memoryService.recallResponsibility(args, orgId);
    });

    // --- System & Status ---
    this.registerAliases(['สถานะแพ็กเกจ', 'status', 'plan'], (_args) => {
      return '✅ สถานะแพ็กเกจ / Package Status: Active (Arkai AI Assistant)';
    });

    this.registerAliases(['พื้นที่เหลือเท่าไร', 'storage', 'quota'], (_args, orgId) => {
      return this.storageStatus(orgId);
    });

    this.registerAliases(['วิธีใช้', 'help', 'menu', 'คำสั่ง', 'commands'], (_args) => {
      return this.help();
    });
  }

  private registerAliases(aliases: string[], handler: CommandHandler) {
    for (const alias of aliases) {
      this.commandMap.set(alias.toLowerCase(), handler);
    }
  }

  async handle(text: string, context?: { sourceType: 'user' | 'group'; userId?: string; groupId?: string }): Promise<string> {
    const normalizedText = text.trim();
    const orgId = context?.groupId || context?.userId || 'personal';

    if (!normalizedText.startsWith('/')) {
      return 'กรุณาใช้รูปแบบ / Please use format: /[command]\nExample: /help, /สรุปวันนี้, /today';
    }

    const commandText = normalizedText.substring(1).trim();
    const [rawCommand, ...args] = commandText.split(' ');
    const command = rawCommand.toLowerCase();
    const argsText = args.join(' ');

    // Handle /งาน: and /task: prefix
    if (command.startsWith('งาน:') || command.startsWith('task:')) {
      const prefixLen = command.startsWith('งาน:') ? 4 : 5;
      const taskText = command.substring(prefixLen).trim() + ' ' + argsText;
      return await this.taskService.createTask(taskText.trim(), orgId);
    }
    if (command === 'งาน:' || command === 'task:') {
      return await this.taskService.createTask(argsText, orgId);
    }

    // Look up in command map
    const handler = this.commandMap.get(command);
    if (handler) {
      return await handler(argsText, orgId, context);
    }

    return '❓ ไม่รู้จักคำสั่ง / Unknown command\nพิมพ์ / Type: /help เพื่อดูรายการคำสั่ง / to see all commands';
  }

  // File upload handler — auto-save, no link shown
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

      // Save file metadata to DB
      await this.prisma.file.create({
        data: {
          filename,
          storageKey: key,
          storageUrl: url,
          contentType,
          sizeBytes: fileBuffer.length,
          uploadedBy: context.userId || 'unknown',
          orgId,
        }
      });

      // Do NOT show link — only show via /findfile or /files
      return `📁 เก็บไฟล์สำเร็จ / File saved!\n📄 ${filename}\n📦 ${(fileBuffer.length / 1024).toFixed(1)} KB\n🔒 ใช้ /files หรือ /findfile เพื่อเรียกดู`;
    } catch (error) {
      if ((error as Error).message?.includes('quota')) {
        return '❌ พื้นที่จัดเก็บเต็ม / Storage quota exceeded';
      }
      if ((error as Error).message?.includes('File too large')) {
        return '❌ ไฟล์ใหญ่เกินไป / File too large (max 20MB)';
      }
      return `❌ เกิดข้อผิดพลาด / Error: ${(error as Error).message}`;
    }
  }

  // --- File search ---
  private async findFiles(query: string, orgId: string): Promise<string> {
    if (!query) return '🔍 กรุณาระบุชื่อไฟล์ / Please specify a filename\nExample: /findfile report';

    const files = await this.prisma.file.findMany({
      where: { orgId, filename: { contains: query } },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    if (files.length === 0) return `🔍 ไม่พบไฟล์ "${query}" / No files found for "${query}"`;

    const results: string[] = [];
    for (const f of files) {
      const tempUrl = await this.storageService.getPresignedUrl(f.storageKey, 3600);
      results.push(`📄 ${f.filename}\n📦 ${(f.sizeBytes / 1024).toFixed(1)} KB | 📅 ${f.createdAt.toLocaleDateString('th-TH')}\n🔗 ${tempUrl}`);
    }
    return `🔍 ผลค้นหา "${query}" / Search results (${files.length}):\n\n` + results.join('\n\n');
  }

  private async getRecentFiles(orgId: string): Promise<string> {
    const files = await this.prisma.file.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    if (files.length === 0) return '📂 ยังไม่มีไฟล์ / No files saved yet';

    const results: string[] = [];
    for (const f of files) {
      const tempUrl = await this.storageService.getPresignedUrl(f.storageKey, 3600);
      results.push(`📄 ${f.filename}\n📦 ${(f.sizeBytes / 1024).toFixed(1)} KB | 📅 ${f.createdAt.toLocaleDateString('th-TH')}\n🔗 ${tempUrl}`);
    }
    return `📂 ไฟล์ล่าสุด / Recent files (${files.length}):\n⏳ ลิงก์ใช้ได้ 1 ชั่วโมง / Links expire in 1 hour\n\n` + results.join('\n\n');
  }

  // --- Summarize ---
  private async summarizeToday(orgId: string): Promise<string> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const msgs = await this.prisma.message.findMany({
      where: { orgId, createdAt: { gte: today } },
      orderBy: { createdAt: 'asc' }
    });

    if (msgs.length === 0) return '📭 ยังไม่มีการพูดคุยในวันนี้ / No messages today';

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

    if (msgs.length === 0) return '📭 ไม่มีบันทึกเมื่อวาน / No messages yesterday';

    return await this.aiService.summarizeText(msgs.map(m => m.text).join('\n'));
  }

  private async summarizeTopic(topic: string, orgId: string): Promise<string> {
    if (!topic) return 'กรุณาระบุหัวข้อ / Please specify a topic\nExample: /topic meeting';

    const msgs = await this.prisma.message.findMany({
      where: { orgId, text: { contains: topic } },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    if (msgs.length === 0) return `📭 ไม่พบเรื่อง "${topic}" / No messages about "${topic}"`;

    return await this.aiService.summarizeText(msgs.map(m => m.text).reverse().join('\n'));
  }

  private async summarizeUserWork(mention: string, orgId: string): Promise<string> {
    if (!mention) return 'กรุณาระบุชื่อ / Please specify a user\nExample: /workof @username';

    const cleanMention = mention.replace('@', '');
    const tasks = await this.prisma.task.findMany({
      where: { assignee: cleanMention, orgId }
    });

    if (tasks.length === 0) return `📭 ไม่พบงานของ ${mention} / No tasks found for ${mention}`;

    return `📝 สรุปงานของ / Tasks for ${mention}:\n` + tasks.map((t, i) => `${i + 1}. ${t.title} [${t.status}]`).join('\n');
  }

  // --- Task ---
  private async createTask(taskText: string, orgId: string): Promise<string> {
    if (!taskText) {
      return '📋 สร้างงาน / Create Task:\nใช้ / Use: /task: [details]\nตัวอย่าง / Example: /task: Submit report tomorrow';
    }
    return await this.taskService.createTask(taskText, orgId);
  }

  private async assignTask(args: string, orgId: string): Promise<string> {
    const parts = args.split(' ');
    if (parts.length < 2) {
      return 'รูปแบบ / Format: /assign @name task details\nตัวอย่าง / Example: /assign @john finish design by Friday';
    }
    const user = parts[0].replace('@', '');
    const remaining = parts.slice(1).join(' ');
    return await this.taskService.assignTask(user, remaining, orgId);
  }

  // --- System ---
  private storageStatus(orgId: string): string {
    const status = this.storageQuotaService.getStorageStatus(orgId);
    return `📊 พื้นที่จัดเก็บ / Storage\nUsed: ${status.used}\nQuota: ${status.quota}\nRemaining: ${100 - status.percentage}% (${status.fileCount} files)`;
  }

  private help(): string {
    return `📚 Arkai Commands / คำสั่ง Arkai:

📁 Files / ไฟล์
• /upload, /เก็บไฟล์ — Save file / เก็บไฟล์
• /findfile [name], /หาไฟล์ — Find file / หาไฟล์
• /files, /เปิดไฟล์ล่าสุด — Recent files / ไฟล์ล่าสุด

📝 Summary / สรุป
• /today, /สรุปวันนี้ — Today's summary / สรุปวันนี้
• /yesterday, /สรุปเมื่อวาน — Yesterday / เมื่อวาน
• /topic [subject], /สรุปเรื่อง — By topic / ตามหัวข้อ
• /workof @name, /สรุปงานของ — User's work / งานของคน

✅ Tasks / งาน
• /newtask, /สร้างงาน — New task / สร้างงานใหม่
• /task: [details], /งาน: — Quick create / สร้างเร็ว
• /assign @name [task], /มอบหมาย — Assign / มอบหมาย
• /mytasks, /งานของฉัน — My tasks / งานของฉัน
• /alltasks, /งานทั้งหมด — All tasks / งานทั้งหมด

⏰ Reminders / เตือน
• /remind [text], /เตือนพรุ่งนี้ — Tomorrow / พรุ่งนี้
• /daily [text], /เตือนทุกวัน — Daily / ทุกวัน

🧠 Memory / ความจำ
• /note [text], /บันทึกว่า — Save note / บันทึก
• /agreements, /เราตกลงอะไร — Recall / ทบทวน
• /whois [topic], /ใครรับผิดชอบ — Who's responsible

📊 System / ระบบ
• /status, /สถานะแพ็กเกจ — Package status
• /storage, /พื้นที่เหลือเท่าไร — Storage info
• /help, /วิธีใช้ — This menu / เมนูนี้`;
  }
}