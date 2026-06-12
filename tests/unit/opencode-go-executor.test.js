import { describe, expect, test } from 'vitest';
import { OpenCodeGoExecutor } from '../../open-sse/executors/opencode-go.js';

describe('OpenCodeGoExecutor DeepSeek variants', () => {
  test('maps deepseek-v4-pro-high to base model and injects reasoning_effort', () => {
    const exec = new OpenCodeGoExecutor();
    const body = {
      model: 'deepseek-v4-pro',
      messages: [{ role: 'user', content: 'Reply with exactly: ok' }],
      stream: false,
      max_tokens: 16,
    };

    const out = exec.transformRequest('deepseek-v4-pro-high', body);

    expect(out.model).toBe('deepseek-v4-pro');
    expect(out.reasoning_effort).toBe('high');
  });

  test('preserves explicit reasoning_effort over model suffix', () => {
    const exec = new OpenCodeGoExecutor();
    const body = {
      model: 'deepseek-v4-pro',
      messages: [{ role: 'user', content: 'Reply with exactly: ok' }],
      stream: false,
      max_tokens: 16,
      reasoning_effort: 'max',
    };

    const out = exec.transformRequest('deepseek-v4-pro-low', body);

    expect(out.model).toBe('deepseek-v4-pro');
    expect(out.reasoning_effort).toBe('max');
  });
});
