import { Injectable } from '@nestjs/common';

/**
 * Rule-based AI Service — no external API required.
 * Provides keyword-matching chat, simple text summarization,
 * and basic task extraction from natural language.
 */
@Injectable()
export class AiService {
  /**
   * Summarize messages by showing count + latest messages.
   * No AI — just formats the raw text.
   */
  summarizeText(text: string): string {
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) return '📭 ไม่มีข้อความให้สรุป';

    const total = lines.length;
    const preview = lines.slice(-15); // Show last 15 messages

    let result = `📋 สรุปแชท (${total} ข้อความ):\n\n`;
    result += preview.map((line, i) => `${i + 1}. ${line.substring(0, 100)}`).join('\n');

    if (total > 15) {
      result += `\n\n... และอีก ${total - 15} ข้อความก่อนหน้า`;
    }

    return result;
  }

  /**
   * Extract task info from natural text.
   * Simple parser: detect "พรุ่งนี้/tomorrow/มะรืน" for due date,
   * use the full text as title (capped at 80 chars).
   */
  extractTask(text: string): { title: string; description?: string; dueDate?: Date } {
    const lowerText = text.toLowerCase();
    let dueDate: Date | undefined;

    // Detect due date from Thai/English keywords
    if (
      lowerText.includes('พรุ่งนี้') ||
      lowerText.includes('tomorrow')
    ) {
      dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 1);
      dueDate.setHours(9, 0, 0, 0);
    } else if (
      lowerText.includes('มะรืน') ||
      lowerText.includes('day after tomorrow')
    ) {
      dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 2);
      dueDate.setHours(9, 0, 0, 0);
    } else if (lowerText.includes('สัปดาห์หน้า') || lowerText.includes('next week')) {
      dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7);
      dueDate.setHours(9, 0, 0, 0);
    }

    // Clean title: remove date keywords
    let title = text
      .replace(/พรุ่งนี้|tomorrow|มะรืน|day after tomorrow|สัปดาห์หน้า|next week/gi, '')
      .trim();

    if (!title) title = text;
    title = title.substring(0, 80);

    return {
      title,
      description: text.length > 80 ? text : undefined,
      dueDate,
    };
  }

  /**
   * Rule-based chat response.
   * Matches keywords and returns helpful responses + command suggestions.
   */
  chat(text: string): string {
    const lowerText = text.toLowerCase();

    // Greeting
    if (this.matchesAny(lowerText, ['สวัสดี', 'หวัดดี', 'hello', 'hi', 'hey', 'ดี'])) {
      return '👋 สวัสดีครับ! ผม Arkai ผู้ช่วยทำงานของคุณ\n\nพิมพ์ /help เพื่อดูคำสั่งทั้งหมด 📚';
    }

    // Thanks
    if (this.matchesAny(lowerText, ['ขอบคุณ', 'thank', 'thanks', 'thx'])) {
      return '😊 ยินดีครับ! มีอะไรให้ช่วยอีกก็บอกได้เลยนะ';
    }

    // Ask about tasks
    if (this.matchesAny(lowerText, ['งาน', 'task', 'todo', 'ต้องทำ'])) {
      return '✅ จัดการงานได้ด้วยคำสั่ง:\n• /task [รายละเอียด] — สร้างงาน\n• /mytasks — ดูงานของคุณ\n• /alltasks — ดูงานทั้งหมด';
    }

    // Ask about files
    if (this.matchesAny(lowerText, ['ไฟล์', 'file', 'รูป', 'เอกสาร', 'document'])) {
      return '📁 จัดการไฟล์:\n• ส่งไฟล์/รูปเข้ามา → เก็บอัตโนมัติ\n• /files — ดูไฟล์ทั้งหมด\n• /file pdf — ดูเฉพาะ PDF';
    }

    // Ask about summary
    if (this.matchesAny(lowerText, ['สรุป', 'summary', 'recap'])) {
      return '📝 สรุปแชท:\n• /summary — สรุปแชทวันนี้\n• /yesterday — สรุปเมื่อวาน';
    }

    // Ask about reminders
    if (this.matchesAny(lowerText, ['เตือน', 'remind', 'alarm', 'นัด'])) {
      return '⏰ ตั้งเตือน:\n• /remind [เรื่อง] — เตือนพรุ่งนี้ 09:00';
    }

    // Ask about notes/memory
    if (this.matchesAny(lowerText, ['จำ', 'บันทึก', 'note', 'remember', 'จด'])) {
      return '🧠 บันทึกความจำ:\n• /note [ข้อความ] — บันทึก\n• /agreements — ดูข้อตกลง';
    }

    // Ask about plan/pricing
    if (this.matchesAny(lowerText, ['ราคา', 'price', 'แพ็ค', 'plan', 'upgrade', 'อัพเกรด'])) {
      return '📊 ดูแผน/ราคา:\n• /plan — ดูแผนปัจจุบันและอัพเกรด';
    }

    // How to use / help
    if (this.matchesAny(lowerText, ['ใช้ยังไง', 'วิธีใช้', 'how', 'help', 'ช่วย', 'ทำอะไรได้'])) {
      return 'พิมพ์ /help เพื่อดูคำสั่งทั้งหมด 📚';
    }

    // Default response
    return `💬 ผม Arkai ผู้ช่วยทำงานครับ!\n\nผมช่วยได้เรื่อง:\n📁 เก็บไฟล์ • ✅ จัดการงาน • 📝 สรุปแชท\n🧠 บันทึกความจำ • ⏰ เตือนความจำ\n\nพิมพ์ /help เพื่อดูคำสั่งทั้งหมด`;
  }

  private matchesAny(text: string, keywords: string[]): boolean {
    return keywords.some((kw) => text.includes(kw));
  }
}
