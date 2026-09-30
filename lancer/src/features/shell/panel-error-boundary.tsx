import { Component, type ErrorInfo, type ReactNode } from "react";
import { logger } from "@/shared/logger";

interface PanelErrorBoundaryProps {
  name: string;
  fallback: string;
  children: ReactNode;
}

interface PanelErrorBoundaryState {
  errorMessage: string | undefined;
}

export class PanelErrorBoundary extends Component<
  PanelErrorBoundaryProps,
  PanelErrorBoundaryState
> {
  override state: PanelErrorBoundaryState = { errorMessage: undefined };

  static getDerivedStateFromError(error: Error): PanelErrorBoundaryState {
    return { errorMessage: error.message };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error("panel crashed", {
      panel: this.props.name,
      message: error.message,
      componentStack: info.componentStack ?? "",
    });
  }

  override render(): ReactNode {
    if (this.state.errorMessage !== undefined) {
      return (
        <div className="flex h-full items-center justify-center p-4 text-sm text-destructive">
          {this.props.fallback}
        </div>
      );
    }
    return this.props.children;
  }
}
