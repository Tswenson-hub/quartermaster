// The single place the store binds to an engine implementation.
import { engine as realEngine } from '../engine';
import type { EngineApi } from '../engine/types';

export const engine: EngineApi = realEngine;
