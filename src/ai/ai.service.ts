import { Injectable } from '@nestjs/common';

@Injectable()
export class AiService {
  async chat(text: string): Promise<string> {
    // TODO: Implement AI chat integration
    return `🤖 AI: ได้รับข้อความ "${text}" (ระบบ AI อยู่ระหว่างพัฒนา)`;
  }
}
