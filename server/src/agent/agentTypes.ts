export type AgentRole = 'user' | 'assistant' | 'system';

export type AgentMessage = {
  role: Exclude<AgentRole, 'system'>;
  content: string;
};

export type AgentToolName = 'retrieve' | 'writeDraft' | 'makePlan';

export type AgentToolCall = {
  tool: AgentToolName;
  input: unknown;
};

export type AgentStep =
  | { type: 'model'; output: string }
  | { type: 'tool'; call: AgentToolCall; output: unknown }
  | { type: 'error'; message: string };

export type AgentResult = {
  final: string;
  steps: AgentStep[];
};
