import { Controller, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import * as crypto from 'crypto';
import axios from 'axios';
import { CommandService } from './command.service';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionService } from '../subscription/subscription.service';

@Controller('webhook')
export class WebhookController {
  private channelSecret: string;
  private accessToken: string;

  constructor(
    private readonly commandService: CommandService,
    private readonly aiService: AiService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly subscriptionService: SubscriptionService,
  ) {
    this.channelSecret =
      this.configService.get<string>('LINE_CHANNEL_SECRET') || '';
    this.accessToken =
      this.configService.get<string>('LINE_CHANNEL_ACCESS_TOKEN') || '';
  }

  @Post()
  async handleWebhook(@Req() req: Request, @Res() res: Response) {
    // Validate env vars
    if (!this.channelSecret || !this.accessToken) {
      console.error('Missing LINE_CHANNEL_SECRET or LINE_CHANNEL_ACCESS_TOKEN');
      return res.status(500).send('Missing environment variables');
    }

    // Validate signature
    const signature = req.headers['x-line-signature'] as string;
    const rawBody = (req as any).rawBody;

    if (!rawBody || !signature) {
      return res.status(400).send('Bad request');
    }

    const hash = crypto
      .createHmac('sha256', this.channelSecret)
      .update(rawBody)
      .digest('base64');

    if (hash !== signature) {
      return res.status(401).send('Invalid signature');
    }

    const events = req.body?.events;
    if (!events || !Array.isArray(events)) {
      return res.status(200).send('OK');
    }

    // Process events — respond 200 immediately then process
    res.status(200).send('OK');

    for (const event of events) {
      try {
        await this.processEvent(event);
      } catch (error) {
        console.error('Event processing error:', error);
      }
    }
  }

  private async processEvent(event: any): Promise<void> {
    // Log every incoming event for debugging
    console.log(
      `📨 Event: type=${event.type}, source=${event.source?.type}, userId=${event.source?.userId}, groupId=${event.source?.groupId}`,
    );

    const replyToken = event.replyToken;

    // ── Handle join event (bot added to a group) ──
    if (event.type === 'join' && replyToken) {
      const greeting = `🎉 สวัสดีครับ! ผม Arkai ผู้ช่วยทำงานอัจฉริยะ!

ผมช่วยได้เรื่อง:
📁 เก็บไฟล์ — ส่งไฟล์/รูปมา ระบบเก็บให้อัตโนมัติ
✅ จัดการงาน — /task, /assign, /mytasks
📝 สรุปแชท — /summary
🧠 บันทึกความจำ — /note
⏰ เตือนความจำ — /remind

💡 ใช้คำสั่ง / หรือ @mention ผมในกลุ่มได้เลย!
พิมพ์ /help เพื่อดูคำสั่งทั้งหมด 📚`;
      await this.replyMessage(replyToken, greeting);
      return;
    }

    // ── Handle follow event (someone adds bot as friend) ──
    if (event.type === 'follow' && replyToken) {
      const welcome = `👋 สวัสดีครับ! ขอบคุณที่เพิ่มเพื่อน Arkai!

ผม Arkai ผู้ช่วยทำงานอัจฉริยะ ช่วยได้เรื่อง:
📁 เก็บไฟล์ • ✅ จัดการงาน • 📝 สรุปแชท
🧠 บันทึกความจำ • ⏰ เตือนความจำ

พิมพ์ /help เพื่อเริ่มต้นใช้งาน 📚
หรือพิมพ์อะไรก็ได้ ผมจะช่วยแนะนำครับ!`;
      await this.replyMessage(replyToken, welcome);
      return;
    }

    // Skip events without replyToken (e.g., leave, unfollow)
    if (!replyToken) return;

    const sourceType = (event.source?.type as 'user' | 'group') || 'user';
    const userId = event.source?.userId;
    const groupId = event.source?.groupId;
    const context = { sourceType, userId, groupId };

    // Auto-save files
    const fileTypes = ['image', 'video', 'audio', 'file'];
    if (event.type === 'message' && fileTypes.includes(event.message?.type)) {
      await this.handleFileMessage(event, replyToken, context);
      return;
    }

    // Text messages
    if (event.type === 'message' && event.message?.type === 'text') {
      await this.handleTextMessage(event, replyToken, context);
      return;
    }
  }

