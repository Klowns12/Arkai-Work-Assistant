import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { CommandService } from './command.service';
import { AiService } from 'src/ai/ai.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [WebhookController],
  providers: [CommandService, AiService],
})
export class WebhookModule {}
