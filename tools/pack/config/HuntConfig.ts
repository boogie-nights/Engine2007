import fs from 'fs';
import path from 'path';
import Packet from '#/io/Packet.js';
import { HuntCheckNotTooStrong } from '#/engine/entity/hunt/HuntCheckNotTooStrong.js';
import { HuntModeType } from '#/engine/entity/hunt/HuntModeType.js';
import { HuntNobodyNear } from '#/engine/entity/hunt/HuntNobodyNear.js';
import { HuntVis } from '#/engine/entity/hunt/HuntVis.js';
import { NpcMode } from '#/engine/entity/NpcMode.js';
import {
    CACHE_OUT_DIR,
    assembleGroupBuffer,
    packGroup,
    readConfigFile,
    writePackFile,
    loadNameToIdMap,
} from '#tools/util/ConfigPackHelper.ts';

const CONFIG_ARCHIVE = 2;
const HUNT_GROUP = 9;

type HuntOpcode = {
    code: number;
    payload?: any;
};

function hasKey(lines: string[], key: string): boolean {
    return lines.some(line => line.slice(0, line.indexOf('=')).trim() === key);
}

function getValue(line: string): string {
    return line.slice(line.indexOf('=') + 1).trim();
}

function parseCondition(conditionWithVal: string, name: string, field: string): { condition: string; val: number } {
    const condition = conditionWithVal.charAt(0);
    if (!['=', '>', '<', '!'].includes(condition)) {
        throw new Error(`Hunt [${name}] ${field}: invalid condition '${condition}'`);
    }
    const val = parseInt(conditionWithVal.slice(1), 10);
    if (isNaN(val)) {
        throw new Error(`Hunt [${name}] ${field}: invalid value in '${conditionWithVal}'`);
    }
    return { condition, val };
}

function resolveNewMode(value: string): number | null {
    if (value === 'opplayer1') return NpcMode.OPPLAYER1;
    if (value === 'opplayer2') return NpcMode.OPPLAYER2;
    if (value === 'opplayer3') return NpcMode.OPPLAYER3;
    if (value === 'opplayer4') return NpcMode.OPPLAYER4;
    if (value === 'opplayer5') return NpcMode.OPPLAYER5;
    if (value === 'applayer1') return NpcMode.APPLAYER1;
    if (value === 'applayer2') return NpcMode.APPLAYER2;
    if (value === 'applayer3') return NpcMode.APPLAYER3;
    if (value === 'applayer4') return NpcMode.APPLAYER4;
    if (value === 'applayer5') return NpcMode.APPLAYER5;
    if (value === 'queue1') return NpcMode.QUEUE1;
    if (value === 'queue2') return NpcMode.QUEUE2;
    if (value === 'queue3') return NpcMode.QUEUE3;
    if (value === 'queue4') return NpcMode.QUEUE4;
    if (value === 'queue5') return NpcMode.QUEUE5;
    if (value === 'queue6') return NpcMode.QUEUE6;
    if (value === 'queue7') return NpcMode.QUEUE7;
    if (value === 'queue8') return NpcMode.QUEUE8;
    if (value === 'queue9') return NpcMode.QUEUE9;
    if (value === 'queue10') return NpcMode.QUEUE10;
    if (value === 'queue11') return NpcMode.QUEUE11;
    if (value === 'queue12') return NpcMode.QUEUE12;
    if (value === 'queue13') return NpcMode.QUEUE13;
    if (value === 'queue14') return NpcMode.QUEUE14;
    if (value === 'queue15') return NpcMode.QUEUE15;
    if (value === 'queue16') return NpcMode.QUEUE16;
    if (value === 'queue17') return NpcMode.QUEUE17;
    if (value === 'queue18') return NpcMode.QUEUE18;
    if (value === 'queue19') return NpcMode.QUEUE19;
    if (value === 'queue20') return NpcMode.QUEUE20;
    if (value === 'opobj1') return NpcMode.OPOBJ1;
    if (value === 'opobj2') return NpcMode.OPOBJ2;
    if (value === 'opobj3') return NpcMode.OPOBJ3;
    if (value === 'opobj4') return NpcMode.OPOBJ4;
    if (value === 'opobj5') return NpcMode.OPOBJ5;
    if (value === 'apobj1') return NpcMode.APOBJ1;
    if (value === 'apobj2') return NpcMode.APOBJ2;
    if (value === 'apobj3') return NpcMode.APOBJ3;
    if (value === 'apobj4') return NpcMode.APOBJ4;
    if (value === 'apobj5') return NpcMode.APOBJ5;
    if (value === 'opnpc1') return NpcMode.OPNPC1;
    if (value === 'opnpc2') return NpcMode.OPNPC2;
    if (value === 'opnpc3') return NpcMode.OPNPC3;
    if (value === 'opnpc4') return NpcMode.OPNPC4;
    if (value === 'opnpc5') return NpcMode.OPNPC5;
    if (value === 'apnpc1') return NpcMode.APNPC1;
    if (value === 'apnpc2') return NpcMode.APNPC2;
    if (value === 'apnpc3') return NpcMode.APNPC3;
    if (value === 'apnpc4') return NpcMode.APNPC4;
    if (value === 'apnpc5') return NpcMode.APNPC5;
    if (value === 'oploc1') return NpcMode.OPLOC1;
    if (value === 'oploc2') return NpcMode.OPLOC2;
    if (value === 'oploc3') return NpcMode.OPLOC3;
    if (value === 'oploc4') return NpcMode.OPLOC4;
    if (value === 'oploc5') return NpcMode.OPLOC5;
    if (value === 'aploc1') return NpcMode.APLOC1;
    if (value === 'aploc2') return NpcMode.APLOC2;
    if (value === 'aploc3') return NpcMode.APLOC3;
    if (value === 'aploc4') return NpcMode.APLOC4;
    if (value === 'aploc5') return NpcMode.APLOC5;
    return null;
}

