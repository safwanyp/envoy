/** Placeholder types for Coordinator; expand with Claim / Agent / Landing on Day 2. */

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
