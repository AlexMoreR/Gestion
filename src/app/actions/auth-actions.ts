"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { z } from "zod";
import { auth, signOut } from "@/auth";
import {
  adminModuleDefinitions,
  type AdminModuleKey,
  getStoredRoleModuleAccessMap,
  setStoredRoleModuleAccessMap,
} from "@/lib/admin-module-access";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createEmailVerificationToken } from "@/lib/email-verification";
import { createInvitationToken, verifyInvitationToken } from "@/lib/invitation";
import { createPasswordResetToken, verifyPasswordResetToken } from "@/lib/password-reset";
import {
  sendEmailVerificationEmail,
  sendInvitationEmail,
  sendPasswordResetEmail,
} from "@/lib/mailer";
import { prisma } from "@/lib/prisma";
import {
  ActionState,
  changePasswordSchema,
  loginSchema,
  profileSchema,
  registerSchema,
} from "@/lib/validations/auth";

const roleRedirect: Record<Role, string> = {
  ADMIN: "/admin",
  EMPLEADO: "/empleado",
  CLIENTE: "/cliente",
};

const defaultState: ActionState = { ok: false, message: "" };

const adminInviteUserSchema = z.object({
  name: z.string().trim().min(2, "Nombre invalido").max(120, "Nombre demasiado largo"),
  email: z.string().trim().email("Correo invalido"),
  // Solo equipo del sistema; los clientes se gestionan en el modulo Clientes.
  role: z.enum([Role.ADMIN, Role.EMPLEADO]),
});

const activateAccountSchema = z
  .object({
    token: z.string().trim().min(1, "Token invalido"),
    password: z.string().min(8, "Minimo 8 caracteres").max(100, "Contrasena demasiado larga"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contrasenas no coinciden",
    path: ["confirmPassword"],
  });

const requestPasswordResetSchema = z.object({
  email: z.string().trim().email("Correo invalido"),
});

const resetPasswordSchema = z
  .object({
    token: z.string().trim().min(1, "Token invalido"),
    password: z.string().min(8, "Minimo 8 caracteres").max(100, "Contrasena demasiado larga"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contrasenas no coinciden",
    path: ["confirmPassword"],
  });

async function requireAdminSession(): Promise<void> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    redirect("/unauthorized");
  }
}

const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

// Guarda la foto de perfil en local (public/uploads/avatars) y devuelve su ruta.
async function saveProfileImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Solo se permiten archivos de imagen");
  }
  if (file.size > PROFILE_IMAGE_MAX_BYTES) {
    throw new Error("La imagen debe pesar maximo 5MB");
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads", "avatars");
  await mkdir(uploadDir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = path.extname(file.name)?.toLowerCase() || ".jpg";
  const safeExt = ext.length <= 8 ? ext : ".jpg";
  const fileName = `${Date.now()}-${randomUUID()}${safeExt}`;
  await writeFile(path.join(uploadDir, fileName), buffer);

  return `/uploads/avatars/${fileName}`;
}

export async function loginAction(formData: FormData): Promise<ActionState & { redirectTo?: string }> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Datos invalidos",
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return { ok: false, message: "Credenciales invalidas" };
  }

  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    return { ok: false, message: "Credenciales invalidas" };
  }

  if (user.role === "CLIENTE" && !user.emailVerified) {
    return { ok: false, message: "Debes confirmar tu correo antes de iniciar sesion" };
  }

  return { ok: true, message: "Sesion iniciada", redirectTo: roleRedirect[user.role] };
}

export async function registerAction(
  prevState: ActionState = defaultState,
  formData: FormData,
): Promise<ActionState> {
  void prevState;
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: "CLIENTE",
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Datos invalidos",
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  const { name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { ok: false, message: "El correo ya existe" };
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const createdUser = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      role: "CLIENTE",
    },
    select: { id: true },
  });

  try {
    const baseUrl = (
      process.env.AUTH_URL ||
      process.env.NEXTAUTH_URL ||
      process.env.APP_URL ||
      ""
    ).replace(/\/+$/, "");
    if (!baseUrl) {
      await prisma.user.delete({ where: { id: createdUser.id } }).catch(() => null);
      return { ok: false, message: "Falta configurar AUTH_URL para enviar el enlace de verificacion" };
    }
    const token = createEmailVerificationToken(createdUser.id, email);
    const verificationUrl = `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`;

    await sendEmailVerificationEmail({
      to: email,
      name,
      verificationUrl,
    });
  } catch (error) {
    await prisma.user.delete({ where: { id: createdUser.id } }).catch(() => null);
    console.error("No se pudo enviar el correo de verificacion:", error);
    return { ok: false, message: "No se pudo enviar el correo de verificacion" };
  }

  return { ok: true, message: "Registro creado. Revisa tu correo y confirma tu cuenta para poder iniciar sesion" };
}

