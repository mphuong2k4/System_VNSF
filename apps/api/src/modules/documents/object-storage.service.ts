import { Injectable } from "@nestjs/common";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { loadConfig } from "@vnsf/config";

@Injectable()
export class ObjectStorageService {
  private readonly config = loadConfig();
  private readonly client = new S3Client({
    region: "us-east-1",
    endpoint: this.config.OBJECT_STORAGE_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: this.config.OBJECT_STORAGE_ACCESS_KEY,
      secretAccessKey: this.config.OBJECT_STORAGE_SECRET_KEY,
    },
  });
  uploadUrl(key: string, mimeType: string, checksum: string) {
    const command = new PutObjectCommand({
      Bucket: this.config.OBJECT_STORAGE_BUCKET,
      Key: key,
      ContentType: mimeType,
      Metadata: { "expected-sha256": checksum },
    });
    return getSignedUrl(this.client, command, { expiresIn: 900 });
  }
  head(key: string) {
    return this.client.send(
      new HeadObjectCommand({
        Bucket: this.config.OBJECT_STORAGE_BUCKET,
        Key: key,
      }),
    );
  }
  async read(key: string) {
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.config.OBJECT_STORAGE_BUCKET,
        Key: key,
      }),
    );
    return Buffer.from(await result.Body!.transformToByteArray());
  }
  downloadUrl(key: string) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.config.OBJECT_STORAGE_BUCKET,
        Key: key,
      }),
      { expiresIn: 300 },
    );
  }
}
