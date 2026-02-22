import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { StorageQuotaService } from './storage-quota.service';

@Module({
  providers: [StorageService, StorageQuotaService],
  exports: [StorageService, StorageQuotaService],
})
export class StorageModule {}
