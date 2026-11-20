import { buildMissionTrajectory } from './buildTrajectory.js';
import type { WorkerRequest, WorkerResponse } from './protocol.js';

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  if (req.type !== 'RUN_MISSION') return;

  try {
    const data = buildMissionTrajectory(
      req.vehicle,
      req.mission,
      req.sampleIntervalS ?? 0.25
    );
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
