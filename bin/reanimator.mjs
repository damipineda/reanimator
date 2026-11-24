#!/usr/bin/env node
// Thin launcher so `node bin/reanimator.mjs convert <file.swf>` (or the
// package "bin" entry) runs the TypeScript CLI through tsx without a build step.
import { register } from 'tsx/esm/api';

register();
await import('../src/cli/reanimator.ts');