export async function updateProfileAction(
  prevState: ActionState = defaultState,
  formData: FormData,
): Promise<ActionState> {
  void prevState;
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, message: "No autorizado" };
  }

  // Imagen: si subieron un archivo nuevo se guarda en local; si no, se conserva la actual.
  const uploadedFile = formData.get("imageFile");
  const existingImage =
    typeof formData.get("existingImage") === "string" ? (formData.get("existingImage") as string) : "";
  let imagePath = existingImage;
  if (uploadedFile instanceof File && uploadedFile.size > 0) {
    try {
      imagePath = await saveProfileImage(uploadedFile);
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Imagen invalida" };
    }
  }

  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    image: imagePath,
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Datos invalidos",
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  const emailInUse = await prisma.user.findFirst({
    where: {
      email: parsed.data.email,
      NOT: { id: session.user.id },
    },
    select: { id: true },
  });

  if (emailInUse) {
    return { ok: false, message: "El correo ya existe" };
  }

  const updatedUser = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      image: parsed.data.image || null,
    },
    select: {
      name: true,
      email: true,
      image: true,
    },
  });

  revalidatePath("/profile");

  return {
    ok: true,
    message: "Perfil actualizado",
    data: {
      name: updatedUser.name ?? "",
      email: updatedUser.email,
      image: updatedUser.image,
    },
  };
}

export async function changePasswordAction(
  prevState: ActionState = defaultState,
  formData: FormData,
): Promise<ActionState> {
  void prevState;
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, message: "No autorizado" };
  }

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Datos invalidos",
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  const { currentPassword, newPassword } = parsed.data;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { password: true },
  });

  if (!user) {
    return { ok: false, message: "Usuario no encontrado" };
  }

  const isCurrentValid = await bcrypt.compare(currentPassword, user.password);
  if (!isCurrentValid) {
    return { ok: false, message: "La contrasena actual es incorrecta" };
  }

  const isSamePassword = await bcrypt.compare(newPassword, user.password);
  if (isSamePassword) {
    return { ok: false, message: "La nueva contrasena debe ser diferente" };
  }

  const hashedPassword = await bcrypt.hash(newPassword, 12);

  await prisma.user.update({
    where: { id: session.user.id },
    data: { password: hashedPassword },
  });

  return { ok: true, message: "Contrasena actualizada" };
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}

export async function adminCreateUserAction(formData: FormData): Promise<void> {
  await requireAdminSession();

  const parsed = adminInviteUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    redirect("/admin/configuracion/usuarios?error=Datos+invalidos");
  }

  const { name, email, role } = parsed.data;

  const baseUrl = (
    process.env.AUTH_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.APP_URL ||
    ""
  ).replace(/\/+$/, "");
  if (!baseUrl) {
    redirect("/admin/configuracion/usuarios?error=Falta+configurar+AUTH_URL+para+enviar+la+invitacion");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    redirect("/admin/configuracion/usuarios?error=El+correo+ya+existe");
  }

  // Contrasena temporal inutilizable: el usuario define la suya al activar por el enlace.
  const placeholderPassword = await bcrypt.hash(randomUUID(), 12);

  const createdUser = await prisma.user.create({
    data: {
      name,
      email,
      password: placeholderPassword,
      role,
      emailVerified: null,
    },
    select: { id: true },
  });

  let inviteSent = true;
  try {
    const token = createInvitationToken(createdUser.id, email);
    const invitationUrl = `${baseUrl}/activar?token=${encodeURIComponent(token)}`;
    await sendInvitationEmail({ to: email, name, invitationUrl });
  } catch (error) {
    console.error("No se pudo enviar la invitacion:", error);
    inviteSent = false;
  }

  revalidatePath("/admin/configuracion");
  revalidatePath("/admin/configuracion/usuarios");
  revalidatePath("/admin/configuracion/permisos");
  redirect(
    inviteSent
      ? "/admin/configuracion/usuarios?ok=Invitacion+enviada"
      : "/admin/configuracion/usuarios?error=Usuario+creado+pero+no+se+pudo+enviar+la+invitacion+(revisa+SMTP)",
  );
}

export async function activateAccountAction(formData: FormData): Promise<void> {
  const parsed = activateAccountSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    const token = typeof formData.get("token") === "string" ? (formData.get("token") as string) : "";
    const message = parsed.error.issues[0]?.message ?? "Datos invalidos";
    redirect(`/activar?token=${encodeURIComponent(token)}&error=${encodeURIComponent(message)}`);
  }

  const { token, password } = parsed.data;
  const payload = verifyInvitationToken(token);
  if (!payload) {
    redirect("/login?error=El+enlace+de+invitacion+es+invalido+o+expiro");
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, email: true, emailVerified: true },
  });

  if (!user || user.email !== payload.email) {
    redirect("/login?error=No+se+pudo+activar+la+cuenta");
  }

  // El enlace es de un solo uso: si la cuenta ya fue activada, no se permite de nuevo.
  if (user.emailVerified) {
    redirect("/login?error=La+invitacion+ya+fue+usada");
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashedPassword, emailVerified: new Date() },
  });

  redirect("/login?ok=Cuenta+activada.+Ya+puedes+iniciar+sesion");
}

