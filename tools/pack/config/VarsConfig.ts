import fs from 'fs';
import path from 'path';
import Packet from '#/io/Packet.js';
import ScriptVarType from '#/cache/config/ScriptVarType.js';
import {
    readConfigFile,
    writePackFile,
} from '#tools/util/ConfigPackHelper.ts';

const OUT_DIR = path.join('data', 'pack', 'server');

export function pack() {
    const configBlocks = readConfigFile('.vars');

    if (configBlocks.size === 0) {
        console.error('No .vars entries found');
        return;
    }

    const names = Array.from(configBlocks.keys()).sort();

    const buf = new Packet(new Uint8Array(1024 * 1024));
    buf.p2(names.length);

    const packLines: string[] = [];

    for (let id = 0; id < names.length; id++) {
        const debugName = names[id];
        const lines = configBlocks.get(debugName)!;

        let typeChar: number | null = null;

        for (const line of lines) {
            const eq = line.indexOf('=');
            if (eq === -1) continue;

            const key = line.slice(0, eq).trim();
            const value = line.slice(eq + 1).trim();

            if (key === 'type') {
                const code = ScriptVarType.getTypeChar(value);
                if (code === null) {
                    throw new Error(`Unknown script var type for vars [${debugName}]: ${value}`);
                }
                typeChar = code;
            }
        }

        if (typeChar !== null) {
            buf.p1(1);
            buf.p1(typeChar);
        }

        if (debugName.length > 0) {
            buf.p1(250);
            buf.pjstr(debugName);
        }

        buf.p1(0);

        packLines.push(`${id}=${debugName}`);
    }

    writePackFile('vars.pack', packLines);

    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, 'vars.dat'), buf.data.subarray(0, buf.pos));
}

pack();
