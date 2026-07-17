import fs from 'fs';
import path from 'path';
import Packet from '#/io/Packet.js';
import Js5Index from '#/js5/Js5Index.js';
import {
    CACHE_OUT_DIR,
    loadNameToIdMap,
    assembleGroupBuffer,
    packGroupAuto,
    readFlatFile,
    findConfigFiles,
} from '#tools/util/ConfigPackHelper.ts';

const CONFIG_ARCHIVE = 2;
const INV_GROUP = 5;
const SERVER_ONLY_INV_OPCODES = new Set<number>([1, 3, 4, 5, 6, 7, 8, 9, 250]);

export type InvOpcode = {
    code: number;
    payload: any;
};

type InvSourceField = {
    key: string;
    value: string;
    line: number;
};

type InvSourceSection = {
    name: string;
    line: number;
    fields: InvSourceField[];
};

function parseInvSourceSections(content: string): InvSourceSection[] {
    const lines = content.split('\n');
    const sections: InvSourceSection[] = [];
    let current: InvSourceSection | null = null;

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
        const trimmed = line.trim();

        if (trimmed.length === 0 || trimmed.startsWith('//')) {
            continue;
        }

        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            current = {
                name: trimmed.substring(1, trimmed.length - 1),
                line: i + 1,
                fields: []
            };
            sections.push(current);
            continue;
        }

        if (!current) continue;

        const eq = line.indexOf('=');
        if (eq === -1) continue;

        const key = line.substring(0, eq).trim();
        const value = line.substring(eq + 1);
        if (key.length === 0) continue;

        current.fields.push({ key, value, line: i + 1 });
    }

    return sections;
}

function parseInt2(value: string, context: string): number {
    const stripped = value.trim()
        .replace(/^inv_/, '')
        .replace(/^obj_/, '');
    const n = Number(stripped);
    if (!Number.isFinite(n)) {
        throw new Error(`Invalid number for ${context}: ${value}`);
    }
    return n;
}

function resolveObjRef(value: string, nameToId: Map<string, number>): number {
    const trimmed = value.trim();

    const fromMap = nameToId.get(trimmed);
    if (fromMap !== undefined) return fromMap;

    if (trimmed === 'null') return 65535;

    return parseInt2(trimmed, 'obj ref');
}

export function parseSourceInvs(
    content: string,
    invNameToId: Map<string, number>,
    objNameToId: Map<string, number>
): Map<number, InvOpcode[]> {
    const sections = parseInvSourceSections(content);
    const byId = new Map<number, InvOpcode[]>();

    for (const section of sections) {
        let id: number;
        const fromMap = invNameToId.get(section.name);
        if (fromMap !== undefined) {
            id = fromMap;
        } else if (section.name.startsWith('inv_')) {
            id = parseInt2(section.name.slice(4), section.name);
        } else {
            throw new Error(`Unknown inv name: ${section.name} at line ${section.line}`);
        }

        const ops: InvOpcode[] = [];
        const fields = section.fields;
        const stocks: Array<{ index: number; obj: number; count: number; rate: number }> = [];

        for (let i = 0; i < fields.length; i++) {
            const { key, value } = fields[i];
            const vt = value.trim();

            if (key === 'scope') {
                let scopeVal = 0;
                if (vt === 'temp') scopeVal = 0;
                else if (vt === 'perm') scopeVal = 1;
                else if (vt === 'shared') scopeVal = 2;
                ops.push({ code: 1, payload: scopeVal });
                continue;
            }

            if (key === 'size') {
                ops.push({ code: 2, payload: parseInt2(vt, key) });
                continue;
            }

            if (key === 'stackall' && vt === 'yes') {
                ops.push({ code: 3, payload: true });
                continue;
            }

            if (key === 'restock' && vt === 'yes') {
                ops.push({ code: 5, payload: true });
                continue;
            }

            if (key === 'allstock' && vt === 'yes') {
                ops.push({ code: 6, payload: true });
                continue;
            }

            if (key === 'protect' && vt === 'no') {
                ops.push({ code: 7, payload: false });
                continue;
            }

            if (key === 'runweight' && vt === 'yes') {
                ops.push({ code: 8, payload: true });
                continue;
            }

            if (key === 'dummyinv' && vt === 'yes') {
                ops.push({ code: 9, payload: true });
                continue;
            }

            if (key.startsWith('stock')) {
                const index = parseInt(key.substring(5), 10) - 1;
                const parts = vt.split(',');
                const objRef = resolveObjRef(parts[0], objNameToId);
                const count = parseInt2(parts[1], `${key}.count`);
                const rate = parts[2] !== undefined ? parseInt2(parts[2], `${key}.rate`) : 0;
                stocks.push({ index, obj: objRef, count, rate });
                continue;
            }
        }

        if (stocks.length > 0) {
            const maxIndex = Math.max(...stocks.map(s => s.index));
            const stockPayload: Array<{ obj: number; count: number; rate: number } | undefined> = Array.from({ length: maxIndex + 1 });

            for (const s of stocks) {
                stockPayload[s.index] = { obj: s.obj, count: s.count, rate: s.rate };
            }

            ops.push({ code: 4, payload: stockPayload });
        }

        if (section.name) {
            ops.push({ code: 250, payload: section.name });
        }

        byId.set(id, ops);
    }

    return byId;
}

