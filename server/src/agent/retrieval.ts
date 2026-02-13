export type RetrievalHit = {
  id: string;
  title: string;
  snippet: string;
  score: number;
};

type Doc = {
  id: string;
  title: string;
  text: string;
};

const DOCS: Doc[] = [
  {
    id: 'hackathon-submission',
    title: 'Hackathon submission checklist',
    text: [
      'Pick one category.',
      'Provide a brief text description explaining what you built and how you leverage Amazon Nova.',
      'Provide a demo video around 3 minutes showing the project functioning and include #AmazonNova.',
      'Provide a code repository link (share access if private).'
    ].join('\n')
  },
  {
    id: 'nova-act-summary',
    title: 'Nova Act summary',
    text: [
      'Nova Act is an AWS service to build and manage fleets of reliable AI agents for automating production UI workflows at scale.',
      'It automates browser workflows and can integrate with external tools via API calls and remote MCP.'
    ].join('\n')
  },
  {
    id: 'agentic-best-practices',
    title: 'Agentic demo best practices',
    text: [
      'Show a clear goal, a plan, tool usage, and a trace of steps.',
      'Keep the demo crisp and within 3 minutes.',
      'Make errors visible and actionable (missing credentials, missing model access).'
    ].join('\n')
  }
];

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function retrieve(query: string, limit = 5): RetrievalHit[] {
  const q = tokenize(query);
  if (q.length === 0) return [];

  const scored = DOCS.map((d) => {
    const t = tokenize(d.title + ' ' + d.text);
    const termSet = new Set(t);
    const score = q.reduce((acc, term) => acc + (termSet.has(term) ? 1 : 0), 0);
    return { d, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map(({ d, score }) => {
    const snippet = d.text.length > 400 ? d.text.slice(0, 400) + '…' : d.text;
    return {
      id: d.id,
      title: d.title,
      snippet,
      score
    };
  });
}
