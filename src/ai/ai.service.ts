import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class AiService {
  private genAI: GoogleGenerativeAI;

  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
  }

  async summarizeText(text: string): Promise<string> {
    if (!process.env.GEMINI_API_KEY) {
      return '(ไม่ได้ตั้งค่า API Key สำหรับ AI ไม่สามารถสรุปข้อความได้)';
    }
    const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `กรุณาสรุปข้อความต่อไปนี้แบบมืออาชีพ สั้น กระชับ แต่อ่านเข้าใจง่าย:\n\n${text}`;
    try {
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      console.error('AI Summarize Error:', error);
      return `(ข้อผิดพลาดจาก AI: ${error.message})`;
    }
  }

  async extractTask(text: string): Promise<{ title: string; description?: string; dueDate?: Date }> {
    if (!process.env.GEMINI_API_KEY) {
      return { title: text.substring(0, 50) };
    }
    const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `วิเคราะห์ข้อความต่อไปนี้แล้วดึงข้อมูลเพื่อสร้างงาน (Task)
    ข้อความ: "${text}"
    ตอบกลับในรูปแบบ JSON เท่านั้น ห้ามตอบอย่างอื่น โดยมี structure:
    { "title": "ชื่องานแบบสั้นๆ ไม่เกิน 30 ตัวอักษร", "description": "รายละเอียดงาน (ถ้ามี)", "dueDate": "วันที่กำหนดส่ง (ถ้ามี รูปแบบ ISO8601 เช่น 2024-05-20T10:00:00Z)" }
    ถ้าไม่มีให้ใส่ null`;

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
    if (!process.env.GEMINI_API_KEY) {
      return `🤖 AI: ได้รับข้อความ "${text}" (เตือน: ยังไม่ได้ตั้งค่า GEMINI_API_KEY ในไฟล์ .env)`;
    }
    const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    try {
      const result = await model.generateContent(text);
      return result.response.text();
    } catch (error) {
      console.error('AI Chat Error:', error);
      return `(ข้อผิดพลาดจาก AI: ${error.message})`;
    }
  }
}
