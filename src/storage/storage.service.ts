import { Injectable } from '@nestjs/common';
import { StorageProvider, StorageConfig } from './storage.interface';
import { S3StorageProvider } from './providers/s3.provider';
import { OracleStorageProvider } from './providers/oracle.provider';

@Injectable()
export class StorageService {
  private provider: StorageProvider;
  private config: StorageConfig;

  constructor() {
    this.config = {
      provider:
        (process.env.STORAGE_PROVIDER as 'r2' | 's3' | 'oracle') || 'r2',
      endpoint: process.env.STORAGE_ENDPOINT || '',
      region: process.env.STORAGE_REGION || 'auto',
      bucket: process.env.STORAGE_BUCKET || '',
      accessKeyId: process.env.STORAGE_ACCESS_KEY || '',
      secretAccessKey: process.env.STORAGE_SECRET_KEY || '',
    };

    this.provider = this.createProvider(this.config);
  }

  private createProvider(config: StorageConfig): StorageProvider {
    switch (config.provider) {
      case 'r2':
      case 's3':
        return new S3StorageProvider(config);
      case 'oracle':
        return new OracleStorageProvider(config);
      default:
        throw new Error(`Unknown storage provider: ${config.provider}`);
    }
  }

  async uploadFile(
    key: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<string> {
    return this.provider.upload(key, buffer, contentType);
  }

  async downloadFile(key: string): Promise<Buffer> {
    return this.provider.download(key);
  }

  async deleteFile(key: string): Promise<void> {
    return this.provider.delete(key);
  }

  getFileUrl(key: string): string {
    return this.provider.getUrl(key);
  }

  async getPresignedUrl(
    key: string,
    expiresInSeconds: number = 3600,
  ): Promise<string> {
    return this.provider.getPresignedUrl(key, expiresInSeconds);
  }

  // Multi-tenant key generation: orgId/filename
  generateKey(organizationId: string, filename: string): string {
    const timestamp = Date.now();
    const sanitized = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    return `${organizationId}/${timestamp}-${sanitized}`;
  }
}
