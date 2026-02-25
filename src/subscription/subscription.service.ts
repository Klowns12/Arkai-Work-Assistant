import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Plan limits configuration
const PLAN_LIMITS = {
    free: {
        aiChatsPerDay: 10,
        tasksPerMonth: 5,
        storageBytes: 500 * 1024 * 1024,       // 500MB
        maxNotes: 10,
        maxReminders: 3,
        maxGroups: 1,
        canAssignTasks: false,
        canSummaryToday: false,
        canSummaryYesterday: false,
    },
    basic: {
        aiChatsPerDay: 50,
        tasksPerMonth: 30,
        storageBytes: 5 * 1024 * 1024 * 1024,  // 5GB
        maxNotes: 50,
        maxReminders: 20,
        maxGroups: 3,
        canAssignTasks: true,
        canSummaryToday: true,
        canSummaryYesterday: false,
    },
    pro: {
        aiChatsPerDay: 200,
        tasksPerMonth: 100,
        storageBytes: 15 * 1024 * 1024 * 1024, // 15GB
        maxNotes: 200,
        maxReminders: 100,
        maxGroups: 10,
        canAssignTasks: true,
        canSummaryToday: true,
        canSummaryYesterday: true,
    },
    business: {
        aiChatsPerDay: 999999,
        tasksPerMonth: 999999,
        storageBytes: 50 * 1024 * 1024 * 1024, // 50GB
        maxNotes: 999999,
        maxReminders: 999999,
        maxGroups: 999999,
        canAssignTasks: true,
        canSummaryToday: true,
        canSummaryYesterday: true,
    },
};

type PlanType = keyof typeof PLAN_LIMITS;

@Injectable()
export class SubscriptionService {
    constructor(private prisma: PrismaService) { }

    async getOrCreateOrg(orgId: string, isGroup: boolean): Promise<{ id: string; plan: PlanType }> {
        try {
            let org;
            if (isGroup) {
                org = await this.prisma.organization.upsert({
                    where: { lineGroupId: orgId },
                    update: {},
                    create: { lineGroupId: orgId, plan: 'free' },
                });
            } else {
                org = await this.prisma.organization.upsert({
                    where: { lineUserId: orgId },
                    update: {},
                    create: { lineUserId: orgId, plan: 'free' },
                });
            }

            // Check if plan expired
            if (org.planExpiresAt && org.planExpiresAt < new Date()) {
                org = await this.prisma.organization.update({
                    where: { id: org.id },
                    data: { plan: 'free', planExpiresAt: null },
                });
            }

            return { id: org.id, plan: org.plan as PlanType };
        } catch (error) {
            console.error('getOrCreateOrg error:', error);
            try {
                const where = isGroup ? { lineGroupId: orgId } : { lineUserId: orgId };
                const existing = await this.prisma.organization.findFirst({ where });
                if (existing) return { id: existing.id, plan: existing.plan as PlanType };
            } catch (e) { }

            // Return a dummy UUID to prevent Prisma findUnique crashes downstream
            return { id: '00000000-0000-0000-0000-000000000000', plan: 'free' };
        }
    }

    getLimits(plan: PlanType) {
        return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
    }

    // ═══════════════════════════════════════════════
    // AI Chat Quota
    // ═══════════════════════════════════════════════
    async checkAiChat(orgId: string, isGroup: boolean): Promise<{ allowed: boolean; message?: string }> {
        try {
            const orgInfo = await this.getOrCreateOrg(orgId, isGroup);
            const limits = this.getLimits(orgInfo.plan);
            const org = await this.prisma.organization.findUnique({ where: { id: orgInfo.id } });
            if (!org) return { allowed: true };

            // Reset daily counter if new day
            const now = new Date();
            if (org.aiChatsResetAt.toDateString() !== now.toDateString()) {
                await this.prisma.organization.update({
                    where: { id: org.id },
                    data: { aiChatsToday: 0, aiChatsResetAt: now },
                });
                return { allowed: true };
            }

            if (org.aiChatsToday >= limits.aiChatsPerDay) {
                const planName = orgInfo.plan === 'free' ? 'Free' : orgInfo.plan;
                return {
                    allowed: false,
                    message: `⚡ AI ครบโควต้าวันนี้แล้ว (${limits.aiChatsPerDay} ครั้ง)\n📌 แผนปัจจุบัน: ${planName}\n\n💡 อัพเกรดเพื่อใช้ AI เพิ่ม:\n⭐ Basic ฿200/เดือน → 50 ครั้ง/วัน\n🔥 Pro ฿300/เดือน → 200 ครั้ง/วัน\n💎 Business ฿500/เดือน → ไม่จำกัด`,
                };
            }

            return { allowed: true };
        } catch (error) {
            console.error('checkAiChat error:', error);
            return { allowed: true }; // Fail open
        }
    }

