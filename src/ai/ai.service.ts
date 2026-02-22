import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class AiService {
  private genAI: GoogleGenerativeAI;
  private apiKey: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('GEMINI_API_KEY') || '';
    this.genAI = new GoogleGenerativeAI(this.apiKey);
  }

  async summarizeText(text: string): Promise<string> {
    if (!this.apiKey) {
      return '⚠️ ยังไม่ได้ตั้งค่า AI / AI not configured (GEMINI_API_KEY missing)';
    }
    const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const prompt = `สรุปข้อความต่อไปนี้แบบสั้น กระชับ เป็นภาษาไทย ใช้ emoji ให้อ่านง่าย ถ้ามีงานหรือ action items ให้แยกออกมาเป็นรายการด้วย:\n\n${text}`;
    try {
      const result = await model.generateContent(prompt);
      return `📋 สรุป / Summary:\n${result.response.text()}`;
    } catch (error) {
      console.error('AI Summarize Error:', error);
      return `❌ AI Error: ${(error as Error).message}`;
    }
  }

  async extractTask(text: string): Promise<{ title: string; description?: string; dueDate?: Date }> {
    if (!this.apiKey) {
      return { title: text.substring(0, 50) };
    }
    const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const today = new Date().toISOString().split('T')[0];
    const prompt = `วิเคราะห์ข้อความต่อไปนี้แล้วดึงข้อมูลเพื่อสร้างงาน (Task)
    วันนี้คือ: ${today}
    ข้อความ: "${text}"
    ตอบกลับในรูปแบบ JSON เท่านั้น ห้ามตอบอย่างอื่น:
    { "title": "ชื่องานสั้นๆ ไม่เกิน 50 ตัวอักษร", "description": "รายละเอียด (ถ้ามี หรือ null)", "dueDate": "วันที่กำหนดส่ง ISO8601 เช่น 2024-05-20T10:00:00Z (ถ้ามี หรือ null)" }
    ถ้ามีคำว่า "พรุ่งนี้" หรือ "tomorrow" ให้คำนวณวันพรุ่งนี้จากวันนี้
    ถ้ามีคำว่า "มะรืน" หรือ "day after tomorrow" ให้คำนวณวันมะรืนจากวันนี้`;

    try {
      const result = await model.generateContent(prompt);
      let resText = result.response.text().trim();
      resText = resText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(resText);
      return {
        title: parsed.title || text.substring(0, 50),
        description: parsed.description || undefined,
        dueDate: parsed.dueDate ? new Date(parsed.dueDate) : undefined
      };
    } catch (error) {
      console.error('AI Extract Task Error:', error);
      return { title: text.substring(0, 50) };
    }
  }

  async chat(text: string): Promise<string> {
    if (!this.apiKey) {
      return `🤖 ยังไม่ได้ตั้งค่า AI / AI not configured\nกรุณาตั้งค่า GEMINI_API_KEY`;
    }
    const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const prompt = `คุณคือ Arkai ผู้ช่วยทำงานอัจฉริยะที่สุภาพ เป็นมิตร และเป็นมืออาชีพ
ตอบคำถามหรือสนทนาในเรื่องทั่วไป ให้ตอบสั้นกระชับ ไม่เกิน 3-5 บรรทัด
ถ้าผู้ใช้ถามเป็นภาษาไทยให้ตอบเป็นไทย ถ้าถามเป็นอังกฤษให้ตอบเป็นอังกฤษ
ถ้าผู้ใช้ต้องการใช้ฟีเจอร์เฉพาะให้แนะนำคำสั่ง / ที่เกี่ยวข้อง

ข้อความจากผู้ใช้: ${text}`;

    try {
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      console.error('AI Chat Error:', error);
      return `❌ AI Error: ${(error as Error).message}`;
    }
  }
}
