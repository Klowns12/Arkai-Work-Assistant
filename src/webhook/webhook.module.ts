import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { CommandService } from './command.service';
import { StorageModule } from '../storage/storage.module';
import { TaskModule } from '../task/task.module';
import { MemoryModule } from '../memory/memory.module';
import { ReminderModule } from '../reminder/reminder.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    StorageModule,
    TaskModule,
    MemoryModule,
    ReminderModule,
    PrismaModule,
    AiModule,
  ],
  controllers: [WebhookController],
  providers: [CommandService],
})
export class WebhookModule {}
