import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { WebhookModule } from './webhook/webhook.module';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AiModule } from './ai/ai.module';
import { SubscriptionModule } from './subscription/subscription.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AiModule, SubscriptionModule, WebhookModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
