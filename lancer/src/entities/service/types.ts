export interface ServiceSummary {
  uid: string;
  name: string;
  namespace: string;
  serviceType: string;
  clusterIp: string;
  ports: string;
  createdAt: string;
  /** Spec selector — used to resolve backing pods for logs. */
  selector: Record<string, string>;
}
