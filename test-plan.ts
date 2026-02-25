import { SubscriptionService } from './src/subscription/subscription.service';
import { PrismaService } from './src/prisma/prisma.service';
import { ConfigModule } from '@nestjs/config';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
    const prisma = new PrismaService();
    await prisma.onModuleInit();
    const service = new SubscriptionService(prisma);
    try {
        const result = await service.getPlanStatus('U1234567890', false);
        console.log('Result:\n', result);
    } catch (error) {
        console.error('Test error:', error);
    } finally {
        await prisma.onModuleDestroy();
    }
}

main();
