export type AgentStatus =
  | 'planning'
  | 'editing'
  | 'yielding'
  | 'landing'
  | 'landed'
  | 'replaying'
  | 'failed'
  | 'needs-human';

export type ClaimKind = 'declared' | 'actual';

export interface Claim {
  attemptId: string;
  path: string;
  symbol: string | null;
  kind: ClaimKind;
  createdAt: number;
}

export interface Overlap {
  level: 'symbol' | 'file';
  path: string;
  symbol: string | null;
  attemptId: string;
}

export interface RadarParty {
  attemptId: string;
  startedAt: number;
}
