export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolCaller {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}
