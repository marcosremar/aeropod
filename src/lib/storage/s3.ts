import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  PutObjectCommandInput,
  GetObjectCommandInput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface StorageConfig {
  accessKey: string;
  secretKey: string;
  bucket: string;
  endpoint?: string;
  region?: string;
}

export interface UploadOptions {
  key: string;
  body: Buffer | Uint8Array | ReadableStream;
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface DownloadOptions {
  key: string;
}

export interface SignedUrlOptions {
  key: string;
  expiresIn?: number; // seconds, default 3600
}

export interface StorageClient {
  upload(options: UploadOptions): Promise<{ key: string; url: string }>;
  download(options: DownloadOptions): Promise<Buffer>;
  getSignedUrl(options: SignedUrlOptions): Promise<string>;
}

export class S3StorageClient implements StorageClient {
  private client: S3Client;
  private bucket: string;

  constructor(config: StorageConfig) {
    this.bucket = config.bucket;

    this.client = new S3Client({
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
      endpoint: config.endpoint,
      region: config.region || 'auto',
      forcePathStyle: !!config.endpoint, // Required for R2 and MinIO
    });
  }

  async upload(options: UploadOptions): Promise<{ key: string; url: string }> {
    const params: PutObjectCommandInput = {
      Bucket: this.bucket,
      Key: options.key,
      Body: options.body,
      ContentType: options.contentType,
      Metadata: options.metadata,
    };

    const command = new PutObjectCommand(params);
    await this.client.send(command);

    // Construct the URL (for public buckets or with endpoint)
    const url = this.constructUrl(options.key);

    return { key: options.key, url };
  }

  async download(options: DownloadOptions): Promise<Buffer> {
    const params: GetObjectCommandInput = {
      Bucket: this.bucket,
      Key: options.key,
    };

    const command = new GetObjectCommand(params);
    const response = await this.client.send(command);

    if (!response.Body) {
      throw new Error(`No body returned for key: ${options.key}`);
    }

    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  }

  async getSignedUrl(options: SignedUrlOptions): Promise<string> {
    const params: GetObjectCommandInput = {
      Bucket: this.bucket,
      Key: options.key,
    };

    const command = new GetObjectCommand(params);
    const url = await getSignedUrl(this.client, command, {
      expiresIn: options.expiresIn || 3600,
    });

    return url;
  }

  private constructUrl(key: string): string {
    // This is a simple URL construction; in production, you might want to use
    // a CDN URL or signed URL instead
    const endpoint = this.client.config.endpoint;
    if (endpoint) {
      return `${endpoint}/${this.bucket}/${key}`;
    }
    return `https://${this.bucket}.s3.amazonaws.com/${key}`;
  }
}

export class MockStorageClient implements StorageClient {
  private storage: Map<string, { buffer: Buffer; metadata?: Record<string, string> }> = new Map();
  private baseUrl: string;

  constructor(baseUrl = 'https://mock-storage.example.com') {
    this.baseUrl = baseUrl;
  }

  async upload(options: UploadOptions): Promise<{ key: string; url: string }> {
    let buffer: Buffer;
    if (Buffer.isBuffer(options.body)) {
      buffer = options.body;
    } else if (options.body instanceof Uint8Array) {
      buffer = Buffer.from(options.body);
    } else {
      // ReadableStream - convert to buffer
      const chunks: Uint8Array[] = [];
      const reader = options.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      buffer = Buffer.concat(chunks);
    }

    this.storage.set(options.key, {
      buffer,
      metadata: options.metadata,
    });

    const url = `${this.baseUrl}/${options.key}`;
    return { key: options.key, url };
  }

  async download(options: DownloadOptions): Promise<Buffer> {
    const item = this.storage.get(options.key);
    if (!item) {
      throw new Error(`Key not found: ${options.key}`);
    }
    return item.buffer;
  }

  async getSignedUrl(options: SignedUrlOptions): Promise<string> {
    if (!this.storage.has(options.key)) {
      throw new Error(`Key not found: ${options.key}`);
    }
    return `${this.baseUrl}/${options.key}?signed=true&expires=${Date.now() + (options.expiresIn || 3600) * 1000}`;
  }

  // Helper method for testing
  clear(): void {
    this.storage.clear();
  }

  // Helper method to check if a key exists
  has(key: string): boolean {
    return this.storage.has(key);
  }
}

// Factory function to create storage client based on environment
export function createStorageClient(useMock = false): StorageClient {
  if (useMock) {
    return new MockStorageClient();
  }

  const config: StorageConfig = {
    accessKey: process.env.S3_ACCESS_KEY || '',
    secretKey: process.env.S3_SECRET_KEY || '',
    bucket: process.env.S3_BUCKET || '',
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION,
  };

  const isConfigured = config.accessKey && config.secretKey && config.bucket;

  if (!isConfigured) {
    // In production, missing storage config is a fatal misconfiguration.
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'Missing required S3 configuration: S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET'
      );
    }
    // In development/test, degrade gracefully to in-memory mock storage.
    console.warn(
      '[Storage] S3 not configured (S3_ACCESS_KEY/S3_SECRET_KEY/S3_BUCKET). ' +
        'Using in-memory mock storage. Set these env vars for real uploads.'
    );
    return new MockStorageClient();
  }

  return new S3StorageClient(config);
}
