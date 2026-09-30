import { createContext, type ReactNode, useContext } from "react";
import type { ShellFacade } from "@/app/facades/shell-facade";

const ShellFacadeContext = createContext<ShellFacade | null>(null);

export function ShellFacadeProvider({
  facade,
  children,
}: {
  facade: ShellFacade;
  children: ReactNode;
}) {
  return <ShellFacadeContext.Provider value={facade}>{children}</ShellFacadeContext.Provider>;
}

export function useShellFacade(): ShellFacade {
  const facade = useContext(ShellFacadeContext);
  if (!facade) {
    throw new Error("useShellFacade must be used within ShellFacadeProvider");
  }
  return facade;
}
