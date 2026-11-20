import falcon9Stack from './components/falcon9-stack.json';
import stage1 from './components/stage1.json';
import stage2 from './components/stage2.json';
import merlin1d from './components/merlin-1d.json';
import mvac from './components/mvac.json';
import interstage from './components/interstage.json';
import gridFins from './components/grid-fins.json';
import landingLegs from './components/landing-legs.json';
import coldGasThrusters from './components/cold-gas-thrusters.json';
import fairing from './components/fairing.json';
import payload from './components/payload.json';
import droneship from './components/droneship.json';
import launchPad from './components/launch-pad.json';
import { validateComponentContent, type ComponentContent } from './schema.js';

const RAW_COMPONENTS: readonly [string, unknown][] = [
  ['falcon9-stack.json', falcon9Stack],
  ['stage1.json', stage1],
  ['stage2.json', stage2],
  ['merlin-1d.json', merlin1d],
  ['mvac.json', mvac],
  ['interstage.json', interstage],
  ['grid-fins.json', gridFins],
  ['landing-legs.json', landingLegs],
  ['cold-gas-thrusters.json', coldGasThrusters],
  ['fairing.json', fairing],
  ['payload.json', payload],
  ['droneship.json', droneship],
  ['launch-pad.json', launchPad],
];

export const ALL_COMPONENTS: readonly ComponentContent[] = RAW_COMPONENTS.map(
  ([file, raw]) => validateComponentContent(raw, file)
);

export const COMPONENT_BY_ID: Readonly<Record<string, ComponentContent>> =
  Object.fromEntries(ALL_COMPONENTS.map((c) => [c.id, c]));

export function getComponentContent(id: string): ComponentContent | null {
  return COMPONENT_BY_ID[id] ?? null;
}