    async trackAiChat(orgId: string, isGroup: boolean): Promise<void> {
        try {
            const orgInfo = await this.getOrCreateOrg(orgId, isGroup);
            await this.prisma.organization.update({
                where: { id: orgInfo.id },
                data: { aiChatsToday: { increment: 1 } },
            });
        } catch (error) {
            console.error('trackAiChat error:', error);
        }
    }

    // ═══════════════════════════════════════════════
    // Task Quota
    // ═══════════════════════════════════════════════
    async checkTaskCreation(orgId: string, isGroup: boolean): Promise<{ allowed: boolean; message?: string }> {
        try {
            const orgInfo = await this.getOrCreateOrg(orgId, isGroup);
            const limits = this.getLimits(orgInfo.plan);
            const org = await this.prisma.organization.findUnique({ where: { id: orgInfo.id } });
            if (!org) return { allowed: true };

            // Reset monthly counter
            const now = new Date();
            const resetDate = org.tasksResetAt;
            if (now.getMonth() !== resetDate.getMonth() || now.getFullYear() !== resetDate.getFullYear()) {
                await this.prisma.organization.update({
                    where: { id: org.id },
                    data: { tasksThisMonth: 0, tasksResetAt: now },
                });
                return { allowed: true };
            }

            if (org.tasksThisMonth >= limits.tasksPerMonth) {
                return {
                    allowed: false,
                    message: `📋 สร้างงานครบโควต้าเดือนนี้ (${limits.tasksPerMonth} งาน)\n💡 อัพเกรดเพื่อสร้างงานเพิ่ม`,
                };
            }

            return { allowed: true };
        } catch (error) {
            console.error('checkTaskCreation error:', error);
            return { allowed: true };
        }
    }

    async trackTaskCreation(orgId: string, isGroup: boolean): Promise<void> {
        try {
            const orgInfo = await this.getOrCreateOrg(orgId, isGroup);
            await this.prisma.organization.update({
                where: { id: orgInfo.id },
                data: { tasksThisMonth: { increment: 1 } },
            });
        } catch (error) {
            console.error('trackTaskCreation error:', error);
        }
    }

    // ═══════════════════════════════════════════════
    // Feature Access
    // ═══════════════════════════════════════════════
    async canAccessFeature(orgId: string, isGroup: boolean, feature: string): Promise<{ allowed: boolean; message?: string }> {
        try {
            const orgInfo = await this.getOrCreateOrg(orgId, isGroup);
            const limits = this.getLimits(orgInfo.plan);

            switch (feature) {
                case 'summary_today':
                    if (!limits.canSummaryToday) {
                        return { allowed: false, message: '📋 สรุปแชท เป็นฟีเจอร์สำหรับแผน Basic ขึ้นไป\n⭐ Basic ฿200/เดือน → สรุปวันนี้\n🔥 Pro ฿300/เดือน → สรุปวันนี้+เมื่อวาน' };
                    }
                    break;
                case 'summary_yesterday':
                    if (!limits.canSummaryYesterday) {
                        return { allowed: false, message: '📋 สรุปเมื่อวาน เป็นฟีเจอร์สำหรับแผน Pro ขึ้นไป\n🔥 Pro ฿300/เดือน → สรุปวันนี้+เมื่อวาน' };
                    }
                    break;
                case 'assign_task':
                    if (!limits.canAssignTasks) {
                        return { allowed: false, message: '👤 มอบหมายงาน เป็นฟีเจอร์สำหรับแผน Basic ขึ้นไป\n⭐ Basic ฿200/เดือน' };
                    }
                    break;
            }

            return { allowed: true };
        } catch (error) {
            console.error('canAccessFeature error:', error);
            return { allowed: true };
        }
    }

