import { createConnection, type Socket } from "node:net";

function response(socket: Socket) {
  return new Promise<string>((resolve, reject) => {
    let buffer = "";
    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\r\n").filter(Boolean);
      const last = lines.at(-1);
      if (last && /^\d{3} /.test(last)) {
        cleanup();
        resolve(buffer);
      }
    };
    socket.on("data", onData);
    socket.once("error", onError);
  });
}

async function command(socket: Socket, value: string, expected: number[]) {
  socket.write(`${value}\r\n`);
  const reply = await response(socket);
  const code = Number(reply.slice(0, 3));
  if (!expected.includes(code))
    throw new Error(`SMTP_RESPONSE_${code || "INVALID"}`);
}

export async function sendSmtpText(input: {
  smtpUrl: string;
  from: string;
  to: string;
  subject: string;
  text: string;
}) {
  const endpoint = new URL(input.smtpUrl);
  if (endpoint.protocol !== "smtp:")
    throw new Error("SMTP_PROTOCOL_UNSUPPORTED");
  const socket = createConnection({
    host: endpoint.hostname,
    port: Number(endpoint.port || 25),
  });
  socket.setTimeout(30_000, () => socket.destroy(new Error("SMTP_TIMEOUT")));
  try {
    const greeting = await response(socket);
    if (!greeting.startsWith("220")) throw new Error("SMTP_GREETING_INVALID");
    await command(socket, "EHLO vnsf.local", [250]);
    if (endpoint.username) {
      const auth = Buffer.from(
        `\0${decodeURIComponent(endpoint.username)}\0${decodeURIComponent(endpoint.password)}`,
      ).toString("base64");
      await command(socket, `AUTH PLAIN ${auth}`, [235]);
    }
    await command(socket, `MAIL FROM:<${input.from}>`, [250]);
    await command(socket, `RCPT TO:<${input.to}>`, [250, 251]);
    await command(socket, "DATA", [354]);
    const subject = input.subject.replace(/[\r\n]/g, " ");
    const body = input.text.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
    socket.write(
      `From: ${input.from}\r\nTo: ${input.to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${body}\r\n.\r\n`,
    );
    const accepted = await response(socket);
    if (!accepted.startsWith("250")) throw new Error("SMTP_MESSAGE_REJECTED");
    await command(socket, "QUIT", [221]);
  } finally {
    socket.destroy();
  }
}
