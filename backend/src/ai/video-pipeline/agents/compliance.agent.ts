import { z } from 'zod';
import { collectPlanCopy, type HardGateResult } from '../compliance/hard-gate';
import type { VideoPlan } from '../contract';
import type { LlmPort } from './llm-port';
import { runAgent, type AgentBudget, type AgentDefinition } from './runtime';

export const complianceVerdictSchema = z.object({
  block: z.boolean(),
  notes: z.array(z.string().min(1).max(200)).min(1).max(6),
});

export type ComplianceVerdict = z.infer<typeof complianceVerdictSchema>;

const COMPLIANCE_SUBMIT_INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    block: {
      type: 'boolean',
      description: 'True only when the copy implies a banned claim the keyword gate may have missed.',
    },
    notes: { type: 'array', items: { type: 'string' } },
  },
  required: ['block', 'notes'],
};

export function buildComplianceAgentDefinition(plan: VideoPlan): AgentDefinition<ComplianceVerdict> {
  return {
    name: 'compliance',
    terminalToolName: 'submit_compliance',
    outputSchema: complianceVerdictSchema,
    systemPrompt: [
      'You are an AHPRA / advertising-compliance reviewer for beauty and wellness short-form video copy.',
      'A keyword hard gate already ran. You only catch EDGE CASES: implied outcomes, implied testimonials, or implied before/after without those words.',
      'Do NOT block for weak writing, generic hooks, or missing CTAs. That is the critic.',
      'Return the result ONLY by calling submit_compliance.',
      'Set block=true only when a reasonable viewer would read a prohibited health/outcome claim.',
      plan.compliance.medicalAesthetics
        ? 'This brand is medical aesthetics. Education and consultation framing only.'
        : 'This brand is not medical aesthetics. Still block guaranteed-results or body-shaming implications.',
    ].join('\n\n'),
    tools: [
      {
        name: 'submit_compliance',
        description: 'Submit the edge-case compliance verdict.',
        inputSchema: COMPLIANCE_SUBMIT_INPUT_SCHEMA,
        terminal: true,
      },
    ],
  };
}

export async function runComplianceAgent(
  plan: VideoPlan,
  llm: LlmPort,
  budget: AgentBudget,
): Promise<ComplianceVerdict> {
  const run = await runAgent({
    definition: buildComplianceAgentDefinition(plan),
    userPrompt: `Copy to review:\n${collectPlanCopy(plan) || '(empty)'}`,
    llm,
    budget,
  });
  return run.output;
}

export function mergeComplianceNotes(
  hard: HardGateResult,
  edge: ComplianceVerdict | null,
): string[] {
  const notes = [...hard.failures];
  if (edge?.notes) notes.push(...edge.notes);
  return notes;
}
