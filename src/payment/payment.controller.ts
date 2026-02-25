import { Controller, Post, Get, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PaymentService } from './payment.service';

@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  // ═══════════════════════════════════════════════
  // Stripe Webhook Endpoint
  // ═══════════════════════════════════════════════
  @Post('stripe-webhook')
  async handleStripeWebhook(@Req() req: Request, @Res() res: Response) {
    const signature = req.headers['stripe-signature'] as string;
    const rawBody = (req as any).rawBody;

    if (!rawBody || !signature) {
      return res.status(400).send('Missing body or signature');
    }

    const result = await this.paymentService.handleWebhook(rawBody, signature);

    if (result.ok) {
      return res.status(200).json({ received: true });
    } else {
      return res.status(400).json({ error: 'Webhook processing failed' });
    }
  }

  // ═══════════════════════════════════════════════
  // Success Page (after Stripe redirect)
  // ═══════════════════════════════════════════════
  @Get('success')
  async paymentSuccess(@Res() res: Response) {
    return res.status(200).send(`
      <!DOCTYPE html>
      <html lang="th">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Arkai — ชำระเงินสำเร็จ</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #0f0f23, #1a1a3e);
            color: #fff;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
          }
          .card {
            background: rgba(255,255,255,0.05);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 24px;
            padding: 48px 40px;
            text-align: center;
            max-width: 400px;
            width: 90%;
          }
          .emoji { font-size: 64px; margin-bottom: 16px; }
          h1 { font-size: 24px; margin-bottom: 12px; color: #4ade80; }
          p { font-size: 16px; line-height: 1.6; color: #ccc; margin-bottom: 20px; }
          .btn {
            display: inline-block;
            background: linear-gradient(135deg, #4ade80, #22c55e);
            color: #000;
            padding: 14px 32px;
            border-radius: 12px;
            text-decoration: none;
            font-weight: 600;
            font-size: 16px;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="emoji">🎉</div>
          <h1>ชำระเงินสำเร็จ!</h1>
          <p>ระบบกำลังอัพเกรดแผนของคุณอัตโนมัติ<br>
          กลับไปที่แชท LINE แล้วพิมพ์ <strong>/plan</strong> เพื่อเช็คสถานะ</p>
          <a href="https://line.me/R/" class="btn">กลับไปที่ LINE</a>
        </div>
      </body>
      </html>
    `);
  }

  // ═══════════════════════════════════════════════
  // Cancel Page (user cancelled payment)
  // ═══════════════════════════════════════════════
  @Get('cancel')
  async paymentCancel(@Res() res: Response) {
    return res.status(200).send(`
      <!DOCTYPE html>
      <html lang="th">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Arkai — ยกเลิกการชำระเงิน</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #0f0f23, #1a1a3e);
            color: #fff;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
          }
          .card {
            background: rgba(255,255,255,0.05);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 24px;
            padding: 48px 40px;
            text-align: center;
            max-width: 400px;
            width: 90%;
          }
          .emoji { font-size: 64px; margin-bottom: 16px; }
          h1 { font-size: 24px; margin-bottom: 12px; color: #facc15; }
          p { font-size: 16px; line-height: 1.6; color: #ccc; margin-bottom: 20px; }
          .btn {
            display: inline-block;
            background: linear-gradient(135deg, #60a5fa, #3b82f6);
            color: #fff;
            padding: 14px 32px;
            border-radius: 12px;
            text-decoration: none;
            font-weight: 600;
            font-size: 16px;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="emoji">😊</div>
          <h1>ยกเลิกการชำระเงิน</h1>
          <p>ไม่เป็นไรครับ สามารถสมัครได้ทุกเมื่อ<br>
          พิมพ์ <strong>/upgrade</strong> ในแชท LINE อีกครั้งเมื่อพร้อม</p>
          <a href="https://line.me/R/" class="btn">กลับไปที่ LINE</a>
        </div>
      </body>
      </html>
    `);
  }
}