function parseHuntFields(
    name: string,
    lines: string[],
    nameMaps: {
        varp: Map<string, number>;
        varn: Map<string, number>;
        category: Map<string, number>;
        npc: Map<string, number>;
        obj: Map<string, number>;
        loc: Map<string, number>;
        inv: Map<string, number>;
        param: Map<string, number>;
    }
): HuntOpcode[] {
    const ops: HuntOpcode[] = [];

    const hasAnyCheckTarget = ['check_category', 'check_npc', 'check_obj', 'check_loc', 'check_inv', 'check_invparam']
        .filter(k => hasKey(lines, k));

    const typeLine = lines.find(l => l.slice(0, l.indexOf('=')).trim() === 'type');
    const typeValue = typeLine ? getValue(typeLine) : 'off';

    let extracheckVarsCount = 0;

    for (const line of lines) {
        const eq = line.indexOf('=');
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim();
        const value = getValue(line);

        if (key === 'type') {
            let mode: number;
            switch (value) {
                case 'off': mode = HuntModeType.OFF; break;
                case 'player': mode = HuntModeType.PLAYER; break;
                case 'npc': mode = HuntModeType.NPC; break;
                case 'obj': mode = HuntModeType.OBJ; break;
                case 'scenery': mode = HuntModeType.SCENERY; break;
                default: throw new Error(`Hunt [${name}]: invalid type '${value}'`);
            }
            if (mode !== HuntModeType.OFF) {
                ops.push({ code: 1, payload: mode });
            }
        } else if (key === 'check_vis') {
            let vis: number;
            switch (value) {
                case 'off': vis = HuntVis.OFF; break;
                case 'lineofsight': vis = HuntVis.LINEOFSIGHT; break;
                case 'lineofwalk': vis = HuntVis.LINEOFWALK; break;
                default: throw new Error(`Hunt [${name}]: invalid check_vis '${value}'`);
            }
            if (vis !== HuntVis.OFF) {
                ops.push({ code: 2, payload: vis });
            }
        } else if (key === 'check_nottoostrong') {
            let check: number;
            switch (value) {
                case 'off': check = HuntCheckNotTooStrong.OFF; break;
                case 'outside_wilderness': check = HuntCheckNotTooStrong.OUTSIDE_WILDERNESS; break;
                default: throw new Error(`Hunt [${name}]: invalid check_nottoostrong '${value}'`);
            }
            if (check !== HuntCheckNotTooStrong.OFF) {
                ops.push({ code: 3, payload: check });
            }
        } else if (key === 'check_notbusy') {
            if (value === 'on') {
                ops.push({ code: 4 });
            } else if (value !== 'off') {
                throw new Error(`Hunt [${name}]: invalid check_notbusy '${value}'`);
            }
        } else if (key === 'find_keephunting') {
            if (value === 'on') {
                ops.push({ code: 5 });
            } else if (value !== 'off') {
                throw new Error(`Hunt [${name}]: invalid find_keephunting '${value}'`);
            }
        } else if (key === 'find_newmode') {
            const mode = resolveNewMode(value);
            if (mode === null) {
                throw new Error(`Hunt [${name}]: invalid find_newmode '${value}'`);
            }
            if (mode !== NpcMode.NONE) {
                ops.push({ code: 6, payload: mode });
            }
        } else if (key === 'nobodynear') {
            let mode: number;
            switch (value) {
                case 'keephunting': mode = HuntNobodyNear.KEEPHUNTING; break;
                case 'pausehunt': mode = HuntNobodyNear.PAUSEHUNT; break;
                default: throw new Error(`Hunt [${name}]: invalid nobodynear '${value}'`);
            }
            if (mode !== HuntNobodyNear.PAUSEHUNT) {
                ops.push({ code: 7, payload: mode });
            }
        } else if (key === 'check_notcombat') {
            if (!value.startsWith('%')) {
                throw new Error(`Hunt [${name}]: check_notcombat must start with '%'`);
            }
            const varp = nameMaps.varp.get(value.slice(1));
            if (varp === undefined) {
                throw new Error(`Hunt [${name}]: unknown varp '${value.slice(1)}'`);
            }
            ops.push({ code: 8, payload: varp });
        } else if (key === 'check_notcombat_self') {
            if (!value.startsWith('%')) {
                throw new Error(`Hunt [${name}]: check_notcombat_self must start with '%'`);
            }
            const varn = nameMaps.varn.get(value.slice(1));
            if (varn === undefined) {
                throw new Error(`Hunt [${name}]: unknown varn '${value.slice(1)}'`);
            }
            ops.push({ code: 9, payload: varn });
        } else if (key === 'check_afk') {
            if (value === 'off') {
                ops.push({ code: 10 });
            } else if (value !== 'on') {
                throw new Error(`Hunt [${name}]: invalid check_afk '${value}'`);
            }
        } else if (key === 'rate') {
            const rate = parseInt(value, 10);
            if (isNaN(rate) || rate < 1 || rate > 255) {
                throw new Error(`Hunt [${name}]: invalid rate '${value}'`);
            }
            if (rate !== 1) {
                ops.push({ code: 11, payload: rate });
            }
        } else if (key === 'check_category') {
            if (hasAnyCheckTarget.length > 1 || hasAnyCheckTarget[0] !== 'check_category') {
                throw new Error(`Hunt [${name}]: check_category cannot be combined with another check_* target`);
            }
            if (!['npc', 'obj', 'scenery'].includes(typeValue)) {
                throw new Error(`Hunt [${name}]: check_category requires type npc/obj/scenery`);
            }
            const category = nameMaps.category.get(value);
            if (category === undefined) {
                throw new Error(`Hunt [${name}]: unknown category '${value}'`);
            }
            ops.push({ code: 12, payload: category });
        } else if (key === 'check_npc') {
            if (hasAnyCheckTarget.length > 1 || hasAnyCheckTarget[0] !== 'check_npc') {
                throw new Error(`Hunt [${name}]: check_npc cannot be combined with another check_* target`);
            }
            if (typeValue !== 'npc') {
                throw new Error(`Hunt [${name}]: check_npc requires type npc`);
            }
            const npc = nameMaps.npc.get(value);
            if (npc === undefined) {
                throw new Error(`Hunt [${name}]: unknown npc '${value}'`);
            }
            ops.push({ code: 13, payload: npc });
        } else if (key === 'check_obj') {
            if (hasAnyCheckTarget.length > 1 || hasAnyCheckTarget[0] !== 'check_obj') {
                throw new Error(`Hunt [${name}]: check_obj cannot be combined with another check_* target`);
            }
            if (typeValue !== 'obj') {
                throw new Error(`Hunt [${name}]: check_obj requires type obj`);
            }
            const obj = nameMaps.obj.get(value);
            if (obj === undefined) {
                throw new Error(`Hunt [${name}]: unknown obj '${value}'`);
            }
            ops.push({ code: 14, payload: obj });
        } else if (key === 'check_loc') {
            if (hasAnyCheckTarget.length > 1 || hasAnyCheckTarget[0] !== 'check_loc') {
                throw new Error(`Hunt [${name}]: check_loc cannot be combined with another check_* target`);
            }
            if (typeValue !== 'scenery') {
                throw new Error(`Hunt [${name}]: check_loc requires type scenery`);
            }
            const loc = nameMaps.loc.get(value);
            if (loc === undefined) {
                throw new Error(`Hunt [${name}]: unknown loc '${value}'`);
            }
            ops.push({ code: 15, payload: loc });
        } else if (key === 'check_inv') {
            if (hasAnyCheckTarget.length > 1 || hasAnyCheckTarget[0] !== 'check_inv') {
                throw new Error(`Hunt [${name}]: check_inv cannot be combined with another check_* target`);
            }
            if (typeValue !== 'player') {
                throw new Error(`Hunt [${name}]: check_inv requires type player`);
            }
            const parts = value.split(',');
            if (parts.length !== 3) {
                throw new Error(`Hunt [${name}]: check_inv expects inv,obj,condition`);
            }
            const inv = nameMaps.inv.get(parts[0]);
            if (inv === undefined) {
                throw new Error(`Hunt [${name}]: unknown inv '${parts[0]}'`);
            }
            const obj = nameMaps.obj.get(parts[1]);
            if (obj === undefined) {
                throw new Error(`Hunt [${name}]: unknown obj '${parts[1]}'`);
            }
            const { condition, val } = parseCondition(parts[2], name, 'check_inv');
            ops.push({ code: 16, payload: { inv, obj, condition, val } });
        } else if (key === 'check_invparam') {
            if (hasAnyCheckTarget.length > 1 || hasAnyCheckTarget[0] !== 'check_invparam') {
                throw new Error(`Hunt [${name}]: check_invparam cannot be combined with another check_* target`);
            }
            if (typeValue !== 'player') {
                throw new Error(`Hunt [${name}]: check_invparam requires type player`);
            }
            const parts = value.split(',');
            if (parts.length !== 3) {
                throw new Error(`Hunt [${name}]: check_invparam expects inv,param,condition`);
            }
            const inv = nameMaps.inv.get(parts[0]);
            if (inv === undefined) {
                throw new Error(`Hunt [${name}]: unknown inv '${parts[0]}'`);
            }
            const param = nameMaps.param.get(parts[1]);
            if (param === undefined) {
                throw new Error(`Hunt [${name}]: unknown param '${parts[1]}'`);
            }
            const { condition, val } = parseCondition(parts[2], name, 'check_invparam');
            ops.push({ code: 17, payload: { inv, param, condition, val } });
        } else if (key === 'extracheck_var') {
            if (extracheckVarsCount > 2) {
                throw new Error(`Hunt [${name}]: limit of 3 extracheck_var properties exceeded`);
            }
            if (typeValue !== 'player') {
                throw new Error(`Hunt [${name}]: extracheck_var requires type player`);
            }
            const parts = value.split(',');
            if (parts.length !== 2) {
                throw new Error(`Hunt [${name}]: extracheck_var expects %varp,condition`);
            }
            if (!parts[0].startsWith('%')) {
                throw new Error(`Hunt [${name}]: extracheck_var varp must start with '%'`);
            }
            const varp = nameMaps.varp.get(parts[0].slice(1));
            if (varp === undefined) {
                throw new Error(`Hunt [${name}]: unknown varp '${parts[0].slice(1)}'`);
            }
            const { condition, val } = parseCondition(parts[1], name, 'extracheck_var');
            ops.push({ code: 18 + extracheckVarsCount, payload: { varp, condition, val } });
            extracheckVarsCount += 1;
        }
    }

    return ops;
}

