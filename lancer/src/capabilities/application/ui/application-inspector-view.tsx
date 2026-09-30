import {
  InspectorSection,
  PropertyList,
  StatusBadge,
  Badge,
} from "@lancer/ui";
import { useReportInspectorSelection } from "@/shell/react/use-report-inspector-selection";
import { useApplicationWorkspaceStore } from "../application-workspace-store";
import { APPLICATION_CATALOG } from "../mock/mock-data";

/** Experience Inspector — catalog app detail (no Provider import). */
export function ApplicationInspectorView() {
  const selectedAppId = useApplicationWorkspaceStore((s) => s.selectedAppId);
  const app =
    APPLICATION_CATALOG.find((a) => a.id === selectedAppId) ?? APPLICATION_CATALOG[0] ?? null;
  useReportInspectorSelection("application", app !== null);

  if (!app) {
    return (
      <div className="flex h-full items-center justify-center px-3 text-[13px] text-muted-foreground">
        Select an application
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <InspectorSection title="General">
        <PropertyList
          items={[
            { label: "Name", value: app.name },
            { label: "Environment", value: app.env },
            { label: "Owner", value: app.owner },
            {
              label: "Repository",
              value: <span className="font-mono text-[12px]">{app.repository}</span>,
            },
            { label: "Version", value: app.version },
            {
              label: "Status",
              value: (
                <StatusBadge
                  tone={app.status === "Healthy" ? "success" : "warning"}
                  label={app.status}
                />
              ),
            },
          ]}
        />
      </InspectorSection>
      <InspectorSection title="Tags">
        <div className="flex flex-wrap gap-1.5">
          {app.tags.map((tag) => (
            <Badge key={tag} tone="accent">
              {tag}
            </Badge>
          ))}
        </div>
      </InspectorSection>
      <InspectorSection title="Links">
        <ul className="space-y-1 text-[13px] text-muted-foreground">
          <li>Runbook (mock)</li>
          <li>Dashboards (mock)</li>
          <li>Alerts (mock)</li>
        </ul>
      </InspectorSection>
    </div>
  );
}
