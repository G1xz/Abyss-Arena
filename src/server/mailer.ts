import nodemailer from "nodemailer";

/** E-mail é opcional: sem SMTP configurado, a recuperação de acesso fica desabilitada. */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

export async function sendMail(to: string, subject: string, text: string) {
  if (!isEmailConfigured()) throw new Error("SMTP não configurado");
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  });
  await transport.sendMail({ from: process.env.SMTP_FROM, to, subject, text });
}