// Mensaje generico para no revelar si el correo existe (evita enumeracion de cuentas).
const RESET_REQUEST_DONE =
  "Si el correo esta registrado, te enviamos un enlace para restablecer la contrasena.";

export async function requestPasswordResetAction(formData: FormData): Promise<void> {
  const parsed = requestPasswordResetSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    redirect("/recuperar?error=Correo+invalido");
  }

  const { email } = parsed.data;
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true },
  });

  if (user) {
    const baseUrl = (
      process.env.AUTH_URL ||
      process.env.NEXTAUTH_URL ||
      process.env.APP_URL ||
      ""
    ).replace(/\/+$/, "");

    if (!baseUrl) {
      redirect("/recuperar?error=Falta+configurar+AUTH_URL+para+enviar+el+correo");
    }

    try {
      const token = createPasswordResetToken(user.id, user.email);
      const resetUrl = `${baseUrl}/restablecer?token=${encodeURIComponent(token)}`;
      await sendPasswordResetEmail({
        to: user.email,
        name: user.name ?? "",
        resetUrl,
      });
    } catch (error) {
      console.error("No se pudo enviar el correo de recuperacion:", error);
      redirect("/recuperar?error=No+se+pudo+enviar+el+correo.+Intenta+mas+tarde");
    }
  }

  redirect(`/recuperar?ok=${encodeURIComponent(RESET_REQUEST_DONE)}`);
}

export async function resetPasswordAction(formData: FormData): Promise<void> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    const token = typeof formData.get("token") === "string" ? (formData.get("token") as string) : "";
    const message = parsed.error.issues[0]?.message ?? "Datos invalidos";
    redirect(`/restablecer?token=${encodeURIComponent(token)}&error=${encodeURIComponent(message)}`);
  }

  const { token, password } = parsed.data;
  const payload = verifyPasswordResetToken(token);
  if (!payload) {
    redirect("/login?error=El+enlace+de+recuperacion+es+invalido+o+expiro");
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, email: true },
  });

  if (!user || user.email !== payload.email) {
    redirect("/login?error=No+se+pudo+restablecer+la+contrasena");
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashedPassword },
  });

  redirect("/login?ok=Contrasena+actualizada.+Ya+puedes+iniciar+sesion");
}

const updateRoleSchema = z.object({
  userId: z.string().min(1),
  role: z.nativeEnum(Role),
});

export async function adminUpdateUserRoleAction(formData: FormData): Promise<void> {
  await requireAdminSession();

  const parsed = updateRoleSchema.safeParse({
    userId: formData.get("userId"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    redirect("/admin/configuracion/usuarios?error=Datos+invalidos");
  }

  const { userId, role } = parsed.data;
  const targetUser = await prisma.user.findUnique({ where: { id: userId } });

  if (!targetUser) {
    redirect("/admin/configuracion/usuarios?error=Usuario+no+encontrado");
  }

  if (targetUser.role === "ADMIN" && role !== "ADMIN") {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1) {
      redirect("/admin/configuracion/usuarios?error=Debe+existir+al+menos+un+admin");
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { role },
  });

  revalidatePath("/admin/configuracion");
  revalidatePath("/admin/configuracion/usuarios");
  revalidatePath("/admin/configuracion/permisos");
  redirect("/admin/configuracion/usuarios?ok=Rol+actualizado");
}

export async function adminUpdateUserModuleAccessAction(formData: FormData): Promise<void> {
  await requireAdminSession();

  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    redirect("/admin/configuracion/permisos?error=No+autorizado");
  }

  const role = String(formData.get("role") ?? "").trim() as Role;
  if (!["ADMIN", "EMPLEADO", "CLIENTE"].includes(role)) {
    redirect("/admin/configuracion/permisos?error=Rol+invalido");
  }

  const validKeys = new Set<AdminModuleKey>(adminModuleDefinitions.map((item) => item.key));
  const selectedModules = formData
    .getAll("modules")
    .map((item) => String(item))
    .filter((item): item is AdminModuleKey => validKeys.has(item as AdminModuleKey));

  const normalizedModules = new Set<AdminModuleKey>(selectedModules);

  if (role === "ADMIN") {
    normalizedModules.add("config_permissions");
  }

  const currentMap = await getStoredRoleModuleAccessMap();
  currentMap[role] = Array.from(normalizedModules);
  await setStoredRoleModuleAccessMap(currentMap);

  revalidatePath("/admin");
  revalidatePath("/admin/configuracion");
  revalidatePath("/admin/configuracion/permisos");
  revalidatePath("/admin/configuracion/usuarios");
  revalidatePath("/admin/configuracion/negocio");
  revalidatePath("/admin/productos");
  revalidatePath("/admin/categorias");
  revalidatePath("/admin/proveedores");
  revalidatePath("/admin/cotizaciones");
  revalidatePath("/admin/ventas");
  redirect("/admin/configuracion/permisos?ok=Permisos+actualizados");
}
