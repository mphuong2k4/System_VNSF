import { createCipheriv, randomBytes, randomUUID } from "node:crypto";
import argon2 from "argon2";
import { authenticator } from "otplib";
import pg from "pg";

if (
  process.env.APP_ENV !== "development" ||
  process.env.DEMO_ALLOW_ADMIN_SEED !== "true"
) {
  throw new Error(
    "Demo admin seed requires APP_ENV=development and DEMO_ALLOW_ADMIN_SEED=true",
  );
}

const email = process.env.DEMO_ADMIN_EMAIL;
const password = process.env.DEMO_ADMIN_PASSWORD;
const databaseUrl = process.env.DATABASE_URL;
const keyBase64 = process.env.FIELD_ENCRYPTION_KEY_BASE64;
if (!email || !password || !databaseUrl || !keyBase64)
  throw new Error(
    "Demo admin email, password, database URL and encryption key are required",
  );
if (password.length < 16)
  throw new Error("Demo admin password must contain at least 16 characters");

const encrypt = (value) => {
  const key = Buffer.from(keyBase64, "base64");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
};

const secret = authenticator.generateSecret();
const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  await client.query("BEGIN");
  const user = await client.query(
    `INSERT INTO users(id,email,password_hash,status,failed_count,locked_until)
     VALUES($1,$2,$3,'ACTIVE',0,NULL)
     ON CONFLICT ((lower(email))) DO UPDATE SET
       password_hash=excluded.password_hash,status='ACTIVE',failed_count=0,locked_until=NULL
     RETURNING id`,
    [randomUUID(), email, passwordHash],
  );
  const userId = user.rows[0].id;
  await client.query(
    `INSERT INTO roles(code) VALUES('SUPER_ADMIN') ON CONFLICT(code) DO NOTHING`,
  );
  await client.query(
    `UPDATE user_roles SET effective_to=now()
     WHERE user_id=$1 AND effective_to IS NULL
       AND role_id<>(SELECT id FROM roles WHERE code='SUPER_ADMIN')`,
    [userId],
  );
  await client.query(
    `INSERT INTO user_roles(user_id,role_id)
     SELECT $1,id FROM roles WHERE code='SUPER_ADMIN'
     ON CONFLICT DO NOTHING`,
    [userId],
  );
  await client.query(
    `UPDATE mfa_factors SET disabled_at=now()
     WHERE user_id=$1 AND disabled_at IS NULL`,
    [userId],
  );
  await client.query(
    `INSERT INTO mfa_factors(user_id,type,secret_ciphertext,key_version,verified_at)
     VALUES($1,'TOTP',$2,1,now())`,
    [userId, encrypt(secret)],
  );
  await client.query(
    `UPDATE sessions SET revoked_at=now(),revoke_reason='DEMO_ADMIN_RESEEDED'
     WHERE user_id=$1 AND revoked_at IS NULL`,
    [userId],
  );
  await client.query("COMMIT");
  console.log(
    JSON.stringify({
      email,
      totp_secret: secret,
      otpauth_uri: authenticator.keyuri(email, "VNSF Demo", secret),
    }),
  );
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
