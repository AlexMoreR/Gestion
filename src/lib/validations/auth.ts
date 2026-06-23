import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Correo invalido"),
  password: z.string().min(8, "Minimo 8 caracteres"),
});

export const registerSchema = z.object({
  name: z.string().min(2, "Nombre muy corto").max(100, "Nombre muy largo"),
  email: z.string().email("Correo invalido"),
  password: z.string().min(8, "Minimo 8 caracteres"),
  role: z.enum(["ADMIN", "EMPLEADO", "CLIENTE"]),
});

export const profileSchema = z.object({
  name: z.string().min(2, "Nombre muy corto").max(100, "Nombre muy largo"),
  email: z.string().email("Correo invalido"),
  // Acepta una URL externa o una ruta local subida (/uploads/...).
  image: z.union([
    z.string().url("URL invalida"),
    z.string().regex(/^\/uploads\//, "Ruta invalida"),
    z.literal(""),
  ]),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(8, "Contrasena actual invalida"),
    newPassword: z.string().min(8, "Minimo 8 caracteres"),
    confirmPassword: z.string().min(8, "Minimo 8 caracteres"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Las contrasenas no coinciden",
    path: ["confirmPassword"],
  });

export type ActionState = {
  ok: boolean;
  message: string;
  errors?: Record<string, string[]>;
  data?: {
    name?: string;
    email?: string;
    image?: string | null;
  };
};
