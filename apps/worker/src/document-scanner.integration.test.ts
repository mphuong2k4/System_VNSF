import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Pool } from "pg";

const enabled = process.env.RUN_INTEGRATION === "true";
const suite = enabled ? describe : describe.skip;
const bucket = process.env.OBJECT_STORAGE_BUCKET ?? "vnsf-private";
const storage = new S3Client({
  region: "us-east-1",
  endpoint: process.env.OBJECT_STORAGE_ENDPOINT ?? "http://127.0.0.1:9000",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY ?? "",
    secretAccessKey: process.env.OBJECT_STORAGE_SECRET_KEY ?? "",
  },
});
const database = new Pool({ connectionString: process.env.DATABASE_URL });
const documentIds: string[] = [];

suite("document scanner adapters", () => {
  beforeAll(async () => {
    try {
      await storage.send(new CreateBucketCommand({ Bucket: bucket }));
    } catch (error) {
      if (!String(error).includes("BucketAlreadyOwnedByYou")) throw error;
    }
  });
  afterAll(async () => {
    for (const id of documentIds) {
      await storage
        .send(
          new DeleteObjectCommand({ Bucket: bucket, Key: `quarantine/${id}` }),
        )
        .catch(() => undefined);
      await storage
        .send(new DeleteObjectCommand({ Bucket: bucket, Key: `clean/${id}` }))
        .catch(() => undefined);
      await database.query(`DELETE FROM documents WHERE id=$1`, [id]);
    }
    await database.end();
  });
  it.each([
    [
      "clean",
      Buffer.from("%PDF-1.7\nsynthetic integration document"),
      "CLEAN",
      "PROMOTED",
    ],
    [
      "infected",
      Buffer.from(
        "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
      ),
      "INFECTED",
      "DELETED",
    ],
  ])(
    "marks a %s object correctly",
    async (_label, body, scanStatus, storageStatus) => {
      const inserted = await database.query<{ id: string }>(
        `INSERT INTO documents(object_key,checksum,size_bytes,mime_type,scan_status,storage_status,completed_at)
       VALUES('pending','0000000000000000000000000000000000000000000000000000000000000000',$1,'application/pdf','PENDING','QUARANTINED',now()) RETURNING id`,
        [body.length],
      );
      const id = inserted.rows[0]!.id;
      documentIds.push(id);
      const key = `quarantine/${id}`;
      await database.query(`UPDATE documents SET object_key=$2 WHERE id=$1`, [
        id,
        key,
      ]);
      await storage.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body }),
      );
      const { scanDocument } = await import("./document-scanner.js");
      await scanDocument(database, id);
      const result = await database.query<{
        scan_status: string;
        storage_status: string;
      }>(`SELECT scan_status,storage_status FROM documents WHERE id=$1`, [id]);
      expect(result.rows[0]).toMatchObject({
        scan_status: scanStatus,
        storage_status: storageStatus,
      });
    },
    60_000,
  );
});