    // ═══════════════════════════════════════════════
    // Storage Quota
    // ═══════════════════════════════════════════════
    async checkStorageQuota(orgId: string, isGroup: boolean, fileSize: number): Promise<{ allowed: boolean; message?: string }> {
        try {
            const orgInfo = await this.getOrCreateOrg(orgId, isGroup);
            const limits = this.getLimits(orgInfo.plan);
            const org = await this.prisma.organization.findUnique({ where: { id: orgInfo.id } });
            if (!org) return { allowed: true };

            const newTotal = Number(org.storageUsedBytes) + fileSize;
            if (newTotal > limits.storageBytes) {
                const usedMB = (Number(org.storageUsedBytes) / 1024 / 1024).toFixed(0);
                const limitMB = (limits.storageBytes / 1024 / 1024).toFixed(0);
                return {
                    allowed: false,
                    message: `📁 พื้นที่เก็บไฟล์เต็ม (${usedMB}MB / ${limitMB}MB)\n💡 อัพเกรดเพื่อเพิ่มพื้นที่`,
                };
            }

            return { allowed: true };
        } catch (error) {
            console.error('checkStorageQuota error:', error);
            return { allowed: true };
        }
    }

    async trackStorageUpload(orgId: string, isGroup: boolean, fileSize: number): Promise<void> {
        try {
            const orgInfo = await this.getOrCreateOrg(orgId, isGroup);
            await this.prisma.organization.update({
                where: { id: orgInfo.id },
                data: { storageUsedBytes: { increment: fileSize } },
            });
        } catch (error) {
            console.error('trackStorageUpload error:', error);
        }
    }

    // ═══════════════════════════════════════════════
    // /plan Command
    // ═══════════════════════════════════════════════
    async getPlanStatus(orgId: string, isGroup: boolean): Promise<string> {
        try {
            const orgInfo = await this.getOrCreateOrg(orgId, isGroup);
            const limits = this.getLimits(orgInfo.plan);
            const org = await this.prisma.organization.findUnique({ where: { id: orgInfo.id } });

            const planEmoji: Record<string, string> = { free: '🆓', basic: '⭐', pro: '🔥', business: '💎' };
            const planLabel = `${planEmoji[orgInfo.plan] || '🆓'} ${orgInfo.plan.toUpperCase()}`;

            const aiUsed = org?.aiChatsToday || 0;
            const aiLimit = limits.aiChatsPerDay >= 999999 ? '∞' : limits.aiChatsPerDay;
            const tasksUsed = org?.tasksThisMonth || 0;
            const taskLimit = limits.tasksPerMonth >= 999999 ? '∞' : limits.tasksPerMonth;
            const storageUsed = Number(org?.storageUsedBytes || 0);
            const storageLimit = limits.storageBytes;
            const storageMB = (storageUsed / 1024 / 1024).toFixed(1);
            const storageLimitMB = (storageLimit / 1024 / 1024).toFixed(0);

            let expires = '';
            if (org?.planExpiresAt) {
                expires = `\n📅 หมดอายุ: ${org.planExpiresAt.toLocaleDateString('th-TH')}`;
            }

            return `📊 แผนของคุณ: ${planLabel}${expires}

🤖 AI แชท: ${aiUsed}/${aiLimit} วันนี้
✅ งาน: ${tasksUsed}/${taskLimit} เดือนนี้
📁 พื้นที่: ${storageMB}MB / ${storageLimitMB}MB

────────────────
💡 อัพเกรดแผน:
⭐ Basic ฿200/เดือน — AI 50/วัน, 5GB
🔥 Pro ฿300/เดือน — AI 200/วัน, 15GB
💎 Business ฿500/เดือน — ไม่จำกัด, 50GB
💎 Business ฿2,500/ปี (save ฿3,500)

📩 ติดต่ออัพเกรด: @arkai`;
        } catch (error) {
            console.error('getPlanStatus error:', error);
            return '❌ ดูแผนไม่สำเร็จ กรุณาลองใหม่';
        }
    }
}
