import { Controller, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import * as crypto from 'crypto';
import axios from 'axios';
import { CommandService } from './command.service';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('webhook')
export class WebhookController {
  constructor(
    private readonly commandService: CommandService,
    private readonly aiService: AiService,
    private readonly prisma: PrismaService,
  ) { }

  @Post()
  async handleWebhook(@Req() req: Request, @Res() res: Response) {
    const signature = req.headers['x-line-signature'] as string;
    const channelSecret = process.env.LINE_CHANNEL_SECRET;
    const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

    if (!channelSecret || !accessToken) {
      return res.status(500).send('Missing environment variables');
    }

    const rawBody = (req as any).rawBody;

    const hash = crypto
      .createHmac('sha256', channelSecret)
      .update(rawBody)
      .digest('base64');

    if (hash !== signature) {
      return res.status(401).send('Invalid signature');
    }

    const events = req.body.events;

    for (const event of events) {
      const replyToken = event.replyToken;
      const sourceType = event.source.type as 'user' | 'group';
      const userId = event.source.userId;
      const groupId = event.source.groupId;
      const context = { sourceType, userId, groupId };

      // Auto-save: เก็บไฟล์อัตโนมัติเมื่อ User ส่งไฟล์/รูป/วิดีโอ/เสียงเข้ามา (ไม่ต้องใช้คำสั่ง)
      const fileTypes = ['image', 'video', 'audio', 'file'];
      if (event.type === 'message' && fileTypes.includes(event.message.type)) {
        try {
          const messageId = event.message.id;
          const fileResponse = await axios.get(
            `https://api-data.line.me/v2/bot/message/${messageId}/content`,
            {
              headers: { Authorization: `Bearer ${accessToken}` },
              responseType: 'arraybuffer',
            }
          );

          const fileBuffer = Buffer.from(fileResponse.data);
          const extMap: Record<string, string> = { image: 'jpg', video: 'mp4', audio: 'm4a', file: 'bin' };
          const filename = event.message.fileName || `${event.message.type}-${Date.now()}.${extMap[event.message.type] || 'bin'}`;
          const contentType = (fileResponse.headers['content-type'] as string) || 'application/octet-stream';

          const responseText = await this.commandService.handleFileUpload(
            fileBuffer,
            filename,
            contentType,
            context,
          );

          await this.replyMessage(replyToken, responseText, accessToken);
        } catch (error) {
          console.error('File auto-save error:', error);
          await this.replyMessage(replyToken, '❌ เก็บไฟล์อัตโนมัติไม่สำเร็จ / Auto-save failed', accessToken);
        }
        continue;
      }

      // Handle text messages
      if (event.type === 'message' && event.message.type === 'text') {
        const userText = event.message.text;
        const orgId = context.groupId || context.userId || 'personal';

        // Save all chat messages to DB for summarization (background, non-blocking)
        this.prisma.message.create({
          data: {
            text: userText,
            sender: context.userId || 'unknown',
            orgId: orgId,
          }
        }).catch(err => console.error('Failed to save message:', err));

        let responseText: string;
        if (userText.startsWith('/')) {
          responseText = await this.commandService.handle(userText, context);
        } else {
          // Non-command messages: AI chat with Arkai personality
          responseText = await this.aiService.chat(userText);
        }

        await this.replyMessage(replyToken, responseText, accessToken);
      }
    }

    return res.status(200).send('OK');
  }

  private async replyMessage(replyToken: string, text: string, accessToken: string): Promise<void> {
    // LINE has a 5000 character limit per message
    const truncatedText = text.length > 4900 ? text.substring(0, 4900) + '\n...(ตัดข้อความเนื่องจากยาวเกินไป)' : text;

    await axios.post(
      'https://api.line.me/v2/bot/message/reply',
      {
        replyToken: replyToken,
        messages: [{ type: 'text', text: truncatedText }],
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      },
    );
  }
}