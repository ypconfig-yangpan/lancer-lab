import { describe, expect, it } from "vitest";
import { useTabsStore } from "./tabs-store";

function reset() {
  useTabsStore.setState({ openTabs: [], activeTabId: null });
}

const base = {
  id: "p:v1",
  viewId: "v1",
  moduleId: "p",
  title: "One",
};

describe("tabs-store preview/pinned", () => {
  it("preview replaces previous preview and keeps pinned tabs", () => {
    reset();
    const store = useTabsStore.getState();
    store.openWorkspaceTab({ ...base, id: "p:a", title: "A" }, "preview");
    store.openWorkspaceTab(
      { id: "p:pin", viewId: "pin", moduleId: "p", title: "Pinned" },
      "pinned",
    );
    store.openWorkspaceTab({ ...base, id: "p:b", title: "B" }, "preview");

    const tabs = useTabsStore.getState().openTabs;
    expect(tabs.map((t) => t.id)).toEqual(["p:pin", "p:b"]);
    expect(tabs.find((t) => t.id === "p:b")?.pinned).toBe(false);
    expect(useTabsStore.getState().activeTabId).toBe("p:b");
  });

  it("opening existing preview as pinned upgrades it", () => {
    reset();
    useTabsStore.getState().openWorkspaceTab(base, "preview");
    useTabsStore.getState().openWorkspaceTab(base, "pinned");
    const tab = useTabsStore.getState().openTabs.find((t) => t.id === base.id);
    expect(tab?.pinned).toBe(true);
  });

  it("clearTabsForModule removes owned tabs only", () => {
    reset();
    useTabsStore.getState().openWorkspaceTab(base, "pinned");
    useTabsStore.getState().openWorkspaceTab(
      { id: "q:1", viewId: "1", moduleId: "q", title: "Q" },
      "pinned",
    );
    useTabsStore.getState().clearTabsForModule("p");
    expect(useTabsStore.getState().openTabs.map((t) => t.id)).toEqual(["q:1"]);
  });
});