export function encodeInvOps(ops: InvOpcode[]): Uint8Array {
    const buf = new Packet(new Uint8Array(2048));

    for (const { code, payload } of ops) {
        buf.p1(code);

        if (code === 1) {
            buf.p1(Number(payload));
        } else if (code === 2) {
            buf.p2(Number(payload));
        } else if (code === 3) {
        } else if (code === 4) {
            const stock = payload as Array<{ obj: number; count: number; rate: number } | undefined>;
            buf.p1(stock.length);
            for (let i = 0; i < stock.length; i++) {
                const item = stock[i];
                if (item === undefined) {
                    buf.p2(-1);
                    buf.p2(0);
                    buf.p4(0);
                } else {
                    buf.p2(item.obj);
                    buf.p2(item.count);
                    if (typeof item.rate !== 'undefined') {
                        buf.p4(item.rate);
                    } else {
                        buf.p4(0);
                    }
                }
            }
        } else if (code === 5) {
        } else if (code === 6) {
        } else if (code === 7) {
        } else if (code === 8) {
        } else if (code === 9) {
        } else if (code === 250) {
            buf.pjstr(String(payload ?? ''));
        } else {
            throw new Error(`Unrecognized inv opcode: ${code}`);
        }
    }

    buf.p1(0);
    return new Uint8Array(buf.data.subarray(0, buf.pos));
}

export function pack() {
    const invNameToId = loadNameToIdMap('inv.pack');
    const objNameToId = loadNameToIdMap('obj.pack');

    const files = findConfigFiles('.inv');
    if (files.size === 0) {
        console.error('No .inv entries found under BUILD_SRC_DIR/scripts');
        return;
    }

    // Gathered per file rather than in one combined blob, so a duplicate inv
    // id defined in two different .inv files is caught instead of one
    // silently overwriting the other.
    const invOpsById = new Map<number, InvOpcode[]>();

    for (const file of files) {
        const sourceContent = fs.readFileSync(file, 'utf-8');
        const fileOpsById = parseSourceInvs(sourceContent, invNameToId, objNameToId);

        for (const [id, ops] of fileOpsById) {
            if (invOpsById.has(id)) {
                throw new Error(`Duplicate inv config for id ${id} — also found in ${file}`);
            }
            invOpsById.set(id, ops);
        }
    }

    const serverOpsById = invOpsById;
    const clientOpsById = new Map(
        [...invOpsById.entries()].map(([id, ops]) => [
            id,
            ops.filter(op => !SERVER_ONLY_INV_OPCODES.has(op.code))
        ])
    );

    try {
        const configIndex = new Js5Index(false, false);

        const indexData = readFlatFile(255, CONFIG_ARCHIVE);
        if (!indexData) {
            console.error('Failed to read Config Archive Index (255.2).');
            return;
        }
        configIndex.decode(indexData);

        const raw = readFlatFile(CONFIG_ARCHIVE, INV_GROUP);
        if (!raw) {
            console.error('Failed to read raw config group.');
            return;
        }
        configIndex.packed[INV_GROUP] = raw;
        configIndex.unpackGroup(INV_GROUP);

        const outDir = path.join(CACHE_OUT_DIR, String(CONFIG_ARCHIVE));
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

        for (const [label, opsById] of [['server', serverOpsById], ['client', clientOpsById]] as const) {
            const filesCount = configIndex.groupSize[INV_GROUP];
            if (filesCount === 0) continue;

            const rawContainer = configIndex.packed[INV_GROUP];
            if (!rawContainer) continue;

            const fileIds = configIndex.fileIds[INV_GROUP];
            const orderedIds = Array.from(
                { length: filesCount },
                (_, i) => fileIds ? fileIds[i] : i
            );

            const orderedFiles = orderedIds.map(fileId => {
                const ops = opsById.get(fileId);

                if (ops !== undefined) {
                    return encodeInvOps(ops);
                }

                const orig = configIndex.unpacked[INV_GROUP]?.[fileId];
                if (!orig) {
                    return new Uint8Array([0]);
                }
                return orig;
            });

            const groupBuffer = assembleGroupBuffer(orderedFiles);
            const container = packGroupAuto(groupBuffer, rawContainer);

            const suffix = label === 'server' ? '' : '.client';
            const outPath = path.join(outDir, `${INV_GROUP}${suffix}.dat`);
            fs.writeFileSync(outPath, container);
        }

    } catch (err) {
        console.error('An error occurred during inventory packing:', err);
    }
}

pack();
