import {
  BedrockRuntimeClient,
  ConverseCommand,
  InvokeModelCommand,
  type Message
} from '@aws-sdk/client-bedrock-runtime';

export type NovaTextOptions = {
  modelId: string;
  system?: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  maxTokens?: number;
  temperature?: number;
};

function toBedrockMessages(messages: NovaTextOptions['messages']): Message[] {
  return messages.map((m) => ({
    role: m.role,
    content: [{ text: m.content }]
  }));
}

function extractTextFromConverseLikeJson(json: any): string {
  const parts = json?.output?.message?.content;
  if (Array.isArray(parts)) {
    const text = parts.map((p: any) => (p && typeof p.text === 'string' ? p.text : '')).join('');
    if (text) return text;
  }

  if (typeof json?.outputText === 'string') return json.outputText;
  if (typeof json?.generation === 'string') return json.generation;
  if (typeof json?.completion === 'string') return json.completion;
  if (typeof json?.text === 'string') return json.text;

  return '';
}

async function invokeModelFallback(
  client: BedrockRuntimeClient,
  opts: NovaTextOptions
): Promise<string> {
  const body = {
    system: opts.system ? [{ text: opts.system }] : undefined,
    messages: toBedrockMessages(opts.messages),
    inferenceConfig: {
      maxTokens: opts.maxTokens ?? 800,
      temperature: opts.temperature ?? 0.2
    }
  };

  const command = new InvokeModelCommand({
    modelId: opts.modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: new TextEncoder().encode(JSON.stringify(body))
  });

  const resp = await client.send(command);
  const textBody = new TextDecoder().decode(resp.body);
  const json = JSON.parse(textBody);
  const text = extractTextFromConverseLikeJson(json);
  if (!text) {
    throw new Error('Empty model response from Bedrock InvokeModel API');
  }
  return text;
}

export async function novaConverseText(opts: NovaTextOptions): Promise<string> {
  const region = process.env.AWS_REGION || 'us-east-1';

  const client = new BedrockRuntimeClient({ region });

  const isInferenceProfileArn =
    opts.modelId.startsWith('arn:aws:bedrock:') && opts.modelId.includes(':inference-profile/');

  if (isInferenceProfileArn) {
    return invokeModelFallback(client, opts);
  }

  try {
    const command = new ConverseCommand({
      modelId: opts.modelId,
      system: opts.system ? [{ text: opts.system }] : undefined,
      messages: toBedrockMessages(opts.messages),
      inferenceConfig: {
        maxTokens: opts.maxTokens ?? 800,
        temperature: opts.temperature ?? 0.2
      }
    });

    const resp = await client.send(command);
    const parts = resp.output?.message?.content ?? [];
    const text = parts.map((p) => ('text' in p ? p.text : '')).join('');
    if (!text) {
      throw new Error('Empty model response from Bedrock Converse API');
    }
    return text;
  } catch (err: any) {
    const name = typeof err?.name === 'string' ? err.name : '';
    const msg = typeof err?.message === 'string' ? err.message : '';
    if (name === 'ValidationException' && msg.toLowerCase().includes('operation not allowed')) {
      return invokeModelFallback(client, opts);
    }
    throw err;
  }
}
