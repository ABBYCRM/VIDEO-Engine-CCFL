import type { MonitorModel } from '@/lib/types';

export function buildMonitorConfig(model: MonitorModel) {
  if (model === 'disabled') {
    return { enabled: false };
  }

  return {
    enabled: true,
    provider: 'nvidia',
    model,
    responsibilities: [
      'Select best reusable prompt set from the prompt RAG library.',
      'Score creative outputs and ad performance when ad integrations are connected.',
      'Remain dormant but configured when ad-account integrations are disabled.'
    ]
  };
}
