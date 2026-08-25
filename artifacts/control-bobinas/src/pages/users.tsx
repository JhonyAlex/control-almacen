import { type FormEvent, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, ShieldCheck, UserPlus, UserRoundCheck, UserRoundX } from "lucide-react";
import {
  getListUsersQueryKey,
  useCreateUser,
  useListUsers,
  useResetUserPassword,
  useSetUserStatus,
  type User,
} from "@workspace/api-client-react";
import { Field, inputClass, Modal } from "@/components/modal";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function Users() {
  const queryClient = useQueryClient();
  const usersQuery = useListUsers();
  const createUser = useCreateUser();
  const setStatus = useSetUserStatus();
  const resetPassword = useResetUserPassword();
  const [createOpen, setCreateOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
  const closeModals = () => {
    setCreateOpen(false);
    setResetTarget(null);
    setFormError(null);
  };

  const onCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("passwordConfirmation") ?? "")) {
      setFormError("Las contraseñas no coinciden.");
      return;
    }
    createUser.mutate({ data: { nombre: String(form.get("nombre") ?? ""), email: String(form.get("email") ?? ""), password } }, {
      onSuccess: () => { void refresh(); closeModals(); setNotice("Usuario creado correctamente."); },
      onError: (error) => setFormError(errorMessage(error, "No se pudo crear el usuario.")),
    });
  };

  const onResetPassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resetTarget) return;
    setFormError(null);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("passwordConfirmation") ?? "")) {
      setFormError("Las contraseñas no coinciden.");
      return;
    }
    resetPassword.mutate({ id: resetTarget.id, data: { password } }, {
      onSuccess: () => { closeModals(); setNotice(`Contraseña actualizada para ${resetTarget.nombre}.`); },
      onError: (error) => setFormError(errorMessage(error, "No se pudo actualizar la contraseña.")),
    });
  };

  const toggleStatus = (user: User) => {
    setStatus.mutate({ id: user.id, data: { isActive: !user.isActive } }, {
      onSuccess: () => { void refresh(); setNotice(user.isActive ? `${user.nombre} ha quedado desactivado.` : `${user.nombre} ha quedado activado.`); },
    });
  };

  const users = usersQuery.data ?? [];
  return (
    <div className="industrial-grid min-h-[calc(100dvh-72px)]">
      <div className="mx-auto max-w-[1180px] px-4 py-7 sm:px-7 lg:px-10 lg:py-10">
        <div className="load-in mb-8 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div><p className="font-data text-[10px] font-semibold uppercase tracking-[.2em] text-primary">Administración / equipo</p><h1 className="mt-2 font-display text-[clamp(2.7rem,6vw,4.7rem)] font-semibold uppercase leading-[.88] tracking-wide">Gestión de usuarios</h1><p className="mt-3 max-w-xl text-sm text-muted-foreground">El primer usuario es administrador. Desde aquí puedes dar de alta usuarios normales, activar o desactivar accesos y renovar contraseñas.</p></div>
          <button type="button" onClick={() => { setFormError(null); setCreateOpen(true); }} className="pressable flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground hover:brightness-110" data-testid="button-create-user"><UserPlus size={18} /> Nuevo usuario</button>
        </div>
        {notice && <div className="mb-6 flex items-center gap-3 rounded-lg border border-[#a9c9b1] bg-[#eaf4eb] px-4 py-3 text-sm font-medium text-[#27613d]" role="status" data-testid="status-users-success"><span className="h-2 w-2 rounded-full bg-[#4c9a71]" />{notice}<button type="button" className="ml-auto text-xs uppercase tracking-wider underline" onClick={() => setNotice(null)}>Cerrar</button></div>}
        {usersQuery.isLoading && <div className="space-y-3" aria-label="Cargando usuarios"><div className="h-24 animate-pulse rounded-xl bg-muted" /><div className="h-24 animate-pulse rounded-xl bg-muted" /></div>}
        {usersQuery.isError && !usersQuery.isLoading && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive" role="alert">{errorMessage(usersQuery.error, "No se pudieron cargar los usuarios.")}</div>}
        {!usersQuery.isLoading && !usersQuery.isError && <div className="overflow-hidden rounded-xl border border-border bg-card" data-testid="list-users"><div className="hidden grid-cols-[1.4fr_1.4fr_.7fr_.7fr_180px] gap-4 border-b border-border bg-muted/55 px-5 py-3 font-data text-[10px] font-semibold uppercase tracking-[.13em] text-muted-foreground md:grid"><span>Usuario</span><span>Email</span><span>Rol</span><span>Estado</span><span /></div>{users.map((user) => <UserRow key={user.id} user={user} onToggle={() => toggleStatus(user)} onReset={() => { setFormError(null); setResetTarget(user); }} pending={setStatus.isPending} />)}</div>}
      </div>

      <Modal open={createOpen} onClose={closeModals} onSubmit={onCreate} eyebrow="Alta de equipo" title="Nuevo usuario" submitLabel={createUser.isPending ? "Creando…" : "Crear usuario"} submitDisabled={createUser.isPending}>
        {formError && <p className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert" data-testid="error-create-user">{formError}</p>}
        <div className="space-y-5"><Field label="Nombre"><input name="nombre" required className={inputClass} placeholder="Ej. Luis Martín" data-testid="input-user-name" /></Field><Field label="Email"><input name="email" required type="email" className={inputClass} placeholder="nombre@empresa.com" data-testid="input-user-email" /></Field><Field label="Contraseña" hint="mínimo 12 caracteres"><input name="password" required type="password" minLength={12} className={inputClass} data-testid="input-user-password" /></Field><Field label="Repetir contraseña"><input name="passwordConfirmation" required type="password" minLength={12} className={inputClass} data-testid="input-user-password-confirmation" /></Field></div>
      </Modal>

      <Modal open={!!resetTarget} onClose={closeModals} onSubmit={onResetPassword} eyebrow="Seguridad" title="Renovar contraseña" submitLabel={resetPassword.isPending ? "Guardando…" : "Actualizar contraseña"} submitDisabled={resetPassword.isPending}>
        {formError && <p className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{formError}</p>}
        {resetTarget && <><p className="mb-5 rounded-lg border border-border bg-muted/50 px-3 py-3 text-sm">Nueva contraseña para <strong>{resetTarget.nombre}</strong>.</p><div className="space-y-5"><Field label="Nueva contraseña" hint="mínimo 12 caracteres"><input name="password" required type="password" minLength={12} className={inputClass} autoComplete="new-password" /></Field><Field label="Repetir contraseña"><input name="passwordConfirmation" required type="password" minLength={12} className={inputClass} autoComplete="new-password" /></Field></div></>}
      </Modal>
    </div>
  );
}

function UserRow({ user, onToggle, onReset, pending }: { user: User; onToggle: () => void; onReset: () => void; pending: boolean }) {
  return <div className="grid gap-4 border-b border-border px-4 py-4 last:border-b-0 md:grid-cols-[1.4fr_1.4fr_.7fr_.7fr_180px] md:items-center md:gap-4 md:px-5"><div><p className="flex items-center gap-2 font-semibold">{user.nombre}{user.role === "ADMIN" && <ShieldCheck size={15} className="text-primary" aria-label="Administrador" />}</p><p className="mt-1 text-xs text-muted-foreground md:hidden">{user.email}</p><p className="mt-1 text-xs text-muted-foreground">Alta {new Date(user.creadoEn).toLocaleDateString("es-ES")}</p></div><p className="hidden text-sm text-muted-foreground md:block">{user.email}</p><span className={`w-fit rounded-md px-2 py-1 font-data text-[10px] font-semibold ${user.role === "ADMIN" ? "bg-secondary text-secondary-foreground" : "bg-muted text-foreground"}`}>{user.role === "ADMIN" ? "ADMINISTRADOR" : "USUARIO"}</span><span className={`flex items-center gap-1.5 text-xs font-medium ${user.isActive ? "text-[#3c7d52]" : "text-muted-foreground"}`}><span className={`h-1.5 w-1.5 rounded-full ${user.isActive ? "bg-[#4c9a71]" : "bg-muted-foreground/60"}`} />{user.isActive ? "Activo" : "Inactivo"}</span><div className="flex flex-wrap gap-2"><button type="button" onClick={onReset} className="pressable flex min-h-10 items-center gap-1.5 rounded-lg border border-primary/25 px-3 text-xs font-semibold text-primary hover:bg-muted" data-testid={`button-reset-password-${user.id}`}><KeyRound size={14} /> Contraseña</button>{user.role !== "ADMIN" && <button type="button" onClick={onToggle} disabled={pending} className="pressable flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50" data-testid={`button-toggle-user-${user.id}`}>{user.isActive ? <UserRoundX size={14} /> : <UserRoundCheck size={14} />}{user.isActive ? "Desactivar" : "Activar"}</button>}</div></div>;
}
