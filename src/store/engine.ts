// The single place the store binds to an engine implementation.
// Swap to `import * as real from '../engine'` + `satisfies EngineApi` once the engine branch lands.
import type { EngineApi } from '../engine/types';
import { stubEngine } from './engineStub';

export const engine: EngineApi = stubEngine;
