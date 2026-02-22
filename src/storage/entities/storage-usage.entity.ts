// Storage Usage Tracking Entity (for TypeORM/Prisma)
// This represents the storage_usage table structure

export interface StorageUsageEntity {
  id: string;
  organization_id: string;
  user_id?: string; // null for org-level tracking
  used_bytes: bigint;
  quota_bytes: bigint; // default: 50GB = 50 * 1024 * 1024 * 1024
  file_count: number;
  last_updated: Date;
  created_at: Date;
}

// Default quota: 50GB per organization
export const DEFAULT_ORG_QUOTA_BYTES = 50 * 1024 * 1024 * 1024; // 50GB
export const DEFAULT_USER_QUOTA_BYTES = 1 * 1024 * 1024 * 1024; // 1GB per user

// Alert thresholds
export const STORAGE_ALERT_THRESHOLD = 0.8; // 80%
export const STORAGE_BLOCK_THRESHOLD = 1.0; // 100%

// File limits
export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB per file
export const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
