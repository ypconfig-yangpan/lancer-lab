export interface NativeSshSessionSummary {
  id: string;
  name: string;
  user: string;
  status: string;
  lastSeen?: string;
}

export interface NativeSshApi {
  listSessions(): Promise<NativeSshSessionSummary[]>;
}
