import fs from 'fs';
import path from 'path';
import Packet from '#/io/Packet.js';
import ScriptVarType from '#/cache/config/ScriptVarType.js';
import {
    CACHE_OUT_DIR,
    assembleGroupBuffer,
    packGroup,
    readConfigFile,
    writePackFile,
} from '#tools/util/ConfigPackHelper.ts';

const CONFIG_ARCHIVE = 2;
const VARN_GROUP = 6;

function encodeVarn(debugName: string, typeChar: number | null): Uint8Array {
    const buf = new Packet(new Uint8Array(64));

    if (typeChar !== null) {
        buf.p1(1);
        buf.p1(typeChar);
    }

    if (debugName.length > 0) {
        buf.p1(250);
        buf.pjstr(debugName);
    }

    buf.p1(0);
    return new Uint8Array(buf.data.subarray(0, buf.pos));
}

export function pack() {
    const configBlocks = readConfigFile('.varn');

    if (configBlocks.size === 0) {
        console.error('No .varn entries found');
        return;
    }

    const names = Array.from(configBlocks.keys()).sort();

    const files: Uint8Array[] = new Array(names.length);
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
                    throw new Error(`Unknown script var type for varn [${debugName}]: ${value}`);
                }
                typeChar = code;
            }
        }

        files[id] = encodeVarn(debugName, typeChar);
        packLines.push(`${id}=${debugName}`);
    }

    writePackFile('varn.pack', packLines);

    const outDir = path.join(CACHE_OUT_DIR, String(CONFIG_ARCHIVE));
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const groupBuffer = assembleGroupBuffer(files);
    const container = packGroup(groupBuffer, null);

    fs.writeFileSync(path.join(outDir, `${VARN_GROUP}.dat`), container);
}

pack();