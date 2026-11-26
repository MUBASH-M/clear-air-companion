import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = { children: ReactNode };
type State = { hasError: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Error captured by boundary; avoid noisy console stacks in production UI
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 text-center">
          <div className="rounded-xl border bg-card p-6 shadow-sm" role="alert">
            <AlertTriangle className="mx-auto h-8 w-8 text-destructive" aria-hidden />
            <h1 className="mt-3 text-lg font-semibold">Something went wrong</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              The page ran into an unexpected error. Reload to restore Clear Air Companion.
            </p>
            <Button
              size="sm"
              className="mt-4"
              onClick={() => {
                this.setState({ hasError: false });
                window.location.reload();
              }}
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              Reload page
            </Button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}
