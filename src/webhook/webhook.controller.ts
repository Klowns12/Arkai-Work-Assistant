import { Controller, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import * as crypto from 'crypto';
import axios from 'axios';
import { CommandService } from './command.service';
import { AiService } from 'src/ai/ai.service';

@Controller('webhook')
export class WebhookController {
  constructor(
    private readonly commandService: CommandService,
    private readonly aiService: AiService,
  ) {}

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

      // Handle image/file messages
      if (event.type === 'message' && (event.message.type === 'image' || event.message.type === 'file')) {
        // TODO: Download file from LINE content API and upload to storage
        const responseText = await this.commandService.handleFileUpload(
          Buffer.from('placeholder'), // Replace with actual file download
          event.message.fileName || `image-${Date.now()}.jpg`,
          event.message.contentProvider?.type === 'line' ? 'image/jpeg' : 'application/octet-stream',
          context,
        );

        await this.replyMessage(replyToken, responseText, accessToken);
        continue;
      }

      // Handle text messages
      if (event.type === 'message' && event.message.type === 'text') {
        const userText = event.message.text;

        let responseText: string;
        if (userText.startsWith('/')) {
          responseText = this.commandService.handle(userText, context);
        } else {
          responseText = await this.aiService.chat(userText);
        }

        await this.replyMessage(replyToken, responseText, accessToken);
      }
    }

    return res.status(200).send('OK');
  }

  private async replyMessage(replyToken: string, text: string, accessToken: string): Promise<void> {
    await axios.post(
      'https://api.line.me/v2/bot/message/reply',
      {
        replyToken: replyToken,
        messages: [{ type: 'text', text }],
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