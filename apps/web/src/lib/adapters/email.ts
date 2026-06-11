export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailProvider {
  send(msg: EmailMessage): Promise<void>;
}

class ConsoleEmailProvider implements EmailProvider {
  async send(msg: EmailMessage): Promise<void> {
    console.log("\n--- EMAIL (console) ---");
    console.log(`To: ${msg.to}`);
    console.log(`Subject: ${msg.subject}`);
    console.log(msg.text);
    console.log("---\n");
  }
}

class SmtpEmailProvider implements EmailProvider {
  private transporter: import("nodemailer").Transporter | null = null;

  private async getTransporter() {
    if (this.transporter) return this.transporter;
    const nodemailer = await import("nodemailer");
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" }
        : undefined,
    });
    return this.transporter;
  }

  async send(msg: EmailMessage): Promise<void> {
    const t = await this.getTransporter();
    await t.sendMail({
      from: process.env.EMAIL_FROM ?? "noreply@contract-platform.local",
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html ?? msg.text.replace(/\n/g, "<br>"),
    });
  }
}

let _email: EmailProvider | null = null;

export function email(): EmailProvider {
  if (!_email) {
    _email = (process.env.EMAIL_PROVIDER ?? "console") === "smtp" ? new SmtpEmailProvider() : new ConsoleEmailProvider();
  }
  return _email;
}

export async function sendDealPortalInvite(opts: {
  to: string;
  dealTitle: string;
  orgName: string;
  portalUrl: string;
  message?: string | null;
}) {
  const text = [
    `${opts.orgName} invited you to review: ${opts.dealTitle}`,
    "",
    opts.message ?? "Please review the document and upload your revision if needed.",
    "",
    `Open your portal: ${opts.portalUrl}`,
  ].join("\n");

  await email().send({
    to: opts.to,
    subject: `[${opts.orgName}] Review requested: ${opts.dealTitle}`,
    text,
    html: `<p><strong>${opts.orgName}</strong> invited you to review: <strong>${opts.dealTitle}</strong></p>
<p>${opts.message ?? "Please review the document and upload your revision if needed."}</p>
<p><a href="${opts.portalUrl}">Open vendor portal</a></p>`,
  });
}

export async function sendSigningInvite(opts: {
  to: string;
  agreementTitle: string;
  signUrl: string;
  message?: string | null;
}) {
  const text = [
    `You are invited to sign: ${opts.agreementTitle}`,
    "",
    opts.message ?? "",
    "",
    `Sign here: ${opts.signUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  await email().send({
    to: opts.to,
    subject: `Please sign: ${opts.agreementTitle}`,
    text,
    html: `<p>Please sign: <strong>${opts.agreementTitle}</strong></p>
${opts.message ? `<p>${opts.message}</p>` : ""}
<p><a href="${opts.signUrl}">Open signing ceremony</a></p>`,
  });
}

export async function sendRevisionNotice(opts: {
  to: string;
  dealTitle: string;
  summary: string;
  dealUrl: string;
}) {
  await email().send({
    to: opts.to,
    subject: `Revision uploaded: ${opts.dealTitle}`,
    text: [`A new revision was uploaded for "${opts.dealTitle}".`, "", opts.summary, "", `Review: ${opts.dealUrl}`].join("\n"),
    html: `<p>A new revision was uploaded for <strong>${opts.dealTitle}</strong>.</p>
<p>${opts.summary}</p>
<p><a href="${opts.dealUrl}">Review changes</a></p>`,
  });
}
