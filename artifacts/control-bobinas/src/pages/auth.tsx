import { type FormEvent, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Boxes, LogIn, ShieldCheck, UserPlus } from "lucide-react";
import {
  getGetBootstrapStatusQueryKey,
  getGetSessionQueryKey,
  useLogin,
  useRegisterFirstUser,
} from "@workspace/api-client-react";
import { inputClass } from "@/components/modal";

type AuthPageProps = {
  setup: boolean;
};

export default function AuthPage({ setup }: AuthPageProps) {
  const queryClient = useQueryClient();
  const login = useLogin();
  const register = useRegisterFirstUser();
  const [formError, setFormError] = useState<string | null>(null);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");

    if (setup) {
      const confirmation = String(form.get("passwordConfirmation") ?? "");
      if (password !== confirmation) {
        setFormError("Las contraseñas no coinciden.");
        return;
      }
      register.mutate({
        data: {
          nombre: String(form.get("nombre") ?? ""),
          email,
          password,
        },
      }, {
        onSuccess: (data) => {
          queryClient.setQueryData(getGetSessionQueryKey(), data);
          queryClient.setQueryData(getGetBootstrapStatusQueryKey(), { needsSetup: false });
        },
        onError: (error) => setFormError(error.message),
      });
      return;
    }

    login.mutate({ data: { email, password } }, {
      onSuccess: (data) => queryClient.setQueryData(getGetSessionQueryKey(), data),
      onError: (error) => setFormError(error.message),
    });
  };

  const pending = login.isPending || register.isPending;
  return (
    <main className="industrial-grid flex min-h-[100dvh] items-center justify-center px-4 py-8">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-2xl border border-border bg-card shadow-xl md:grid-cols-[.9fr_1.1fr]">
        <section className="hidden bg-primary p-10 text-primary-foreground md:flex md:flex-col md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-accent-foreground"><Boxes size={27} strokeWidth={2.4} /></span>
              <div><p className="font-display text-3xl font-semibold uppercase leading-none">Control</p><p className="mt-1 font-data text-[10px] uppercase tracking-[.2em] text-primary-foreground/60">de bobinas</p></div>
            </div>
            <p className="mt-16 max-w-xs font-display text-5xl font-semibold uppercase leading-[.9] tracking-wide">El almacén, bajo control.</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-primary-foreground/65"><ShieldCheck size={17} /> Acceso protegido para el equipo</div>
        </section>

        <section className="p-6 sm:p-10">
          <div className="mb-8 md:hidden"><div className="flex items-center gap-2.5"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Boxes size={22} /></span><span className="font-display text-2xl font-semibold uppercase tracking-wide">Control de bobinas</span></div></div>
          <p className="font-data text-[10px] font-semibold uppercase tracking-[.2em] text-primary">{setup ? "Configuración inicial" : "Acceso al almacén"}</p>
          <h1 className="mt-2 font-display text-4xl font-semibold uppercase leading-none tracking-wide">{setup ? "Crea el administrador" : "Iniciar sesión"}</h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">{setup ? "Este primer usuario tendrá permisos de administrador y podrá dar de alta al resto del equipo como usuarios normales." : "Introduce tus credenciales para continuar con la gestión de bobinas."}</p>

          {formError && <div className="mt-6 flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3 text-sm text-destructive" role="alert" data-testid="error-auth"><AlertCircle size={18} className="mt-0.5 shrink-0" /> <span>{formError}</span></div>}
          <form onSubmit={submit} className="mt-7 space-y-5" data-testid={setup ? "form-first-admin" : "form-login"}>
            {setup && <label className="block space-y-1.5"><span className="text-xs font-semibold uppercase tracking-[.1em] text-muted-foreground">Nombre</span><input name="nombre" required autoComplete="name" className={inputClass} placeholder="Ej. Marta García" data-testid="input-first-admin-name" /></label>}
            <label className="block space-y-1.5"><span className="text-xs font-semibold uppercase tracking-[.1em] text-muted-foreground">Email</span><input name="email" required type="email" autoComplete="email" className={inputClass} placeholder="nombre@empresa.com" data-testid="input-auth-email" /></label>
            <label className="block space-y-1.5"><span className="flex items-baseline justify-between text-xs font-semibold uppercase tracking-[.1em] text-muted-foreground">Contraseña{setup && <span className="font-normal normal-case tracking-normal">mínimo 12 caracteres</span>}</span><input name="password" required type="password" minLength={setup ? 12 : 1} autoComplete={setup ? "new-password" : "current-password"} className={inputClass} data-testid="input-auth-password" /></label>
            {setup && <label className="block space-y-1.5"><span className="text-xs font-semibold uppercase tracking-[.1em] text-muted-foreground">Repetir contraseña</span><input name="passwordConfirmation" required type="password" minLength={12} autoComplete="new-password" className={inputClass} data-testid="input-first-admin-password-confirmation" /></label>}
            <button type="submit" disabled={pending} className="pressable flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60" data-testid="button-auth-submit">{setup ? <UserPlus size={18} /> : <LogIn size={18} />}{pending ? "Procesando…" : setup ? "Crear administrador" : "Entrar"}</button>
          </form>
        </section>
      </div>
    </main>
  );
}
