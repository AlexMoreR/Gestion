"use client";

import { useActionState, useEffect } from "react";
import { KeyRound, Mail, ShieldCheck, UserPen } from "lucide-react";
import { toast } from "sonner";
import { changePasswordAction, updateProfileAction } from "@/app/actions/auth-actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ActionState } from "@/lib/validations/auth";

const initialState: ActionState = { ok: false, message: "" };

type ProfileFormProps = {
  defaultName: string;
  defaultImage: string;
  email: string;
  role: string;
};

export function ProfileForm({
  defaultName,
  defaultImage,
  email,
  role,
}: ProfileFormProps) {
  const [profileState, profileAction, profilePending] = useActionState(
    updateProfileAction,
    initialState,
  );
  const [passwordState, passwordAction, passwordPending] = useActionState(
    changePasswordAction,
    initialState,
  );

  useEffect(() => {
    if (!profileState.message) return;
    if (profileState.ok) toast.success(profileState.message);
    else toast.error(profileState.message);
  }, [profileState]);

  useEffect(() => {
    if (!passwordState.message) return;
    if (passwordState.ok) toast.success(passwordState.message);
    else toast.error(passwordState.message);
  }, [passwordState]);

  const initials = (defaultName?.trim()?.charAt(0) || email.charAt(0) || "U").toUpperCase();

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <Card className="space-y-5 p-5">
        <div className="rounded-xl border border-[var(--line)] bg-slate-50/80 p-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-14 w-14 rounded-xl border border-[var(--line)]">
              <AvatarImage src={defaultImage} alt={defaultName || email} />
              <AvatarFallback className="rounded-xl bg-slate-800 text-sm">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-slate-900">
                {defaultName || "Usuario"}
              </p>
              <p className="truncate text-xs text-slate-600">{email}</p>
            </div>
          </div>
        </div>

        <div className="space-y-3 border-t border-[var(--line)] pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cuenta</p>
          <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <Mail className="h-4 w-4 text-slate-500" />
            <span className="truncate">{email}</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <ShieldCheck className="h-4 w-4 text-slate-500" />
            <span>Rol: {role}</span>
          </div>
        </div>
      </Card>

      <div className="space-y-4">
        <Card className="space-y-4 p-5">
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
            <UserPen className="h-4 w-4 text-slate-500" />
            Informacion personal
          </div>
          <form action={profileAction} className="grid gap-3">
            <Input name="name" defaultValue={defaultName} placeholder="Nombre completo" required />
            <Input
              name="image"
              defaultValue={defaultImage}
              placeholder="URL de foto de perfil"
            />
            <div className="pt-1">
              <Button type="submit" className="w-full sm:w-auto" disabled={profilePending}>
                {profilePending ? "Guardando..." : "Guardar perfil"}
              </Button>
            </div>
          </form>
        </Card>

        <Card className="space-y-4 p-5">
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
            <KeyRound className="h-4 w-4 text-slate-500" />
            Seguridad
          </div>
          <form action={passwordAction} className="grid gap-3">
            <Input
              type="password"
              name="currentPassword"
              placeholder="Contrasena actual"
              required
            />
            <Input
              type="password"
              name="newPassword"
              placeholder="Nueva contrasena"
              required
            />
            <Input
              type="password"
              name="confirmPassword"
              placeholder="Confirmar nueva contrasena"
              required
            />
            <div className="pt-1">
              <Button type="submit" className="w-full sm:w-auto" disabled={passwordPending}>
                {passwordPending ? "Actualizando..." : "Actualizar contrasena"}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
