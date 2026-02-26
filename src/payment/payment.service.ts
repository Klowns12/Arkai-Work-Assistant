import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';
const omise = require('omise');

const PLAN_PRICES: Record<
  string,
  { monthly: number; yearly: number; label: string }
> = {
  basic: { monthly: 200, yearly: 2000, label: '⭐ Basic' },
  pro: { monthly: 300, yearly: 3000, label: '🔥 Pro' },
  business: { monthly: 500, yearly: 2500, label: '💎 Business' },
};

@Injectable()
export class PaymentService {
  private omiseClient: any = null;
  private accessToken: string;
  private publicKey: string;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    const secretKey = this.configService.get<string>('OMISE_SECRET_KEY');
    this.publicKey =
      this.configService.get<string>('OMISE_PUBLISHABLE_KEY') || '';

    if (secretKey && this.publicKey && secretKey !== 'skey_test_placeholder') {
      this.omiseClient = omise({
        publicKey: this.publicKey,
        secretKey: secretKey,
        omiseVersion: '2019-05-29',
      });
    }

    this.accessToken =
      this.configService.get<string>('LINE_CHANNEL_ACCESS_TOKEN') || '';
  }

  getOmisePublicKey(): string {
    return this.publicKey;
  }

  // Generate /upgrade response message
  async getUpgradeMessage(
    orgId: string,
    isGroup: boolean,
    plan: string,
    period: string,
  ): Promise<string> {
    if (!this.omiseClient) {
      return '❌ ระบบชำระเงินยังไม่พร้อม กรุณาติดต่อแอดมิน';
    }

    const planConfig = PLAN_PRICES[plan];
    if (!planConfig) return '❌ แผนไม่ถูกต้อง';

    const baseUrl =
      this.configService.get<string>('APP_URL') ||
      'https://arkai-work-assistant.onrender.com';

    // Encode parameters for the checkout URL
    const params = new URLSearchParams({
      orgId,
      isGroup: isGroup ? 'true' : 'false',
      plan,
      period,
    });

    const checkoutUrl = `${baseUrl}/payment/checkout?${params.toString()}`;

    const amount = period === 'yearly' ? planConfig.yearly : planConfig.monthly;
    const periodLabel = period === 'yearly' ? 'รายปี' : 'รายเดือน';

    return `💳 ชำระเงินอัพเกรด ${planConfig.label}

💰 ราคา: ฿${amount} (${periodLabel})
🔗 กดลิงก์ด้านล่างเพื่อชำระเงิน:
${checkoutUrl}

✅ รองรับ: บัตรเครดิต/เดบิต, พร้อมเพย์, TrueMoney
🔒 ชำระเงินผ่าน Omise (ปลอดภัย 100%)`;
  }

  getPlanAmount(plan: string, period: string): number {
    const planConfig = PLAN_PRICES[plan];
    if (!planConfig) return 0;
    return period === 'yearly'
      ? planConfig.yearly * 100
      : planConfig.monthly * 100; // Omise expects satangs/cents
  }

  async processCharge(
    orgId: string,
    isGroup: boolean,
    plan: string,
    period: string,
    omiseToken?: string,
    omiseSource?: string,
  ): Promise<{ redirectUrl: string } | { error: string }> {
    try {
      if (!this.omiseClient) {
        return { error: 'Omise client not configured' };
      }

      const amount = this.getPlanAmount(plan, period);
      if (amount <= 0) return { error: 'Invalid plan' };

      // Find or create internal org ID
      let org;
      if (isGroup) {
        org = await this.prisma.organization.findFirst({
          where: { lineGroupId: orgId },
        });
      } else {
        org = await this.prisma.organization.findFirst({
          where: { lineUserId: orgId },
        });
      }
      const internalOrgId = org?.id || orgId;

      const baseUrl =
        this.configService.get<string>('APP_URL') ||
        'https://arkai-work-assistant.onrender.com';
      const returnUri = `${baseUrl}/payment/complete`;

      // Create charge using Omise SDK
      const chargeParams: any = {
        amount,
        currency: 'thb',
        return_uri: returnUri,
        metadata: {
          orgId: internalOrgId,
          lineOrgId: orgId,
          isGroup: isGroup ? 'true' : 'false',
          plan,
          period,
        },
      };

      if (omiseToken) {
        chargeParams.card = omiseToken;
      } else if (omiseSource) {
        chargeParams.source = omiseSource;
      } else {
        return { error: 'No token or source provided' };
      }

      // We have to cast as promises are returned when no callback is provided in omise-nodejs
      const charge = await new Promise<any>((resolve, reject) => {
        this.omiseClient!.charges.create(chargeParams, (err, resp) => {
          if (err) reject(err);
          else resolve(resp);
        });
      });

      // Save payment reference to DB
      await this.prisma.payment.create({
        data: {
          orgId: internalOrgId,
          amount,
          plan,
          period,
          status: charge.status || 'pending',
          paymentRef: charge.id,
        },
      });

      if (charge.status === 'successful') {
        // Automatically upgrades plan since it was immediate
        await this.handleSuccessfulPayment(charge.metadata, charge.id);
        return { redirectUrl: `${baseUrl}/payment/success` };
      } else if (charge.status === 'pending' && charge.authorize_uri) {
        // Redirect to Omise authorize_uri for PromptPay QR or 3DS
        return { redirectUrl: charge.authorize_uri };
      } else {
        return { redirectUrl: `${baseUrl}/payment/cancel` };
      }
    } catch (error) {
      console.error('Omise charge error:', error);
      return { error: 'เกิดข้อผิดพลาดในการสร้างรายการชำระเงิน' };
    }
  }

  async handleWebhook(event: any): Promise<{ ok: boolean }> {
    try {
      // Basic webhook validation
      if (event.object === 'event' && event.key === 'charge.complete') {
        const charge = event.data;
        if (charge.status === 'successful') {
          await this.handleSuccessfulPayment(charge.metadata, charge.id);
        } else if (charge.status === 'failed') {
          await this.prisma.payment.updateMany({
            where: { paymentRef: charge.id },
            data: { status: 'failed' },
          });
        }
      }
      return { ok: true };
    } catch (error) {
      console.error('Omise webhook error:', error);
      return { ok: false };
    }
  }

  async checkChargeCompletion(chargeId: string): Promise<string> {
    try {
      const charge = await new Promise<any>((resolve, reject) => {
        this.omiseClient!.charges.retrieve(chargeId, (err, resp) => {
          if (err) reject(err);
          else resolve(resp);
        });
      });

      if (charge.status === 'successful') {
        // Double check to update plan in case webhook was delayed
        await this.handleSuccessfulPayment(charge.metadata, charge.id);
        return 'success';
      } else if (charge.status === 'failed') {
        return 'failed';
      }
      return 'pending';
    } catch (error) {
      console.error('Error checking charge:', error);
      return 'pending';
    }
  }

  private async handleSuccessfulPayment(
    metadata: any,
    chargeId: string,
  ): Promise<void> {
    try {
      if (!metadata) return;

      const { orgId, lineOrgId, plan, period } = metadata;
      if (!orgId || !plan) return;

      // Check if already processed
      const existingPayment = await this.prisma.payment.findFirst({
        where: { paymentRef: chargeId },
      });

      if (existingPayment?.status === 'completed') return;

      // Calculate expiration
      const now = new Date();
      const expiresAt = new Date(now);
      if (period === 'yearly') {
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      } else {
        expiresAt.setMonth(expiresAt.getMonth() + 1);
      }

      // Update organization plan
      await this.prisma.organization.update({
        where: { id: orgId },
        data: {
          plan,
          planExpiresAt: expiresAt,
          aiChatsToday: 0,
          tasksThisMonth: 0,
        },
      });

      // Update payment record
      await this.prisma.payment.updateMany({
        where: { paymentRef: chargeId },
        data: { status: 'completed' },
      });

      // Send LINE notification
      const planEmoji: Record<string, string> = {
        basic: '⭐',
        pro: '🔥',
        business: '💎',
      };
      const emoji = planEmoji[plan] || '✅';
      const periodLabel = period === 'yearly' ? '1 ปี' : '1 เดือน';
      const expiresStr = expiresAt.toLocaleDateString('th-TH');

      const message = `${emoji} อัพเกรดสำเร็จ!

📊 แผนใหม่: ${emoji} ${plan.toUpperCase()}
📅 ใช้ได้ถึง: ${expiresStr} (${periodLabel})

🎉 ขอบคุณที่สนับสนุน Arkai!
ตอนนี้คุณสามารถใช้ฟีเจอร์ใหม่ได้ทันทีครับ`;

      if (lineOrgId) {
        await this.pushMessage(lineOrgId, message);
      }

      console.log(`✅ Payment success: org=${orgId}, plan=${plan}`);
    } catch (error) {
      console.error('handleSuccessfulPayment error:', error);
    }
  }

  private async pushMessage(to: string, text: string): Promise<void> {
    try {
      await axios.post(
        'https://api.line.me/v2/bot/message/push',
        {
          to,
          messages: [{ type: 'text', text }],
        },
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        },
      );
    } catch (error) {
      console.error(
        'LINE push failed:',
        (error as any)?.response?.data || (error as Error).message,
      );
    }
  }
}
