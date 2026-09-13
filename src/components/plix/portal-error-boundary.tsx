import { Component, type ErrorInfo, type ReactNode } from "react";
import { RotateCw, TriangleAlert } from "lucide-react";

type Props = { children: ReactNode };
type State = { hasError: boolean };

/**
 * Wraps the whole /portal route tree. Without this, an unexpected rendering
 * error anywhere under it (a bad property lookup, a malformed booking row,
 * etc.) unmounts the tree entirely — React shows a blank screen, and in this
 * app that blank screen sits behind the same route guard dashboard.tsx uses
 * for "not authenticated", which reads as the app randomly bouncing back to
 * /portal/login even though the session was never actually lost. A caught
 * render error should look like an error, not a silent logout.
 */
export class PortalErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[PortalErrorBoundary] caught:", error, info.componentStack);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-[#f7f8fc] px-6 text-center text-slate-900">
          <TriangleAlert className="size-10 text-bronze" aria-hidden />
          <div>
            <h1 className="text-lg font-semibold">Something went wrong</h1>
            <p className="mt-1 text-sm text-slate-500">The partner app hit an unexpected error. Reloading usually fixes it.</p>
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 rounded-full bg-bronze px-6 py-3 text-sm font-semibold text-bronze-foreground"
          >
            <RotateCw className="size-4" aria-hidden />
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
