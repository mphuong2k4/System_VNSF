import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { loadConfig } from "@vnsf/config";
import { createHash } from "node:crypto";
import { createConnection } from "node:net";
import type { Pool } from "pg";
import { parseClamResponse } from "./clam-response.js";

const config = loadConfig();
const storage = new S3Client({
  region: "us-east-1",
  endpoint: config.OBJECT_STORAGE_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: config.OBJECT_STORAGE_ACCESS_KEY,
    secretAccessKey: config.OBJECT_STORAGE_SECRET_KEY,
  },
});
async function scanOnce(buffer: Buffer) {
  return new Promise<"CLEAN" | "INFECTED">((resolve, reject) => {
    const socket = createConnection({
      host: config.CLAMAV_HOST,
      port: config.CLAMAV_PORT,
    });
    let response = "";
    socket.setTimeout(30_000, () =>
      socket.destroy(new Error("CLAMAV_TIMEOUT")),
    );
    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      for (let offset = 0; offset < buffer.length; offset += 65_536) {
        const chunk = buffer.subarray(offset, offset + 65_536);
        const size = Buffer.allocUnsafe(4);
        size.writeUInt32BE(chunk.length);
        socket.write(size);
        socket.write(chunk);
      }
      socket.end(Buffer.alloc(4));
    });
    socket.on("data", (chunk: Buffer) => {
      response += chunk.toString("utf8");
    });
    socket.on("error", reject);
    socket.on("close", (hadError) => {
      if (!hadError) {
        try {
          resolve(parseClamResponse(response));
        } catch (error) {
          reject(error);
        }
      }
    });
  });
}
async function scan(buffer: Buffer) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      return await scanOnce(buffer);
    } catch (error) {
      lastError = error;
      if (attempt < 6)
        await new Promise((resolve) =>
          setTimeout(resolve, 500 * 2 ** (attempt - 1)),
        );
    }
  }
  throw lastError;
}
export async function scanDocument(database: Pool, documentId: string) {
  const result = await database.query<{
    object_key: string;
    completed_at: Date | null;
    checksum: string;
    size_bytes: string;
  }>(
    `SELECT object_key,completed_at,checksum,size_bytes FROM documents WHERE id=$1 AND storage_status='QUARANTINED'`,
    [documentId],
  );
  const document = result.rows[0];
  if (!document?.completed_at) throw new Error("DOCUMENT_NOT_READY");
  try {
    const head = await storage.send(
      new HeadObjectCommand({
        Bucket: config.OBJECT_STORAGE_BUCKET,
        Key: document.object_key,
      }),
    );
    if (Number(head.ContentLength) !== Number(document.size_bytes))
      throw new Error("FILE_INTEGRITY_MISMATCH");
    const object = await storage.send(
      new GetObjectCommand({
        Bucket: config.OBJECT_STORAGE_BUCKET,
        Key: document.object_key,
      }),
    );
    const body = Buffer.from(await object.Body!.transformToByteArray());
    if (
      body.length !== Number(document.size_bytes) ||
      body.length > 10_485_760 ||
      createHash("sha256").update(body).digest("hex") !== document.checksum
    )
      throw new Error("FILE_INTEGRITY_MISMATCH");
    const status = await scan(body);
    if (status === "CLEAN") {
      const promotedKey = `clean/${documentId}`;
      await storage.send(
        new CopyObjectCommand({
          Bucket: config.OBJECT_STORAGE_BUCKET,
          Key: promotedKey,
          CopySource: `${config.OBJECT_STORAGE_BUCKET}/${document.object_key}`,
        }),
      );
      await storage.send(
        new DeleteObjectCommand({
          Bucket: config.OBJECT_STORAGE_BUCKET,
          Key: document.object_key,
        }),
      );
      await database.query(
        `UPDATE documents SET scan_status='CLEAN',storage_status='PROMOTED',promoted_key=$2,scanned_at=now(),version=version+1 WHERE id=$1`,
        [documentId, promotedKey],
      );
    } else {
      await storage.send(
        new DeleteObjectCommand({
          Bucket: config.OBJECT_STORAGE_BUCKET,
          Key: document.object_key,
        }),
      );
      await database.query(
        `UPDATE documents SET scan_status='INFECTED',storage_status='DELETED',scanned_at=now(),version=version+1 WHERE id=$1`,
        [documentId],
      );
    }
  } catch (error) {
    await database.query(
      `UPDATE documents SET scan_status='ERROR',version=version+1 WHERE id=$1`,
      [documentId],
    );
    throw error;
  }
}
