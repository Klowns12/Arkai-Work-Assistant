import { Controller, Post, Get, Req, Res, Query } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PaymentService } from './payment.service';

@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  // ═══════════════════════════════════════════════
  // Serve Omise Checkout Page
  // ═══════════════════════════════════════════════
  @Get('checkout')
  async renderCheckout(
    @Query('orgId') orgId: string,
    @Query('isGroup') isGroup: string,
    @Query('plan') plan: string,
    @Query('period') period: string,
    @Res() res: Response,
  ) {
    if (!orgId || !plan || !period) {
      return res.status(400).send('Missing parameters');
    }

    const amount = this.paymentService.getPlanAmount(plan, period);
    const publicKey = this.paymentService.getOmisePublicKey();
    const amountThb = (amount / 100).toLocaleString('th-TH');

    const formHtml = `
      <!DOCTYPE html>
      <html lang="th">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Arkai — ยืนยันชำระเงิน</title>
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
            border-radius: 20px;
            padding: 40px;
            text-align: center;
            max-width: 400px;
            width: 90%;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
          }
          .emoji { font-size: 56px; margin-bottom: 20px; }
          h2 { font-size: 22px; margin-bottom: 10px; color: #fff; }
          .price { font-size: 32px; font-weight: bold; color: #4ade80; margin-bottom: 30px; }
          
          /* Style the default Omise button to fit the dark theme */
          form.omise-checkout-form button {
            background: linear-gradient(135deg, #60a5fa, #3b82f6) !important;
            color: #fff !important;
            border: none !important;
            padding: 16px 32px !important;
            border-radius: 12px !important;
            font-size: 16px !important;
            font-weight: 600 !important;
            cursor: pointer !important;
            width: 100% !important;
            transition: opacity 0.2s !important;
          }
          form.omise-checkout-form button:hover {
            opacity: 0.9 !important;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="emoji">💳</div>
          <h2>อัพเกรดแพ็กเกจ ${plan.toUpperCase()}</h2>
          <div class="price">฿${amountThb} / ${period === 'yearly' ? 'ปี' : 'เดือน'}</div>
          
          <form class="omise-checkout-form" method="POST" action="/payment/omise-charge">
            <input type="hidden" name="orgId" value="${orgId}" />
            <input type="hidden" name="isGroup" value="${isGroup}" />
            <input type="hidden" name="plan" value="${plan}" />
            <input type="hidden" name="period" value="${period}" />
            <script type="text/javascript" src="https://cdn.omise.co/omise.js"
              data-key="${publicKey}"
              data-frame-label="Arkai Work Assistant"
              data-button-label="ชำระเงินด้วย บัตรเครดิต หรือ PromptPay"
              data-submit-label="ยืนยันชำระเงิน"
              data-location="no"
              data-amount="${amount}"
              data-currency="thb"
              data-default-payment-method="credit_card">
            </script>
          </form>
          <div style="margin-top: 20px; font-size: 12px; color: #888;">Payments securely processed by Omise</div>
        </div>
      </body>
      </html>
    `;

    res.status(200).send(formHtml);
  }

  // ═══════════════════════════════════════════════
  // Process Omise Token/Source
  // ═══════════════════════════════════════════════
  @Post('omise-charge')
  async processOmiseCharge(@Req() req: Request, @Res() res: Response) {
    const { orgId, isGroup, plan, period, omiseToken, omiseSource } = req.body;

    const result = await this.paymentService.processCharge(
      orgId,
      isGroup === 'true',
      plan,
      period,
      omiseToken,
      omiseSource,
    );

    if ('error' in result) {
      return res.redirect('/payment/cancel');
    }

    // Redirect to Omise 3DS/PromptPay page OR our success page
    return res.redirect(result.redirectUrl);
  }

  // ═══════════════════════════════════════════════
  // Complete Return URI (after Omise redirect)
  // ═══════════════════════════════════════════════
  @Get('complete')
  async handleOmiseReturn(
    @Query('charge_id') chargeId: string, // Omise passes charge parameters if needed, or we just trust webhook. But normally Omise redirects to return_uri without explicit params unless we added it.
    @Res() res: Response,
  ) {
    // Usually the return_uri is just a signal to fetch the status or show a "please wait for webhook" page.
    return res.redirect('/payment/success');
  }

  // ═══════════════════════════════════════════════
  // Omise Webhook Endpoint
  // ═══════════════════════════════════════════════
  @Post('omise-webhook')
  async handleOmiseWebhook(@Req() req: Request, @Res() res: Response) {
    const event = req.body;
    const result = await this.paymentService.handleWebhook(event);

    if (result.ok) {
      return res.status(200).json({ received: true });
    } else {
      return res.status(400).json({ error: 'Webhook processing failed' });
    }
  }

  // ═══════════════════════════════════════════════
  // Success Page
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
  // Cancel Page
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
          <div class="emoji">😥</div>
          <h1>ชำระเงินไม่สำเร็จ</h1>
          <p>เกิดข้อผิดพลาด หรือ คุณยกเลิกรายการ<br>
          สามารถพิมพ์ <strong>/upgrade</strong> ในแชท LINE อีกครั้งเมื่อพร้อม</p>
          <a href="https://line.me/R/" class="btn">กลับไปที่ LINE</a>
        </div>
      </body>
      </html>
    `);
  }
}
