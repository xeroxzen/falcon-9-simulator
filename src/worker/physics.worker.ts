import { buildMissionTrajectory } from './buildTrajectory.js';
import type { WorkerRequest, WorkerResponse } from './protocol.js';

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  if (req.type !== 'RUN_MISSION') return;

  try {
    const p1: WorkerResponse = {
      type: 'MISSION_PROGRESS',
      requestId: req.requestId,
      progress: 0.2,
      stage: 'Integrating deterministic RK4 physics…',
    };
    self.postMessage(p1);

    const data = buildMissionTrajectory(
      req.vehicle,
      req.mission,
      req.sampleIntervalS ?? 0.25
    );

    const p2: WorkerResponse = {
      type: 'MISSION_PROGRESS',
      requestId: req.requestId,
      progress: 0.95,
      stage: 'Finalizing trajectory & telemetry…',
    };
    self.postMessage(p2);

    const reply: WorkerResponse = {
      type: 'MISSION_RESULT',
      requestId: req.requestId,
      data,
    };
    self.postMessage(reply);
  } catch (err) {
    const reply: WorkerResponse = {
      type: 'MISSION_ERROR',
      requestId: req.requestId,
      message: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(reply);
  }
};
