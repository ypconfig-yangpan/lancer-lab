export interface EventSummary {
  uid: string;
  name: string;
  namespace: string;
  eventType: string;
  reason: string;
  message: string;
  count: number;
  involvedKind: string;
  involvedName: string;
  source: string;
  firstTimestamp: string;
  lastTimestamp: string;
}