function encodeHunt(ops: HuntOpcode[], debugName?: string): Uint8Array {
    const buf = new Packet(new Uint8Array(256));

    for (const { code, payload } of ops) {
        buf.p1(code);

        if (code === 1 || code === 2 || code === 3) {
            buf.p1(Number(payload));
        } else if (code === 4 || code === 5 || code === 10) {
        } else if (code === 6) {
            buf.p1(Number(payload));
        } else if (code === 7) {
            buf.p1(Number(payload));
        } else if (code === 8 || code === 9) {
            buf.p2(Number(payload));
        } else if (code === 11) {
            buf.p2(Number(payload));
        } else if (code === 12 || code === 13 || code === 14 || code === 15) {
            buf.p2(Number(payload));
        } else if (code === 16) {
            buf.p2(payload.inv);
            buf.p2(payload.obj);
            buf.pjstr(payload.condition);
            buf.p4(payload.val);
        } else if (code === 17) {
            buf.p2(payload.inv);
            buf.p2(payload.param);
            buf.pjstr(payload.condition);
            buf.p4(payload.val);
        } else if (code >= 18 && code <= 20) {
            buf.p2(payload.varp);
            buf.pjstr(payload.condition);
            buf.p4(payload.val);
        } else {
            throw new Error(`Unrecognized hunt opcode: ${code}`);
        }
    }

    if (debugName) {
        buf.p1(250);
        buf.pjstr(debugName);
    }

    buf.p1(0);
    return new Uint8Array(buf.data.subarray(0, buf.pos));
}

