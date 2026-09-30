import { Command } from "cmdk";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useCommands } from "@/shell";
import { useWorkspaceStore } from "@/shared/stores/workspace-store";

export function CommandPalette() {
  const { t } = useTranslation();
  const open = useWorkspaceStore((s) => s.commandPaletteOpen);
  const setOpen = useWorkspaceStore((s) => s.setCommandPaletteOpen);
  const setActiveActivityId = useWorkspaceStore((s) => s.setActiveActivityId);
  const moduleCommands = useCommands();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[15vh]">
      <Command
        className="w-[520px] overflow-hidden rounded-md border border-panel-border bg-panel shadow-xl"
        label="Command Palette"
      >
        <Command.Input
          className="h-10 w-full border-b border-panel-border bg-transparent px-3 text-sm outline-none"
          placeholder={t("command.placeholder")}
        />
        <Command.List className="max-h-72 overflow-auto p-1 text-sm">
          <Command.Empty className="px-3 py-2 text-xs text-muted-foreground">
            No results
          </Command.Empty>
          <Command.Item
            className="cursor-pointer rounded px-2 py-1.5 aria-selected:bg-accent"
            onSelect={() => {
              setActiveActivityId("settings");
              setOpen(false);
            }}
          >
            {t("command.openSettings")}
          </Command.Item>
          {moduleCommands.map((cmd) => (
            <Command.Item
              key={cmd.id}
              className="cursor-pointer rounded px-2 py-1.5 aria-selected:bg-accent"
              onSelect={() => {
                void (async () => {
                  // Modules are activated at start — execute directly.
                  await Promise.resolve(cmd.execute());
                  setOpen(false);
                })();
              }}
            >
              {cmd.title}
            </Command.Item>
          ))}
        </Command.List>
      </Command>
      <button
        type="button"
        className="absolute inset-0 -z-10 cursor-default"
        aria-label="Close"
        onClick={() => setOpen(false)}
      />
    </div>
  );
}
