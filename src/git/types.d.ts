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
