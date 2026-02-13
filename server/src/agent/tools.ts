import { retrieve as retrieveImpl, type RetrievalHit } from './retrieval.js';

export type ToolContext = {
  draft: string;
  plan: string[];
};

export type ToolResultMap = {
  makePlan: { plan: string[] };
  retrieve: { hits: RetrievalHit[] };
  writeDraft: { draft: string };
};

export function createToolContext(): ToolContext {
  return { draft: '', plan: [] };
}

export function makePlan(ctx: ToolContext, input: unknown): ToolResultMap['makePlan'] {
  const goal = typeof input === 'string' ? input : JSON.stringify(input);
  const plan = [
    `Understand the goal: ${goal}`,
    'Retrieve relevant context and constraints',
    'Propose an approach and key steps',
    'Draft the output',
    'Refine and finalize'
  ];
  ctx.plan = plan;
  return { plan };
}

export function retrieve(ctx: ToolContext, input: unknown): ToolResultMap['retrieve'] {
  const query = typeof input === 'string' ? input : JSON.stringify(input);
  const hits = retrieveImpl(query, 5);
  return { hits };
}

export function writeDraft(ctx: ToolContext, input: unknown): ToolResultMap['writeDraft'] {
  const text = typeof input === 'string' ? input : JSON.stringify(input);
  ctx.draft = text;
  return { draft: ctx.draft };
}
