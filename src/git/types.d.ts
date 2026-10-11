export interface Intent {
  summary: string;
  rationale: string;
  task: string;
  attempt: string;
  agent: string;
  intent: string;
  claims: string[];
  replayOf: string | null;
  base: string;
}

export interface SourceSymbol {
  name: string;
  startLine: number;
  endLine: number;
}

export interface GitIdentity {
  name: string;
  email: string;
  timestamp: number;
  timezoneOffset: number;
}

export type LandResult =
  | { kind: 'fast-forward'; sha: string }
  | { kind: 'merge'; sha: string }
  | { kind: 'overlay'; sha: string }
  | { kind: 'replay'; reason: string };

export interface ReplayLanded {
  sha: string;
  agent: string;
  intent: string;
  paths: string[];
}

export interface ReplayContext {
  landed: ReplayLanded[];
  previousDiff: string;
}
