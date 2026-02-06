import React from "react";

type Props = {
  children: React.ReactNode;
  title?: string;
  onReset?: () => void;
};

type State = {
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
};

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Devtools UI error:", error, info);
    console.error("Component stack:", info.componentStack);
    this.setState({ errorInfo: info });
  }

  handleReset = () => {
    this.setState({ error: null, errorInfo: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
          <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            UI Error
          </div>
          <div className="mt-2 text-lg font-semibold text-destructive">
            {this.props.title ?? "Something went wrong"}
          </div>
          <pre className="mt-4 whitespace-pre-wrap text-xs text-destructive/90">
            {this.state.error.message}
          </pre>
          {this.state.error.stack && (
            <details className="mt-4">
              <summary className="cursor-pointer text-xs font-medium text-destructive">
                Error Stack
              </summary>
              <pre className="mt-2 whitespace-pre-wrap text-xs text-destructive/70">
                {this.state.error.stack}
              </pre>
            </details>
          )}
          {this.state.errorInfo?.componentStack && (
            <details className="mt-4">
              <summary className="cursor-pointer text-xs font-medium text-destructive">
                Component Stack
              </summary>
              <pre className="mt-2 whitespace-pre-wrap text-xs text-destructive/70">
                {this.state.errorInfo.componentStack}
              </pre>
            </details>
          )}
          <button
            onClick={this.handleReset}
            className="mt-6 rounded-xl bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
