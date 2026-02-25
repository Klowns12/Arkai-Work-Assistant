import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import Stripe from 'stripe';
import axios from 'axios';

// Stripe price config per plan (in satang → THB for Stripe)
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
  private stripe: Stripe | null = null;
  private webhookSecret: string;
  private accessToken: string;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (secretKey) {
      this.stripe = new Stripe(secretKey);
    }
    this.webhookSecret =
      this.configService.get<string>('STRIPE_WEBHOOK_SECRET') || '';
    this.accessToken =
      this.configService.get<string>('LINE_CHANNEL_ACCESS_TOKEN') || '';
  }

  // ═══════════════════════════════════════════════
  // Create Stripe Checkout Session
  // ═══════════════════════════════════════════════
  async createCheckoutSession(
    orgId: string,
    isGroup: boolean,
    plan: string,
    period: string,
  ): Promise<{ url: string } | { error: string }> {
    try {
      if (!this.stripe) {
        return { error: '❌ ระบบชำระเงินยังไม่พร้อม กรุณาติดต่อแอดมิน' };
      }

      const planConfig = PLAN_PRICES[plan];
      if (!planConfig) {
        return {
          error: `❌ แผนไม่ถูกต้อง กรุณาเลือก: basic, pro, business`,
        };
      }

      const amount =
        period === 'yearly' ? planConfig.yearly : planConfig.monthly;
      const periodLabel = period === 'yearly' ? 'รายปี' : 'รายเดือน';

      // Find or create org to get the internal org ID
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

      // Determine success/cancel URL (Render URL)
      const baseUrl =
        this.configService.get<string>('APP_URL') ||
        'https://arkai-work-assistant.onrender.com';

      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ['card', 'promptpay'],
        line_items: [
          {
            price_data: {
              currency: 'thb',
              product_data: {
                name: `Arkai ${planConfig.label} — ${periodLabel}`,
                description: `อัพเกรด Arkai Work Assistant เป็นแผน ${planConfig.label}`,
              },
              unit_amount: amount * 100, // Stripe ใช้ satang (THB * 100)
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${baseUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/payment/cancel`,
        metadata: {
          orgId: internalOrgId,
          lineOrgId: orgId,
          isGroup: isGroup ? 'true' : 'false',
          plan,
          period,
        },
      });

      // Save payment record
      await this.prisma.payment.create({
        data: {
          orgId: internalOrgId,
          amount: amount * 100,
          plan,
          period,
          status: 'pending',
          paymentRef: session.id,
        },
      });

      return { url: session.url || '' };
    } catch (error) {
      console.error('Stripe checkout error:', error);
      return { error: '❌ สร้างลิงก์ชำระเงินไม่สำเร็จ ลองใหม่อีกครั้ง' };
    }
  }

  // ═══════════════════════════════════════════════
  // Handle Stripe Webhook
  // ═══════════════════════════════════════════════
  async handleWebhook(
    rawBody: Buffer,
    signature: string,
  ): Promise<{ ok: boolean }> {
    try {
      if (!this.stripe) return { ok: false };

      let event: Stripe.Event;

      // Verify webhook signature (skip if no secret set yet)
      if (this.webhookSecret && this.webhookSecret !== 'whsec_placeholder') {
        event = this.stripe.webhooks.constructEvent(
          rawBody,
          signature,
          this.webhookSecret,
        );
      } else {
        // Fallback: parse without verification (for testing)
        event = JSON.parse(rawBody.toString()) as Stripe.Event;
      }

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        await this.handleSuccessfulPayment(session);
      }

      return { ok: true };
    } catch (error) {
      console.error('Stripe webhook error:', error);
      return { ok: false };
    }
  }

  // ═══════════════════════════════════════════════
  // Process successful payment
  // ═══════════════════════════════════════════════
  private async handleSuccessfulPayment(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    try {
      const metadata = session.metadata;
      if (!metadata) return;

      const { orgId, lineOrgId, isGroup, plan, period } = metadata;
      if (!orgId || !plan) return;

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
          // Reset counters on upgrade
          aiChatsToday: 0,
          tasksThisMonth: 0,
        },
      });

      // Update payment record
      await this.prisma.payment.updateMany({
        where: { paymentRef: session.id },
        data: { status: 'completed' },
      });

      // Send LINE notification to the user/group
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
ตอนนี้คุณสามารถใช้ฟีเจอร์ใหม่ได้ทันทีครับ
พิมพ์ /plan เพื่อดูรายละเอียดแผนของคุณ`;

      // Push message to user/group
      if (lineOrgId) {
        await this.pushMessage(lineOrgId, message);
      }

      console.log(
        `✅ Payment success: org=${orgId}, plan=${plan}, period=${period}`,
      );
    } catch (error) {
      console.error('handleSuccessfulPayment error:', error);
    }
  }

  // ═══════════════════════════════════════════════
  // Push message to LINE (not reply — no token needed)
  // ═══════════════════════════════════════════════
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

  // ═══════════════════════════════════════════════
  // Generate /upgrade response message
  // ═══════════════════════════════════════════════
  async getUpgradeMessage(
    orgId: string,
    isGroup: boolean,
    plan: string,
    period: string,
  ): Promise<string> {
    const result = await this.createCheckoutSession(
      orgId,
      isGroup,
      plan,
      period,
    );

    if ('error' in result) {
      return result.error;
    }

    const planConfig = PLAN_PRICES[plan];
    if (!planConfig) return '❌ แผนไม่ถูกต้อง';

    const amount = period === 'yearly' ? planConfig.yearly : planConfig.monthly;
    const periodLabel = period === 'yearly' ? 'รายปี' : 'รายเดือน';

    return `💳 ชำระเงินอัพเกรด ${planConfig.label}

💰 ราคา: ฿${amount} (${periodLabel})
🔗 กดลิงก์ด้านล่างเพื่อชำระเงิน:
${result.url}

⏰ ลิงก์ชำระเงินใช้ได้ 30 นาที
✅ รองรับ: บัตรเครดิต/เดบิต, พร้อมเพย์
🔒 ชำระเงินผ่าน Stripe (ปลอดภัย 100%)`;
  }
}
