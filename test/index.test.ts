import { describe, expect, it } from 'vitest';

import { PACKAGE_NAME } from '../src/index.js';

describe('scaffolding', () => {
  it('resolves the public entry point', () => {
    expect(PACKAGE_NAME).toBe('@kora/critical-path-method');
  });
});
