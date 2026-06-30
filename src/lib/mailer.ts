import type { Role } from "@prisma/client";

type AccountEmailParams = {
  to: string;
  name: string;
  role: Role;
};

type VerificationEmailParams = {
  to: string;
  name: string;
  verificationUrl: string;
};

type InvitationEmailParams = {
  to: string;
  name: string;
  invitationUrl: string;
};

type PasswordResetEmailParams = {
  to: string;
  name: string;
  resetUrl: string;
};

type MonthClosureEmailParams = {
  to: string;
  periodLabel: string;
  reportUrl: string;
};

function getSmtpConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? "587");
  const secure = process.env.SMTP_SECURE === "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;

  if (!host || !user || !pass || !from || Number.isNaN(port)) {
    return null;
  }

  return { host, port, secure, user, pass, from };
}

export async function sendAccountCreatedEmail(params: AccountEmailParams): Promise<void> {
  const config = getSmtpConfig();
  if (!config) {
    return;
  }

  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  const displayName = params.name?.trim() || "usuario";

  await transporter.sendMail({
    from: config.from,
    to: params.to,
    subject: "Tu cuenta ha sido creada",
    text: `Hola ${displayName}, tu cuenta fue creada con rol ${params.role}. Ya puedes iniciar sesion en la plataforma.`,
    html: `<p>Hola <strong>${displayName}</strong>,</p><p>Tu cuenta fue creada con rol <strong>${params.role}</strong>.</p><p>Ya puedes iniciar sesion en la plataforma.</p>`,
  });
}

export async function sendInvitationEmail(params: InvitationEmailParams): Promise<void> {
  const config = getSmtpConfig();
  if (!config) {
    throw new Error("SMTP no configurado");
  }

  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  const displayName = params.name?.trim() || "usuario";

  await transporter.sendMail({
    from: config.from,
    to: params.to,
    subject: "Invitacion para activar tu cuenta",
    text: `Hola ${displayName}, fuiste invitado a la plataforma. Crea tu contrasena para activar tu cuenta: ${params.invitationUrl} (el enlace expira en 7 dias).`,
    html: `<p>Hola <strong>${displayName}</strong>,</p><p>Fuiste invitado a la plataforma. Crea tu contrasena para activar tu cuenta:</p><p><a href="${params.invitationUrl}">${params.invitationUrl}</a></p><p>El enlace expira en 7 dias.</p>`,
  });
}

export async function sendPasswordResetEmail(params: PasswordResetEmailParams): Promise<void> {
  const config = getSmtpConfig();
  if (!config) {
    throw new Error("SMTP no configurado");
  }

  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  const displayName = params.name?.trim() || "usuario";

  await transporter.sendMail({
    from: config.from,
    to: params.to,
    subject: "Restablece tu contrasena",
    text: `Hola ${displayName}, recibimos una solicitud para restablecer tu contrasena. Crea una nueva aqui: ${params.resetUrl} (el enlace expira en 1 hora). Si no fuiste tu, ignora este correo.`,
    html: `<p>Hola <strong>${displayName}</strong>,</p><p>Recibimos una solicitud para restablecer tu contrasena. Crea una nueva en el siguiente enlace:</p><p><a href="${params.resetUrl}">${params.resetUrl}</a></p><p>El enlace expira en 1 hora. Si no fuiste tu, ignora este correo.</p>`,
  });
}

export async function sendMonthClosureEmail(params: MonthClosureEmailParams): Promise<void> {
  const config = getSmtpConfig();
  if (!config) {
    throw new Error("SMTP no configurado");
  }

  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  await transporter.sendMail({
    from: config.from,
    to: params.to,
    subject: `Informe de cierre de mes - ${params.periodLabel}`,
    text: `Se generó el informe de cierre de mes de ${params.periodLabel}. Puedes verlo en: ${params.reportUrl} (requiere iniciar sesión).`,
    html: `<p>Se generó el <strong>informe de cierre de mes</strong> de <strong>${params.periodLabel}</strong>.</p><p><a href="${params.reportUrl}">Ver el informe</a></p><p style="color:#64748b;font-size:12px">El enlace requiere iniciar sesión en la plataforma.</p>`,
  });
}

export async function sendEmailVerificationEmail(params: VerificationEmailParams): Promise<void> {
  const config = getSmtpConfig();
  if (!config) {
    throw new Error("SMTP no configurado");
  }

  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  const displayName = params.name?.trim() || "usuario";

  await transporter.sendMail({
    from: config.from,
    to: params.to,
    subject: "Confirma tu registro",
    text: `Hola ${displayName}, confirma tu cuenta en este enlace: ${params.verificationUrl}`,
    html: `<p>Hola <strong>${displayName}</strong>,</p><p>Para activar tu cuenta, confirma tu registro en el siguiente enlace:</p><p><a href="${params.verificationUrl}">${params.verificationUrl}</a></p>`,
  });
}
