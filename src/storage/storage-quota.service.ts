import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import {
  StorageUsageEntity,
  DEFAULT_ORG_QUOTA_BYTES,
  STORAGE_ALERT_THRESHOLD,
  STORAGE_BLOCK_THRESHOLD,
  MAX_FILE_SIZE_BYTES,
} from './entities/storage-usage.entity';

@Injectable()
export class StorageQuotaService {
  // In-memory storage for now - replace with database in production
  private storageMap: Map<string, StorageUsageEntity> = new Map();

  async checkQuota(organizationId: string, fileSize: number): Promise<void> {
    // Check file size limit
    if (fileSize > MAX_FILE_SIZE_BYTES) {
      throw new HttpException(
        `File too large. Max size: ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const usage = await this.getUsage(organizationId);
    const newUsedBytes = BigInt(usage.used_bytes) + BigInt(fileSize);
    const quota = BigInt(usage.quota_bytes);

    // Check if exceeds quota
    if (newUsedBytes > quota) {
      throw new HttpException(
        'Storage quota exceeded. Please contact admin.',
        HttpStatus.FORBIDDEN,
      );
    }
  }

  async trackUpload(organizationId: string, fileSize: number): Promise<void> {
    const usage = await this.getUsage(organizationId);
    usage.used_bytes = BigInt(usage.used_bytes) + BigInt(fileSize);
    usage.file_count += 1;
    usage.last_updated = new Date();

    this.storageMap.set(organizationId, usage);

    // Check alert threshold
    const usageRatio = Number(usage.used_bytes) / Number(usage.quota_bytes);
    if (usageRatio >= STORAGE_ALERT_THRESHOLD && usageRatio < STORAGE_BLOCK_THRESHOLD) {
      // TODO: Send alert to admin
      console.warn(`[STORAGE ALERT] Org ${organizationId} at ${(usageRatio * 100).toFixed(1)}%`);
    }
  }

  async trackDelete(organizationId: string, fileSize: number): Promise<void> {
    const usage = await this.getUsage(organizationId);
    const current = BigInt(usage.used_bytes);
    const toDelete = BigInt(fileSize);

    usage.used_bytes = current > toDelete ? current - toDelete : BigInt(0);
    usage.file_count = Math.max(0, usage.file_count - 1);
    usage.last_updated = new Date();

    this.storageMap.set(organizationId, usage);
  }

  async getUsage(organizationId: string): Promise<StorageUsageEntity> {
    let usage = this.storageMap.get(organizationId);
    if (!usage) {
      usage = {
        id: crypto.randomUUID(),
        organization_id: organizationId,
        used_bytes: BigInt(0),
        quota_bytes: BigInt(DEFAULT_ORG_QUOTA_BYTES),
        file_count: 0,
        last_updated: new Date(),
        created_at: new Date(),
      };
      this.storageMap.set(organizationId, usage);
    }
    return usage;
  }

  getStorageStatus(organizationId: string): {
    used: string;
    quota: string;
    percentage: number;
    fileCount: number;
  } {
    const usage = this.storageMap.get(organizationId) || {
      used_bytes: BigInt(0),
      quota_bytes: BigInt(DEFAULT_ORG_QUOTA_BYTES),
      file_count: 0,
    };

    const used = Number(usage.used_bytes);
    const quota = Number(usage.quota_bytes);

    return {
      used: this.formatBytes(used),
      quota: this.formatBytes(quota),
      percentage: Math.round((used / quota) * 100),
      fileCount: usage.file_count || 0,
    };
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