export function pack() {
    const configBlocks = readConfigFile('.hunt');

    if (configBlocks.size === 0) {
        console.error('No .hunt entries found.');
        return;
    }

    const nameMaps = {
        varp: loadNameToIdMap('varp.pack'),
        varn: loadNameToIdMap('varn.pack'),
        category: loadNameToIdMap('category.pack'),
        npc: loadNameToIdMap('npc.pack'),
        obj: loadNameToIdMap('obj.pack'),
        loc: loadNameToIdMap('loc.pack'),
        inv: loadNameToIdMap('inv.pack'),
        param: loadNameToIdMap('param.pack'),
    };
    const names = Array.from(configBlocks.keys()).sort();

    const files: Uint8Array[] = new Array(names.length);
    const packLines: string[] = [];

    for (let id = 0; id < names.length; id++) {
        const debugName = names[id];
        const lines = configBlocks.get(debugName)!;

        try {
            const ops = parseHuntFields(debugName, lines, nameMaps);
            files[id] = encodeHunt(ops, debugName);
        } catch (err) {
            console.error(`Failed to encode hunt [${debugName}]:`, err);
            files[id] = encodeHunt([], debugName);
        }

        packLines.push(`${id}=${debugName}`);
    }

    writePackFile('hunt.pack', packLines);

    const outDir = path.join(CACHE_OUT_DIR, String(CONFIG_ARCHIVE));
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const groupBuffer = assembleGroupBuffer(files);
    const container = packGroup(groupBuffer, null);

    fs.writeFileSync(path.join(outDir, `${HUNT_GROUP}.dat`), container);
}

pack();
