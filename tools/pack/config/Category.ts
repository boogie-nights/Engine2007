import fs from 'fs';
import path from 'path';
import Packet from '#/io/Packet.js';
import {
    readConfigFile,
    writePackFile,
} from '#tools/util/ConfigPackHelper.ts';

function crawlCategoryNames(): string[] {
    const names = new Set<string>();

    for (const ext of ['.loc', '.npc', '.obj'] as const) {
        const blocks = readConfigFile(ext);
        for (const lines of blocks.values()) {
            for (const line of lines) {
                if (line.startsWith('category=')) {
                    names.add(line.slice('category='.length).trim());
                }
            }
        }
    }

    return Array.from(names).sort();
}

export function pack() {
    const names = crawlCategoryNames();

    if (names.length === 0) {
        console.error('No category= entries found.');
        return;
    }

    const buf = new Packet(new Uint8Array(1024 * 1024));
    buf.p2(names.length);

    const packLines: string[] = [];

    for (let id = 0; id < names.length; id++) {
        buf.p1(1);
        buf.pjstr(names[id]);
        buf.p1(0);

        packLines.push(`${id}=${names[id]}`);
    }

    writePackFile('category.pack', packLines);

    const outDir = path.join('data', 'pack', 'server');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    fs.writeFileSync(path.join(outDir, 'category.dat'), buf.data.subarray(0, buf.pos));
}

pack();
