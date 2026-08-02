import { Injectable } from "@nestjs/common";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";
import { loadConfig } from "@vnsf/config";

@Injectable()
export class CryptoService {
  private readonly encryptionKey = Buffer.from(
    loadConfig().FIELD_ENCRYPTION_KEY_BASE64,
    "base64",
  );
  private readonly hmacKey = Buffer.from(
    loadConfig().FIELD_HMAC_KEY_BASE64,
    "base64",
  );
  hash(value: string) {
    return createHmac("sha256", this.hmacKey).update(value).digest("hex");
  }
  tokenHash(value: string) {
    return createHash("sha256").update(value).digest("hex");
  }
  encrypt(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, iv);
    const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]);
  }
  decrypt(value: Buffer) {
    const iv = value.subarray(0, 12);
    const tag = value.subarray(12, 28);
    const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(value.subarray(28)),
      decipher.final(),
    ]).toString("utf8");
  }
}
