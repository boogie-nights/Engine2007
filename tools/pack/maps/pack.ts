import fs from 'fs';
import path from 'path';

import Packet from '#/io/Packet.ts';
import Js5Index from '#/js5/Js5Index.ts';
import Environment from '#/util/Environment.ts';
import {
    CACHE_DIR,
    packGroup,
    updateMasterIndex,
    updateChecksumTable,
    writeMasterIndex,
    writeChecksumTable,
    readFlatFile
} from '#tools/util/ConfigPackHelper.ts';

const SRC_DIR = `${Environment.BUILD_SRC_DIR}/maps`;
const MAPS_ARCHIVE = 5;

function packCoord(level: number, x: number, z: number): number {
    return (z & 0x3f) | ((x & 0x3f) << 6) | ((level & 0x3) << 12);
}

type LandTile = {
    h: number;
    overlayId: number;
    overlayShape: number;
    overlayRot: number;
    flags: number;
    underlay: number;
};

type LocEntry = { id: number; shape: number; angle: number };
type NpcEntry = { id: number };
type ObjEntry = { id: number; count: number };

function readJm2(lines: string[]) {
    const land = new Map<number, LandTile>();
    const loc = new Map<number, LocEntry[]>();
    const npc = new Map<number, NpcEntry[]>();
    const obj = new Map<number, ObjEntry[]>();

    let section: string | null = null;

    for (const line of lines) {
        if (line.startsWith('====')) {
            section = line.slice(4, -4).trim();
            continue;
        }
        if (!line.length) {
            continue;
        }

        const colon = line.indexOf(':');
        const sp1 = line.indexOf(' ');
        const sp2 = line.indexOf(' ', sp1 + 1);

        const level = parseInt(line.slice(0, sp1));
        const x = parseInt(line.slice(sp1 + 1, sp2));
        const z = parseInt(line.slice(sp2 + 1, colon));
        const key = packCoord(level, x, z);
        const data = line.slice(colon + 2);

        if (section === 'MAP') {
            let h = 0;
            let overlayId = -1;
            let overlayShape = -1;
            let overlayRot = -1;
            let flags = -1;
            let underlay = -1;

            for (const token of data.split(' ')) {
                if (!token.length) {
                    continue;
                }
                const type = token.charCodeAt(0);
                const info = token.slice(1);

                if (type === 104) {
                    h = parseInt(info);
                } else if (type === 111) {
                    const parts = info.split(';');
                    overlayId = parseInt(parts[0]);
                    overlayShape = parts.length > 1 ? parseInt(parts[1]) : -1;
                    overlayRot = parts.length > 2 ? parseInt(parts[2]) : -1;
                } else if (type === 102) {
                    flags = parseInt(info);
                } else if (type === 117) {
                    underlay = parseInt(info);
                }
            }

            land.set(key, { h, overlayId, overlayShape, overlayRot, flags, underlay });
        } else if (section === 'LOC') {
            const parts = data.split(' ');
            const id = parseInt(parts[0]);
            const shape = parts.length > 1 ? parseInt(parts[1]) : 10;
            const angle = parts.length > 2 ? parseInt(parts[2]) : 0;
            const entry = loc.get(key);
            if (entry) {
                entry.push({ id, shape, angle });
            } else {
                loc.set(key, [{ id, shape, angle }]);
            }
        } else if (section === 'NPC') {
            const id = parseInt(data);
            const entry = npc.get(key);
            if (entry) {
                entry.push({ id });
            } else {
                npc.set(key, [{ id }]);
            }
        } else if (section === 'OBJ') {
            const sp = data.indexOf(' ');
            const id = parseInt(data.slice(0, sp));
            const count = parseInt(data.slice(sp + 1));
            const entry = obj.get(key);
            if (entry) {
                entry.push({ id, count });
            } else {
                obj.set(key, [{ id, count }]);
            }
        }
    }

    return { land, loc, npc, obj };
}

function encodeNpcs(npc: Map<number, NpcEntry[]>): Uint8Array {
    const out = Packet.alloc(10_000);
    for (const [key, entries] of npc) {
        out.p2(key);
        out.p1(entries.length);
        for (const { id } of entries) {
            out.p2(id);
        }
    }
    const result = out.data.subarray(0, out.pos);
    out.release();
    return result;
}

function encodeObjs(obj: Map<number, ObjEntry[]>): Uint8Array {
    const out = Packet.alloc(10_000);
    for (const [key, entries] of obj) {
        out.p2(key);
        out.p1(entries.length);
        for (const { id, count } of entries) {
            out.p2(id);
            out.p1(count);
        }
    }
    const result = out.data.subarray(0, out.pos);
    out.release();
    return result;
}

