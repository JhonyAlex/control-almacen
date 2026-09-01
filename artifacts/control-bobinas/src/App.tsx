import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { getGetBootstrapStatusQueryKey, getGetSessionQueryKey, useGetBootstrapStatus, useGetSession, type User } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Shell } from '@/components/shell';
import { Toaster } from '@/components/ui/toaster';
import AuthPage from '@/pages/auth';
import { TooltipProvider } from '@/components/ui/tooltip';
import Finalized from '@/pages/finalized';
import Home from '@/pages/home';
import Material from '@/pages/material';
import NotFound from '@/pages/not-found';
import Production from '@/pages/production';
import Users from '@/pages/users';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Router() {
  const session = useGetSession({ query: { queryKey: getGetSessionQueryKey(), retry: false } });
  const bootstrap = useGetBootstrapStatus({
    query: {
      enabled: !session.isPending && !session.isError && session.data?.authenticated !== true,
      queryKey: getGetBootstrapStatusQueryKey(),
      retry: false,
    },
  });

  if (session.isPending || (!session.data && !session.isError)) return <AuthLoading />;
  if (session.isError) return <AuthUnavailable onRetry={() => session.refetch()} />;
  if (!session.data.authenticated) {
    if (bootstrap.isPending || !bootstrap.data) return <AuthLoading />;
    if (bootstrap.isError) return <AuthUnavailable onRetry={() => bootstrap.refetch()} />;
    return <AuthPage setup={bootstrap.data.needsSetup} />;
  }

  const user = session.data.user;
  if (!user) return <AuthUnavailable onRetry={() => session.refetch()} />;
  return <AuthenticatedRouter user={user} />;
}

function AuthLoading() {
  return <main className="industrial-grid flex min-h-[100dvh] items-center justify-center"><div className="font-data text-xs uppercase tracking-[.18em] text-muted-foreground">Comprobando acceso…</div></main>;
}

function AuthUnavailable({ onRetry }: { onRetry: () => void }) {
  return <main className="industrial-grid flex min-h-[100dvh] items-center justify-center px-4"><div className="w-full max-w-md rounded-xl border border-destructive/30 bg-card p-7"><div className="flex items-center gap-3 text-destructive"><AlertCircle size={24} /><h1 className="font-display text-3xl font-semibold uppercase">Servicio no disponible</h1></div><p className="mt-4 text-sm text-muted-foreground">No se pudo comprobar la sesión. Revisa la conexión con el servidor.</p><button type="button" onClick={onRetry} className="pressable mt-6 flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"><RefreshCw size={16} /> Reintentar</button></div></main>;
}

function AuthenticatedRouter({ user }: { user: User }) {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Shell user={user}>
        <Switch>
          <Route path="/">{() => <Home canManage={user.role === 'ADMIN'} />}</Route>
          <Route path="/material" component={Material} />
          <Route path="/produccion">{() => <Production canManage={user.role === 'ADMIN'} />}</Route>
          <Route path="/finalizadas" component={Finalized} />
          <Route path="/usuarios">{() => user.role === 'ADMIN' ? <Users /> : <NotFound />}</Route>
          <Route component={NotFound} />
        </Switch>
      </Shell>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
