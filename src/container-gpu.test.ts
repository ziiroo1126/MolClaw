import { describe, expect, it, vi } from 'vitest';

import { resolveContainerGpuRequest } from './container-gpu.js';

describe('resolveContainerGpuRequest', () => {
  it('returns an explicit request unchanged', () => {
    expect(resolveContainerGpuRequest('device=0')).toBe('device=0');
  });

  it('disables GPU flags when auto-detect probe fails', () => {
    const probe = vi.fn(() => ({
      status: 1,
    }));

    expect(resolveContainerGpuRequest('auto', probe)).toBe('');
    expect(probe).toHaveBeenCalledWith(
      'nvidia-smi',
      ['--query-gpu=index', '--format=csv,noheader'],
      { stdio: 'ignore' },
    );
  });

  it('uses all GPUs when auto-detect probe succeeds', () => {
    const probe = vi.fn(() => ({
      status: 0,
    }));

    expect(resolveContainerGpuRequest('auto', probe)).toBe('all');
  });
});
