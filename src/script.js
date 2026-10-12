// The scripts that run on the robot, as Vite hands them over (the source files as strings).
import tableSource from './py/table_edge.py?raw';
import handSource from './py/hand_sensor.py?raw';
import { buildScriptFrom, buildPlainScript } from './script-core.js';

export const edgeScript = buildScriptFrom(tableSource, 'edge');
export const backScript = buildScriptFrom(tableSource, 'back');
export const handScript = buildPlainScript(handSource);
