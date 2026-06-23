"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Check, ImagePlus, KeyRound, Pencil, ShieldCheck, UserPen, X } from "lucide-react";
import { toast } from "react-toastify";
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
  const { update } = useSession();
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [editingFields, setEditingFields] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);
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
    if (!profileState.ok || !profileState.data) return;

    void update({
      name: profileState.data.name,
      email: profileState.data.email,
      image: profileState.data.image,
    });
  }, [profileState, update]);

  useEffect(() => {
    if (!passwordState.message) return;
    if (passwordState.ok) toast.success(passwordState.message);
    else toast.error(passwordState.message);
  }, [passwordState]);

  useEffect(() => {
    if (!passwordState.ok) return;

    const timeoutId = window.setTimeout(() => {
      setIsPasswordModalOpen(false);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [passwordState.ok]);

  const initials = (defaultName?.trim()?.charAt(0) || email.charAt(0) || "U").toUpperCase();

  return (
    <div>
      <div className="space-y-4">
        <Card className="space-y-4 p-5">
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
            <UserPen className="h-4 w-4 text-slate-500" />
            Informacion personal
          </div>
          <form action={profileAction} className="grid gap-3">
            <div className="flex items-stretch gap-4">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Cambiar foto"
                title="Cambiar foto"
                className="group relative w-28 shrink-0 self-stretch rounded-xl"
              >
                <Avatar className="h-full w-28 rounded-xl border border-[var(--line)]">
                  <AvatarImage src={previewUrl ?? defaultImage} alt={defaultName || email} />
                  <AvatarFallback className="rounded-xl bg-slate-800 text-xl">{initials}</AvatarFallback>
                </Avatar>
                <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100">
                  <ImagePlus className="h-6 w-6" />
                </span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                name="imageFile"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (previewUrl) URL.revokeObjectURL(previewUrl);
                  setPreviewUrl(file ? URL.createObjectURL(file) : null);
                }}
              />
              <div className="flex flex-1 flex-col gap-2">
                <div className="flex items-start gap-1.5">
                  <div className="flex w-fit flex-col">
                    <Input
                      name="name"
                      defaultValue={defaultName}
                      placeholder="Nombre completo"
                      required
                      readOnly={!editingFields}
                      size={Math.max((defaultName || "Nombre completo").length, 8)}
                      className={`h-auto w-auto min-w-0 rounded-md px-2 py-1 text-base font-medium dark:bg-transparent ${
                        editingFields
                          ? "border border-input bg-transparent"
                          : "cursor-default border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                      }`}
                    />
                    <Input
                      type="email"
                      name="email"
                      defaultValue={email}
                      placeholder="correo@empresa.com"
                      required
                      readOnly={!editingFields}
                      size={Math.max((email || "correo@empresa.com").length, 12)}
                      className={`h-auto w-auto min-w-0 rounded-md px-2 py-1 text-sm text-slate-600 dark:bg-transparent ${
                        editingFields
                          ? "border border-input bg-transparent"
                          : "cursor-default border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                      }`}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-slate-500 hover:text-slate-900"
                    onClick={() => setEditingFields((value) => !value)}
                    aria-label={editingFields ? "Listo" : "Editar nombre y correo"}
                    title={editingFields ? "Listo" : "Editar"}
                  >
                    {editingFields ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                  </Button>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <ShieldCheck className="h-4 w-4 text-slate-500" />
                  <span>Rol: {role}</span>
                </div>
              </div>
            </div>
            <input type="hidden" name="existingImage" value={defaultImage} />
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
          <div className="pt-1">
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={() => setIsPasswordModalOpen(true)}
            >
              Cambiar contrasena
            </Button>
          </div>
        </Card>
      </div>

      {isPasswordModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm"
          onClick={() => setIsPasswordModalOpen(false)}
        >
          <Card
            className="w-full max-w-md space-y-4 p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <KeyRound className="h-4 w-4 text-slate-500" />
                  Cambiar contrasena
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  Ingresa tu contrasena actual y define una nueva clave.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={() => setIsPasswordModalOpen(false)}
              >
                <X className="h-4 w-4 text-slate-500" />
              </Button>
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
              <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsPasswordModalOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" className="w-full sm:w-auto" disabled={passwordPending}>
                  {passwordPending ? "Actualizando..." : "Actualizar contrasena"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
