export type AgentStatus =
  | 'planning'
  | 'editing'
  | 'yielding'
  | 'landing'
  | 'landed'
  | 'replaying'
  | 'failed'
  | 'needs-human';

export interface Claim {
  attemptId: string;
  path: string;
  symbol: string | null;
}

export interface AttemptView {
  attemptId: string;
  taskId: string;
  agent: string;
  intent: string;
  status: AgentStatus;
  replayOf: string | null;
}

export interface CommitView {
  sha: string;
  message: string;
  summary: string | null;
  agent: string | null;
  task: string | null;
  replayOf: string | null;
}

export type DemoEvent =
  | { type: 'proceed'; attemptId: string; agent: string; level: 'clear' | 'file' | 'symbol' }
  | { type: 'yield'; attemptId: string; agent: string; waitingFor: string[] }
  | { type: 'resume'; attemptId: string; agent: string }
  | { type: 'stale'; attemptId: string; agent: string }
  | { type: 'replay'; attemptId: string; agent: string; replayOf: string; reason: 'stale' | 'conflict' }
  | { type: 'landed'; attemptId: string; agent: string; sha: string; kind: 'fast-forward' | 'merge' | 'overlay' }
  | { type: 'needs-human'; attemptId: string; agent: string }
  | { type: 'failed'; attemptId: string; agent: string; message: string }
  | { type: 'main-moved'; repo: string; after: string };

export interface LineageGroup {
  taskId: string;
  agent: string;
  intent: string;
  attempts: AttemptView[];
}

export interface ProjectSnapshot {
  agents: AttemptView[];
  claims: Claim[];
  commits: CommitView[];
  events: DemoEvent[];
  lineage: LineageGroup[];
}