function encodeLand(land: Map<number, LandTile>, mapX: number, mapZ: number): Uint8Array {
    const out = Packet.alloc(150_000);

    for (let level = 0; level < 4; level++) {
        for (let x = 0; x < 64; x++) {
            for (let z = 0; z < 64; z++) {
                const tile = land.get(packCoord(level, x, z));

                if (!tile || (tile.h === 0 && tile.overlayId === -1 && tile.flags === -1 && tile.underlay === -1)) {
                    out.p1(0);
                    continue;
                }

                if (tile.overlayId !== -1) {
                    const effShape = tile.overlayShape === -1 ? 0 : tile.overlayShape;
                    const effRot = tile.overlayRot === -1 ? 0 : tile.overlayRot;
                    const opcode = 2 + (effShape << 2) + effRot;

                    if (opcode > 49) {
                        console.error(`m${mapX}_${mapZ} ${level},${x},${z}: overlay opcode ${opcode} out of range (max 49)`);
                    }

                    out.p1(opcode);
                    out.p1(tile.overlayId);
                }

                if (tile.flags !== -1) {
                    out.p1(tile.flags + 49);
                }

                if (tile.underlay !== -1) {
                    if (tile.underlay > 174) {
                        console.error(`m${mapX}_${mapZ} ${level},${x},${z}: underlay id ${tile.underlay} exceeds the 1-byte format's max of 174`);
                    }
                    out.p1(tile.underlay + 81);
                }

                if (tile.h !== 0) {
                    out.p1(1);
                    out.p1(tile.h);
                } else {
                    out.p1(0);
                }
            }
        }
    }

    const result = out.data.subarray(0, out.pos);
    out.release();
    return result;
}

function encodeLocs(loc: Map<number, LocEntry[]>): Uint8Array {
    const allLocs: { id: number; key: number; shape: number; angle: number }[] = [];
    for (const [key, entries] of loc) {
        for (const { id, shape, angle } of entries) {
            allLocs.push({ id, key, shape, angle });
        }
    }
    allLocs.sort((a, b) => (a.id !== b.id ? a.id - b.id : a.key - b.key));

    const out = Packet.alloc(100_000);
    let lastLocId = -1;
    let i = 0;

    while (i < allLocs.length) {
        const id = allLocs[i].id;
        out.pVarSmart(id - lastLocId);
        lastLocId = id;

        let lastLocData = 0;
        while (i < allLocs.length && allLocs[i].id === id) {
            const { key, shape, angle } = allLocs[i++];
            out.psmart(key - lastLocData + 1);
            lastLocData = key;
            out.p1((shape << 2) | angle);
        }
        out.psmart(0);
    }
    out.pVarSmart(0);

    const result = out.data.subarray(0, out.pos);
    out.release();
    return result;
}

function main() {
    const refTableRaw = readFlatFile(255, MAPS_ARCHIVE);
    const mapIndex = new Js5Index(false, false);
    mapIndex.decode(refTableRaw);

    const files = fs.readdirSync(SRC_DIR).filter(f => f.startsWith('m') && f.endsWith('.jm2'));
    const updatedContainers = new Map<number, Uint8Array>();

    const SERVER_MAPS_DIR = 'data/pack/server/maps';
    fs.mkdirSync(SERVER_MAPS_DIR, { recursive: true });

    for (const file of files) {
        const mapXZ = file.slice(1, -4);
        const [mapX, mapZ] = mapXZ.split('_').map(Number);

        const lines = fs
            .readFileSync(path.join(SRC_DIR, file), 'utf8')
            .replace(/\r/g, '')
            .split('\n')
            .filter(x => x.length);

        const { land, loc, npc, obj } = readJm2(lines);

        const landGroupId = mapIndex.getGroupId(`m${mapXZ}`);
        const locGroupId = mapIndex.getGroupId(`l${mapXZ}`);

        let landBytes: Uint8Array | null = null;
        let locBytes: Uint8Array | null = null;

        if (landGroupId !== -1) {
            landBytes = encodeLand(land, mapX, mapZ);
            const container = packGroup(landBytes, 0);

            updatedContainers.set(landGroupId, container);
            fs.mkdirSync(path.join(CACHE_DIR, String(MAPS_ARCHIVE)), { recursive: true });
            fs.writeFileSync(path.join(CACHE_DIR, String(MAPS_ARCHIVE), `${landGroupId}.dat`), container);
        } else {
            console.warn(`No existing land group for m${mapXZ} in the current master index - new map squares aren't supported by this script`);
        }

        if (locGroupId !== -1) {
            locBytes = encodeLocs(loc);
            const container = packGroup(locBytes, 0);

            updatedContainers.set(locGroupId, container);
            fs.mkdirSync(path.join(CACHE_DIR, String(MAPS_ARCHIVE)), { recursive: true });
            fs.writeFileSync(path.join(CACHE_DIR, String(MAPS_ARCHIVE), `${locGroupId}.dat`), container);
        } else {
            console.warn(`No existing loc group for l${mapXZ} in the current master index - new map squares aren't supported by this script`);
        }

        if (landBytes) {
            fs.writeFileSync(path.join(SERVER_MAPS_DIR, `m${mapXZ}`), landBytes);
        }
        if (locBytes) {
            fs.writeFileSync(path.join(SERVER_MAPS_DIR, `l${mapXZ}`), locBytes);
        }
        fs.writeFileSync(path.join(SERVER_MAPS_DIR, `n${mapXZ}`), encodeNpcs(npc));
        fs.writeFileSync(path.join(SERVER_MAPS_DIR, `o${mapXZ}`), encodeObjs(obj));
    }

    const patchedMasterIndex = updateMasterIndex(MAPS_ARCHIVE, updatedContainers, CACHE_DIR);
    writeMasterIndex(patchedMasterIndex, MAPS_ARCHIVE, CACHE_DIR);
 
    const patchedChecksumTable = updateChecksumTable(new Map([[MAPS_ARCHIVE, patchedMasterIndex]]), CACHE_DIR);
    writeChecksumTable(patchedChecksumTable, CACHE_DIR);
}

main();