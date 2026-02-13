import { Router } from 'express';
import { novaConverseText } from '../agent/novaClient.js';
import { createToolContext, makePlan, retrieve, writeDraft } from '../agent/tools.js';
import type { AgentResult, AgentStep } from '../agent/agentTypes.js';

type AgentRequestBody = {
  goal?: string;
  context?: string;
  messages?: { role?: unknown; content?: unknown }[];
};

type ModelDecision =
  | { action: 'tool'; tool: 'makePlan' | 'retrieve' | 'writeDraft'; input: unknown }
  | { action: 'final'; output: string };

type ToolName = 'makePlan' | 'retrieve' | 'writeDraft';

function isToolName(x: unknown): x is ToolName {
  return x === 'makePlan' || x === 'retrieve' || x === 'writeDraft';
}

function extractJsonObject(text: string): string {
  const trimmed = text.trim();

  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;

  if (candidate.startsWith('{') || candidate.startsWith('[')) return candidate;

  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return candidate.slice(firstBrace, lastBrace + 1);
  }

  const firstBracket = candidate.indexOf('[');
  const lastBracket = candidate.lastIndexOf(']');
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    return candidate.slice(firstBracket, lastBracket + 1);
  }

  return candidate;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(extractJsonObject(text));
  } catch {
    return null;
  }
}

function toErrorDetails(err: unknown): Record<string, unknown> {
  if (!err || typeof err !== 'object') return { message: String(err) };
  const anyErr = err as any;
  const details: Record<string, unknown> = {
    name: typeof anyErr.name === 'string' ? anyErr.name : undefined,
    message: typeof anyErr.message === 'string' ? anyErr.message : String(err)
  };

  if (typeof anyErr.code === 'string') details.code = anyErr.code;
  if (typeof anyErr.$fault === 'string') details.fault = anyErr.$fault;

  const md = anyErr.$metadata;
  if (md && typeof md === 'object') {
    details.metadata = {
      httpStatusCode: md.httpStatusCode,
      requestId: md.requestId,
      attempts: md.attempts,
      totalRetryDelay: md.totalRetryDelay
    };
  }

  return details;
}

export function createAgentRouter(): Router {
  const router = Router();

  router.post('/agent', async (req, res) => {
    const expectedKey = process.env.DEMO_API_KEY;
    if (expectedKey) {
      const provided = req.header('x-demo-api-key');
      if (provided !== expectedKey) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
    }

    const body = (req.body ?? {}) as AgentRequestBody;
    const goal = typeof body.goal === 'string' ? body.goal.trim() : '';
    const context = typeof body.context === 'string' ? body.context.trim() : '';

    const history: { role: 'user' | 'assistant'; content: string }[] = Array.isArray(body.messages)
      ? body.messages
          .filter((m) => m && typeof m === 'object')
          .map((m) => {
            const role = (m as any).role;
            const content = (m as any).content;
            if (role !== 'user' && role !== 'assistant') return null;
            if (typeof content !== 'string') return null;
            const trimmed = content.trim();
            if (!trimmed) return null;
            return { role, content: trimmed };
          })
          .filter((x): x is { role: 'user' | 'assistant'; content: string } => x !== null)
          .slice(-12)
      : [];

    if (!goal) {
      res.status(400).json({ error: 'Missing required field: goal' });
      return;
    }

    const modelId = process.env.NOVA_MODEL_ID;
    if (!modelId) {
      res.status(500).json({
        error: 'Missing NOVA_MODEL_ID. Set it in your server environment (and ensure Bedrock model access is enabled).'
      });
      return;
    }

    const steps: AgentStep[] = [];
    const toolCtx = createToolContext();

    const system =
      'You are an agent. You MUST respond with a single JSON object only (no markdown, no extra text). ' +
      'Choose one: ' +
      '{"action":"tool","tool":"makePlan"|"retrieve"|"writeDraft","input":...} ' +
      'or {"action":"final","output":"..."}. ' +
      'You are continuing a conversation; use the prior messages for context when answering follow-ups. ' +
      'Be reliable: if you need constraints or context, call retrieve.';

    const messages: { role: 'user' | 'assistant'; content: string }[] = [
      ...history,
      {
        role: 'user',
        content:
          goal +
          (context ? `\n\nContext:\n${context}` : '') +
          '\n\nIf needed, start by making a plan, then use tools as needed, then finalize.'
      }
    ];

    const maxTurns = 8;

    try {
      for (let turn = 0; turn < maxTurns; turn += 1) {
        const modelText = await novaConverseText({
          modelId,
          system,
          messages,
          maxTokens: 700,
          temperature: 0.2
        });

        steps.push({ type: 'model', output: modelText });
        messages.push({ role: 'assistant', content: modelText });

        const parsed = safeJsonParse(modelText) as any;
        if (!parsed || typeof parsed !== 'object' || !('action' in parsed)) {
          throw new Error('Model did not return valid JSON decision. Ensure the model is following the JSON-only contract.');
        }

        if (parsed.action === 'final') {
          const result: AgentResult = { final: String(parsed.output ?? ''), steps };
          res.json(result);
          return;
        }

        // Accept an alternative format where the model uses action as the tool name:
        // {"action":"writeDraft","input":...}
        if (isToolName(parsed.action)) {
          const tool = parsed.action;
          const input = parsed.input;
          let toolOutput: unknown;
          if (tool === 'makePlan') toolOutput = makePlan(toolCtx, input);
          else if (tool === 'retrieve') toolOutput = retrieve(toolCtx, input);
          else toolOutput = writeDraft(toolCtx, input);

          steps.push({ type: 'tool', call: { tool, input }, output: toolOutput });
          messages.push({
            role: 'user',
            content: JSON.stringify({ tool, output: toolOutput })
          });
          continue;
        }

        if (parsed.action === 'tool') {
          let toolOutput: unknown;
          if (!isToolName(parsed.tool)) {
            throw new Error(`Unknown or missing tool: ${String(parsed.tool)}`);
          }

          if (parsed.tool === 'makePlan') toolOutput = makePlan(toolCtx, parsed.input);
          else if (parsed.tool === 'retrieve') toolOutput = retrieve(toolCtx, parsed.input);
          else toolOutput = writeDraft(toolCtx, parsed.input);

          steps.push({ type: 'tool', call: { tool: parsed.tool, input: parsed.input }, output: toolOutput });
          messages.push({
            role: 'user',
            content: JSON.stringify({ tool: parsed.tool, output: toolOutput })
          });
          continue;
        }

        throw new Error(`Unknown model action: ${String(parsed.action)}`);
      }

      res.status(500).json({ error: 'Agent exceeded max turns without producing a final answer.', steps });
    } catch (err) {
      const details = toErrorDetails(err);
      const message = typeof details.message === 'string' ? details.message : String(err);
      steps.push({ type: 'error', message });
      const region = process.env.AWS_REGION ?? '(unset)';

      res.status(500).json({
        error: message,
        details,
        hint:
          `If this is an AWS/Bedrock issue, verify AWS_REGION=${region}, credentials, Bedrock model access, and NOVA_MODEL_ID.`,
        steps
      });
    }
  });

  return router;
}
