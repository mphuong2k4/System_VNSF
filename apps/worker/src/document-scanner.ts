import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { loadConfig } from "@vnsf/config";
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
async function scan(buffer: Buffer) {
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
export async function scanDocument(database: Pool, documentId: string) {
  const result = await database.query<{
    object_key: string;
    completed_at: Date | null;
  }>(
    `SELECT object_key,completed_at FROM documents WHERE id=$1 AND storage_status='QUARANTINED'`,
    [documentId],
  );
  const document = result.rows[0];
  if (!document?.completed_at) throw new Error("DOCUMENT_NOT_READY");
  try {
    const object = await storage.send(
      new GetObjectCommand({
        Bucket: config.OBJECT_STORAGE_BUCKET,
        Key: document.object_key,
      }),
    );
    const body = Buffer.from(await object.Body!.transformToByteArray());
    if (body.length > 10_485_760) throw new Error("DOCUMENT_TOO_LARGE");
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
