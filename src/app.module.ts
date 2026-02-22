import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { WebhookModule } from './webhook/webhook.module';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AiModule } from './ai/ai.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AiModule, WebhookModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