  private async handleFileMessage(
    event: any,
    replyToken: string,
    context: {
      sourceType: 'user' | 'group';
      userId?: string;
      groupId?: string;
    },
  ): Promise<void> {
    try {
      const messageId = event.message.id;
      const fileResponse = await axios.get(
        `https://api-data.line.me/v2/bot/message/${messageId}/content`,
        {
          headers: { Authorization: `Bearer ${this.accessToken}` },
          responseType: 'arraybuffer',
          timeout: 30000, // 30s timeout
        },
      );

      const fileBuffer = Buffer.from(fileResponse.data);
      const extMap: Record<string, string> = {
        image: 'jpg',
        video: 'mp4',
        audio: 'm4a',
        file: 'bin',
      };
      const filename =
        event.message.fileName ||
        `${event.message.type}-${Date.now()}.${extMap[event.message.type] || 'bin'}`;
      const contentType =
        (fileResponse.headers['content-type'] as string) ||
        'application/octet-stream';

      const responseText = await this.commandService.handleFileUpload(
        fileBuffer,
        filename,
        contentType,
        context,
      );
      await this.replyMessage(replyToken, responseText);
    } catch (error) {
      console.error('File auto-save error:', error);
      await this.replyMessage(
        replyToken,
        '❌ เก็บไฟล์ไม่สำเร็จ ลองส่งใหม่อีกครั้ง',
      );
    }
  }

  private async handleTextMessage(
    event: any,
    replyToken: string,
    context: {
      sourceType: 'user' | 'group';
      userId?: string;
      groupId?: string;
    },
  ): Promise<void> {
    const userText = event.message.text;
    const orgId = context.groupId || context.userId || 'personal';

    // Save message in background (non-blocking)
    this.prisma.message
      .create({
        data: {
          text: userText,
          sender: context.userId || 'unknown',
          orgId,
        },
      })
      .catch((err) => console.error('Failed to save message:', err));

    // ── Group mention detection ──
    // In groups: only respond to / commands or when bot is @mentioned
    if (context.sourceType === 'group') {
      const isCommand = userText.trim().startsWith('/');
      const isMentioned = this.isBotMentioned(event);

      if (!isCommand && !isMentioned) {
        // Save message but don't respond — bot was not addressed
        console.log(
          `📝 Group message saved (not addressed): "${userText.substring(0, 50)}"`,
        );
        return;
      }
    }

    let responseText: string;
    try {
      if (userText.startsWith('/')) {
        responseText = await this.commandService.handle(userText, context);
      } else {
        // Check AI quota before calling
        const isGroup = context.sourceType === 'group';
        const quotaCheck = await this.subscriptionService.checkAiChat(
          orgId,
          isGroup,
        );
        if (!quotaCheck.allowed) {
          responseText = quotaCheck.message || '⚡ AI ครบโควต้าวันนี้แล้ว';
        } else {
          // Strip @mention from text before processing
          const cleanText = this.stripMention(userText);
          responseText = await this.aiService.chat(cleanText);
          await this.subscriptionService.trackAiChat(orgId, isGroup);
        }
      }
    } catch (error) {
      console.error('Command/AI error:', error);
      responseText = '❌ เกิดข้อผิดพลาด กรุณาลองใหม่';
    }

    await this.replyMessage(replyToken, responseText);
  }

  /**
   * Check if the bot was @mentioned in a LINE group message.
   * LINE sends mention data in event.message.mention.mentionees
   */
  private isBotMentioned(event: any): boolean {
    const mentionees = event.message?.mention?.mentionees;
    if (!mentionees || !Array.isArray(mentionees)) return false;

    // Check if any mentionee is the bot (type === 'all' counts as mentioning everyone including bot)
    return mentionees.some((m: any) => m.type === 'all' || m.isSelf === true);
  }

  /**
   * Remove @mention text from the message so it doesn't confuse the response logic.
   */
  private stripMention(text: string): string {
    // Remove @xxx patterns at the start of the message
    return text.replace(/^@\S+\s*/, '').trim() || text;
  }

  private async replyMessage(replyToken: string, text: string): Promise<void> {
    try {
      // LINE limit: 5000 chars per message
      const truncated =
        text.length > 4900
          ? text.substring(0, 4900) + '\n...(ข้อความยาวเกินไป)'
          : text;

      await axios.post(
        'https://api.line.me/v2/bot/message/reply',
        {
          replyToken,
          messages: [{ type: 'text', text: truncated }],
        },
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000, // 10s timeout
        },
      );
    } catch (error) {
      // Log but don't crash — reply tokens expire quickly
      console.error(
        'LINE reply failed:',
        (error as any)?.response?.data || (error as Error).message,
      );
    }
  }
}
