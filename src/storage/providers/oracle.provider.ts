import { Injectable } from '@nestjs/common';
import { StorageProvider } from '../storage.interface';
import type { StorageConfig } from '../storage.interface';

@Injectable()
export class OracleStorageProvider implements StorageProvider {
  // Stub for Oracle Cloud Object Storage
  // To be implemented when scaling beyond 1000 users

  constructor(config: StorageConfig) {
    // Oracle Cloud Infrastructure (OCI) Object Storage initialization
    // https://docs.oracle.com/en-us/iaas/Content/Object/Concepts/objectstorageoverview.htm
    throw new Error(
      'Oracle Storage Provider not yet implemented. Use S3/R2 for now.',
    );
  }

  async upload(
    key: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<string> {
    throw new Error('Not implemented');
  }

  async download(key: string): Promise<Buffer> {
    throw new Error('Not implemented');
  }

  async delete(key: string): Promise<void> {
    throw new Error('Not implemented');
  }

  getUrl(key: string): string {
    throw new Error('Not implemented');
  }

  async getPresignedUrl(
    key: string,
    expiresInSeconds?: number,
  ): Promise<string> {
    throw new Error('Not implemented');
  }
}
