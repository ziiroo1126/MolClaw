import { spawnSync } from 'child_process';

import { CONTAINER_GPU_REQUEST } from './config.js';

interface ProbeResult {
  status: number | null;
}

type ProbeFn = (
  command: string,
  args: string[],
  options: { stdio: 'ignore' },
) => ProbeResult;

export function resolveContainerGpuRequest(
  requested: string = CONTAINER_GPU_REQUEST,
  probe: ProbeFn = spawnSync,
): string {
  const normalized = requested.trim();

  if (!normalized || normalized.toLowerCase() === 'none') {
    return '';
  }

  if (normalized.toLowerCase() !== 'auto') {
    return normalized;
  }

  const result = probe(
    'nvidia-smi',
    ['--query-gpu=index', '--format=csv,noheader'],
    { stdio: 'ignore' },
  );

  return result.status === 0 ? 'all' : '';
}
