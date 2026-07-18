import fs from 'fs';
import path from 'path';
import Packet from '#/io/Packet.js';
import Js5Index from '#/js5/Js5Index.js';
import {
    CACHE_OUT_DIR,
    INTERFACE_DIR,
    loadNameToIdMap,
    loadStringPackFile,
    parseColour,
    packGroupAuto,
    assembleGroupBuffer,
    readFlatFile,
    updateMasterIndex,
    updateChecksumTable,
    writeMasterIndex,
    writeChecksumTable,
} from '#tools/util/ConfigPackHelper.ts';

function invert(map: Record<number, string>): Record<string, number> {
    const out: Record<string, number> = {};
    for (const k of Object.keys(map)) out[map[Number(k)]] = Number(k);
    return out;
}

const COMPONENT_TYPE_NAMES: Record<number, string> = {
    0: 'Layer', 1: 'Container', 2: 'Inventory', 3: 'Rectangle', 4: 'Text',
    5: 'Sprite', 6: 'Model', 7: 'Item_List', 8: 'Tooltip', 9: 'Line'
};
const BUTTON_TYPE_NAMES: Record<number, string> = {
    0: 'None', 1: 'Button', 2: 'Target', 3: 'Close', 4: 'Toggly', 5: 'Select', 6: 'Pause'
};
const SIZE_ALIGNMENT_NAMES: Record<number, string> = { 0: 'Absolute', 1: 'Offset', 2: 'Percentage', 3: 'Grid' };
const POSITION_ALIGNMENT_NAMES: Record<number, string> = {
    0: 'Absolute', 1: 'Center', 2: 'Bottom_Right', 3: 'Percentage', 4: 'Percentage_Center', 5: 'Percentage_Bottom_Right'
};
const HORIZONTAL_ALIGNMENT_NAMES: Record<number, string> = { 0: 'Left', 1: 'Center', 2: 'Right' };
const VERTICAL_ALIGNMENT_NAMES: Record<number, string> = { 0: 'Top', 1: 'Center', 2: 'Bottom' };
const MODEL_TYPE_NAMES: Record<number, string> = {
    0: 'None', 1: 'Model', 2: 'NPC_Head', 3: 'Player_Head', 4: 'Item', 5: 'Player_Model', 6: 'NPC_Model'
};

const FONT_NAMES: Record<number, string> = {
    305: 'friendslist_font',
    307: 'tutorial_font',
    492: 'glyphs',
    494: 'p11_full',
    495: 'p12_full',
    496: 'b12_full',
    497: 'q8_full',
    584: 'tutorial_font_big',
    645: 'quill_oblique_large',
    646: 'quill_caps_large',
    647: 'lunar_alphabet',
    648: 'lunar_alphabet_lrg',
    764: 'barbassault_font',
    776: 'tzhaar_numbers',
    819: 'surok_font'
};

const COMPONENT_TYPE_IDS = invert(COMPONENT_TYPE_NAMES);
const BUTTON_TYPE_IDS = invert(BUTTON_TYPE_NAMES);
const SIZE_ALIGNMENT_IDS = invert(SIZE_ALIGNMENT_NAMES);
const POSITION_ALIGNMENT_IDS = invert(POSITION_ALIGNMENT_NAMES);
const HORIZONTAL_ALIGNMENT_IDS = invert(HORIZONTAL_ALIGNMENT_NAMES);
const VERTICAL_ALIGNMENT_IDS = invert(VERTICAL_ALIGNMENT_NAMES);
const MODEL_TYPE_IDS = invert(MODEL_TYPE_NAMES);
const FONT_IDS = invert(FONT_NAMES);

const HOOK_INT_LITERALS: Record<number, string> = {
    [-2147483647]: 'mouseX', [-2147483646]: 'mouseY', [-2147483645]: 'component.parentId',
    [-2147483644]: 'opindex', [-2147483643]: 'component.subId', [-2147483642]: 'drop.parentId',
    [-2147483641]: 'drop.subId', [-2147483640]: 'keyCode', [-2147483639]: 'keyChar'
};
const HOOK_INT_LITERAL_IDS = invert(HOOK_INT_LITERALS);

const COMPARATOR_IDS: Record<string, number> = { eq: 1, lt: 2, gt: 3, neq: 4 };

const TARGET_MASK_IDS: Record<string, number> = {
    obj: 0x1, npc: 0x2, loc: 0x4, player: 0x8, inv_item: 0x10, component: 0x20
};

function splitEventCodeFlags(str: string): string[] {
    const flags: string[] = [];
    let cur = '';
    let depth = 0;
    for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        if (ch === '(') depth++;
        else if (ch === ')') depth--;

        if (ch === ',' && depth === 0) {
            flags.push(cur.trim());
            cur = '';
        } else {
            cur += ch;
        }
    }
    if (cur.trim()) flags.push(cur.trim());
    return flags;
}

function parseEventCode(str: string | undefined): number {
    if (!str) return 0;
    let eventCode = 0;

    for (const rawFlag of splitEventCodeFlags(str).filter(Boolean)) {
        if (rawFlag === 'pauseButton') {
            eventCode |= 0x1;
        } else if (rawFlag.startsWith('hasOp(')) {
            const ops = rawFlag.slice(6, -1).split(',').map(s => parseInt(s.trim(), 10));
            for (const opIndex of ops) eventCode |= 0x1 << opIndex;
        } else if (rawFlag.startsWith('targetMask=')) {
            const names = rawFlag.slice('targetMask='.length).split('|');
            let mask = 0;
            for (const n of names) {
                if (n.startsWith('unknown(')) {
                    mask |= parseInt(n.slice(8, -1), 16);
                } else {
                    mask |= TARGET_MASK_IDS[n] ?? 0;
                }
            }
            eventCode |= (mask & 0x3f) << 11;
        } else if (rawFlag.startsWith('serverDraggable=')) {
            const depth = parseInt(rawFlag.slice('serverDraggable='.length), 10);
            eventCode |= (depth & 0x7) << 17;
        } else if (rawFlag === 'isDragTarget') {
            eventCode |= 0x1 << 20;
        } else if (rawFlag === 'isUseTarget') {
            eventCode |= 0x1 << 21;
        } else if (rawFlag === 'flag22') {
            eventCode |= 0x1 << 22;
        } else if (rawFlag.startsWith('hasIop(')) {
            const iops = rawFlag.slice(7, -1).split(',').map(s => parseInt(s.trim(), 10));
            for (const iopIndex of iops) eventCode |= 0x1 << (iopIndex + 23);
        } else if (rawFlag === 'objSwapEnabled') {
            eventCode |= 0x1 << 28;
        } else if (rawFlag === 'objReplaceEnabled') {
            eventCode |= 0x1 << 29;
        } else if (rawFlag === 'objOpsEnabled') {
            eventCode |= 0x1 << 30;
        } else if (rawFlag === 'objUseEnabled') {
            eventCode |= 1 << 31;
        } else if (rawFlag.startsWith('unknown(0x')) {
            eventCode |= parseInt(rawFlag.slice(10, -1), 16) | 0;
        }
    }

    return eventCode;
}

function splitHookEntries(raw: string): string[] {
    const entries: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (ch === '"' && raw[i - 1] !== '\\') {
            inQuotes = !inQuotes;
            cur += ch;
        } else if (ch === ',' && !inQuotes) {
            entries.push(cur);
            cur = '';
        } else {
            cur += ch;
        }
    }
    if (cur.length > 0) entries.push(cur);
    return entries;
}

function parseHook(raw: string | undefined): (number | string | null)[] | null {
    if (!raw) return null;
    return splitHookEntries(raw).map(entry => {
        const t = entry.trim();
        if (t === 'null') return null;
        if (t.startsWith('"') && t.endsWith('"')) {
            return t.slice(1, -1).replace(/\\"/g, '"');
        }
        if (HOOK_INT_LITERAL_IDS[t] !== undefined) return HOOK_INT_LITERAL_IDS[t];
        const n = parseInt(t, 10);
        return isNaN(n) ? null : n;
    });
}

function parseIntArray(raw: string | undefined): number[] | null {
    if (!raw) return null;
    return raw.split(',').map(s => parseInt(s.trim(), 10));
}

class UnencodableScript extends Error {}

interface ScriptTermRaw { operator: string; opName: string; args: string[]; }

function parseScriptTermLine(raw: string): ScriptTermRaw {
    const parts = raw.split(',').map(s => s.trim());
    if (parts[0] === 'sub' || parts[0] === 'mul' || parts[0] === 'div') {
        return { operator: parts[0], opName: parts[1], args: parts.slice(2) };
    }
    return { operator: 'add', opName: parts[0], args: parts.slice(1) };
}

function encodeScriptTerm(
    term: ScriptTermRaw,
    out: number[],
    componentNameToLoc: Map<string, { group: number; file: number }>,
    objNameToId: Map<string, number>,
    varbitNameToId: Map<string, number>,
    varpNameToId: Map<string, number>
): void {
    if (term.operator === 'sub') out.push(15);
    else if (term.operator === 'mul') out.push(17);
    else if (term.operator === 'div') out.push(16);

    const { opName, args } = term;
    if (opName === 'stat_level') {
        out.push(1, parseInt(args[0], 10));
    } else if (opName === 'stat_base') {
        out.push(2, parseInt(args[0], 10));
    } else if (opName === 'stat_xp') {
        out.push(3, parseInt(args[0], 10));
    } else if (opName === 'inv_count' || opName === 'inv_contains') {
        const loc = componentNameToLoc.get(args[0]);
        if (!loc) throw new UnencodableScript(`Unknown component ref '${args[0]}' in condition`);
        const objName = args[1];
        const objId = objName === 'none' ? -1 : (objNameToId.get(objName) ?? parseInt(objName.replace('obj_', ''), 10));
        out.push(opName === 'inv_count' ? 4 : 10, loc.group, loc.file, objId === -1 ? 65535 : objId);
    } else if (opName === 'varp') {
        const id = varpNameToId.get(args[0]) ?? parseInt(args[0].replace('varp_', ''), 10);
        out.push(5, id);
    } else if (opName === 'xp_for_level') {
        out.push(6, parseInt(args[0], 10));
    } else if (opName === 'varp_percent') {
        const id = varpNameToId.get(args[0]) ?? parseInt(args[0].replace('varp_', ''), 10);
        out.push(7, id);
    } else if (opName === 'combat_level') {
        out.push(8);
    } else if (opName === 'total_level') {
        out.push(9);
    } else if (opName === 'run_energy') {
        out.push(11);
    } else if (opName === 'run_weight') {
        out.push(12);
    } else if (opName === 'varp_bit') {
        const id = varpNameToId.get(args[0]) ?? parseInt(args[0].replace('varp_', ''), 10);
        out.push(13, id, parseInt(args[1], 10));
    } else if (opName === 'varbit') {
        const id = varbitNameToId.get(args[0]) ?? parseInt(args[0].replace('varbit_', ''), 10);
        out.push(14, id);
    } else if (opName === 'local_x') {
        out.push(18);
    } else if (opName === 'local_z') {
        out.push(19);
    } else if (opName === 'num') {
        out.push(20, parseInt(args[0], 10));
    } else if (/^unknown_op\d+$/.test(opName)) {
        throw new UnencodableScript(`${opName} cannot be re-encoded (operand lost on unpack)`);
    } else {
        throw new UnencodableScript(`Unrecognized condition opcode '${opName}'`);
    }
}

function encodeScriptTerms(
    termsForN: Map<number, string> | undefined,
    componentNameToLoc: Map<string, { group: number; file: number }>,
    objNameToId: Map<string, number>,
    varbitNameToId: Map<string, number>,
    varpNameToId: Map<string, number>
): Int32Array {
    const out: number[] = [];
    if (termsForN) {
        const ks = Array.from(termsForN.keys()).sort((a, b) => a - b);
        for (let idx = 0; idx < ks.length; idx++) {
            if (ks[idx] !== idx + 1) {
                throw new Error(`script op indices must be contiguous starting at op1, got a gap before op${ks[idx]}`);
            }
        }
        for (const k of ks) {
            encodeScriptTerm(parseScriptTermLine(termsForN.get(k)!), out, componentNameToLoc, objNameToId, varbitNameToId, varpNameToId);
        }
    }
    out.push(0);
    return Int32Array.from(out);
}

interface ParsedComponent {
    [key: string]: any;
}

function parseComponentBlock(shortName: string, lines: string[]): ParsedComponent {
    const c: ParsedComponent = {
        buttonType: 0, clientCode: 0, x: 0, y: 0, width: 0, height: 0,
        widthAlignment: 0, heightAlignment: 0, xAlignment: 0, yAlignment: 0,
        layerId: -1, overLayerId: -1, hide: false, trans: 0,
        scrollWidth: 0, scrollHeight: 0, noClickThrough: false,
        colour: 0, colour2: 0, colourOver: 0, colour2Over: 0, fill: false,
        hAlign: 0, vAlign: 0, lineHeight: 0, font: -1, shadow: false,
        text: '', text2: '',
        graphic: -1, graphic2: -1, rotate: 0, tiling: false, field3477: false, outline: 0, shadowColour: 0, vFlip: false, hFlip: false,
        model1Type: 1, model1Id: -1, model2Type: 1, model2Id: -1, modelAnim: -1, modelAnim2: -1,
        modelZoom: 100, modelXAn: 0, modelYAn: 0, modelZAn: 0, modelXOf: 0, modelYOf: 0,
        orthog: false, modelBaseWidth: 0, modelBaseHeight: 0,
        discardedField1: null, discardedField2: null, discardedModelField: null,
        lineWidth: 1, lineDirection: false,
        marginX: 0, marginY: 0, iop: [null, null, null, null, null],
        invBackground: null, invBackgroundX: null, invBackgroundY: null, invBackgroundPresent: null,
        targetVerb: '', targetBase: '', buttonText: null,
        eventCode: 0, hotkeys: null,
        baseOpName: '', opNames: null,
        dragdeadzone: 0, dragdeadtime: 0, draggablebehavior: false,
        scriptCompRaw: null, scriptTermsRaw: null,
        onload: null, onmouseover: null, onmouseleave: null, ontargetleave: null, ontargetenter: null,
        onvartransmit: null, oninvtransmit: null, onstattransmit: null, ontimer: null, onop: null,
        onmouserepeat: null, onclick: null, onclickrepeat: null, onrelease: null, onhold: null,
        ondrag: null, ondragcomplete: null, onscrollwheel: null,
        onvartransmitlist: null, oninvtransmitlist: null, onstattransmitlist: null,
    };

    for (const line of lines) {
        const eqIdx = line.indexOf('=');
        if (eqIdx === -1) continue;
        const rawKey = line.slice(0, eqIdx).trim();
        const val = line.slice(eqIdx + 1).trim();
        const key = rawKey.replace(/#\d+$/, '');
        const unquote = (s: string) => (s.startsWith('"') && s.endsWith('"')) ? s.slice(1, -1).replace(/\\"/g, '"') : s;

        let m: RegExpMatchArray | null;
        if (key === 'type') c.type = COMPONENT_TYPE_IDS[val] ?? parseInt(val, 10);
        else if (key === 'buttonType') c.buttonType = BUTTON_TYPE_IDS[val] ?? parseInt(val, 10);
        else if (key === 'clientCode') c.clientCode = parseInt(val, 10);
        else if (key === 'x') c.x = parseInt(val, 10);
        else if (key === 'y') c.y = parseInt(val, 10);
        else if (key === 'width') c.width = parseInt(val, 10);
        else if (key === 'height') c.height = parseInt(val, 10);
        else if (key === 'widthAlignment') c.widthAlignment = SIZE_ALIGNMENT_IDS[val] ?? parseInt(val, 10);
        else if (key === 'heightAlignment') c.heightAlignment = SIZE_ALIGNMENT_IDS[val] ?? parseInt(val, 10);
        else if (key === 'xAlignment') c.xAlignment = POSITION_ALIGNMENT_IDS[val] ?? parseInt(val, 10);
        else if (key === 'yAlignment') c.yAlignment = POSITION_ALIGNMENT_IDS[val] ?? parseInt(val, 10);
        else if (key === 'layerId') c.layerId = parseInt(val, 10);
        else if (key === 'overLayerId') c.overLayerId = parseInt(val, 10);
        else if (key === 'hide') c.hide = val === 'yes';
        else if (key === 'trans') c.trans = parseInt(val, 10);
        else if (key === 'scrollWidth') c.scrollWidth = parseInt(val, 10);
        else if (key === 'scrollHeight') c.scrollHeight = parseInt(val, 10);
        else if (key === 'noClickThrough') c.noClickThrough = val === 'yes';
        else if (key === 'colour') c.colour = parseColour(val);
        else if (key === 'colour2') c.colour2 = parseColour(val);
        else if (key === 'colourOver') c.colourOver = parseColour(val);
        else if (key === 'colour2Over') c.colour2Over = parseColour(val);
        else if (key === 'fill') c.fill = val === 'yes';
        else if (key === 'hAlign') c.hAlign = HORIZONTAL_ALIGNMENT_IDS[val] ?? parseInt(val, 10);
        else if (key === 'vAlign') c.vAlign = VERTICAL_ALIGNMENT_IDS[val] ?? parseInt(val, 10);
        else if (key === 'lineHeight') c.lineHeight = parseInt(val, 10);
        else if (key === 'font') c.font = FONT_IDS[val] ?? parseInt(val, 10);
        else if (key === 'shadow') c.shadow = val === 'yes';
        else if (key === 'text') c.text = unquote(val);
        else if (key === 'text2') c.text2 = unquote(val);
        else if (key === 'graphic') c.graphic = parseInt(val, 10);
        else if (key === 'graphic2') c.graphic2 = parseInt(val, 10);
        else if (key === 'rotate') c.rotate = parseInt(val, 10);
        else if (key === 'tiling') c.tiling = val === 'yes';
        else if (key === 'field3477') c.field3477 = val === 'yes';
        else if (key === 'outline') c.outline = parseInt(val, 10);
        else if (key === 'shadowColour') c.shadowColour = parseColour(val);
        else if (key === 'vFlip') c.vFlip = val === 'yes';
        else if (key === 'hFlip') c.hFlip = val === 'yes';
        else if (key === 'model1Type') c.model1Type = MODEL_TYPE_IDS[val] ?? parseInt(val, 10);
        else if (key === 'model1Id') c.model1Id = parseInt(val, 10);
        else if (key === 'model2Type') c.model2Type = MODEL_TYPE_IDS[val] ?? parseInt(val, 10);
        else if (key === 'model2Id') c.model2Id = parseInt(val, 10);
        else if (key === 'modelAnim') c.modelAnimName = val;
        else if (key === 'modelAnim2') c.modelAnim2Name = val;
        else if (key === 'modelZoom') c.modelZoom = parseInt(val, 10);
        else if (key === 'modelXAn') c.modelXAn = parseInt(val, 10);
        else if (key === 'modelYAn') c.modelYAn = parseInt(val, 10);
        else if (key === 'modelZAn') c.modelZAn = parseInt(val, 10);
        else if (key === 'modelXOf') c.modelXOf = parseInt(val, 10);
        else if (key === 'modelYOf') c.modelYOf = parseInt(val, 10);
        else if (key === 'orthog') c.orthog = val === 'yes';
        else if (key === 'discardedField1') c.discardedField1 = parseInt(val, 10);
        else if (key === 'discardedField2') c.discardedField2 = parseInt(val, 10);
        else if (key === 'discardedModelField') c.discardedModelField = parseInt(val, 10);
        else if (key === 'modelBaseWidth') c.modelBaseWidth = parseInt(val, 10);
        else if (key === 'modelBaseHeight') c.modelBaseHeight = parseInt(val, 10);
        else if (key === 'lineWidth') c.lineWidth = parseInt(val, 10);
        else if (key === 'lineDirection') c.lineDirection = val === 'yes';
        else if (key === 'marginX') c.marginX = parseInt(val, 10);
        else if (key === 'marginY') c.marginY = parseInt(val, 10);
        else if ((m = rawKey.match(/^iop(\d)$/))) c.iop[parseInt(m[1], 10)] = unquote(val);
        else if ((m = rawKey.match(/^invBackground(\d+)$/))) {
            if (!c.invBackground) {
                c.invBackground = new Int32Array(20).fill(-1);
                c.invBackgroundX = new Int16Array(20);
                c.invBackgroundY = new Int16Array(20);
                c.invBackgroundPresent = new Array(20).fill(false);
            }
            const idx = parseInt(m[1], 10);
            const parts = val.split(',').map(s => parseInt(s.trim(), 10));
            c.invBackgroundX[idx] = parts[0];
            c.invBackgroundY[idx] = parts[1];
            c.invBackground[idx] = parts[2];
            c.invBackgroundPresent[idx] = true;
        }
        else if (key === 'targetVerb') c.targetVerb = unquote(val);
        else if (key === 'targetBase') c.targetBase = unquote(val);
        else if (key === 'buttonText') c.buttonText = unquote(val);
        else if (key === 'eventCode') c.eventCode = parseEventCode(val);
        else if (key === 'hotkeys') c.hotkeys = parseIntArray(val);
        else if (key === 'baseOpName') c.baseOpName = unquote(val);
        else if ((m = rawKey.match(/^opName(\d+)$/))) {
            if (!c.opNames) c.opNames = [];
            c.opNames[parseInt(m[1], 10)] = unquote(val);
        }
        else if (key === 'dragdeadzone') c.dragdeadzone = parseInt(val, 10);
        else if (key === 'dragdeadtime') c.dragdeadtime = parseInt(val, 10);
        else if (key === 'draggablebehavior') c.draggablebehavior = val === 'yes';
        else if ((m = rawKey.match(/^script(\d+)op(\d+)$/))) {
            const n = parseInt(m[1], 10);
            const k = parseInt(m[2], 10);
            if (!c.scriptTermsRaw) c.scriptTermsRaw = new Map<number, Map<number, string>>();
            let termsForN = c.scriptTermsRaw.get(n);
            if (!termsForN) {
                termsForN = new Map<number, string>();
                c.scriptTermsRaw.set(n, termsForN);
            }
            termsForN.set(k, val);
        }
        else if ((m = rawKey.match(/^script(\d+)$/))) {
            const n = parseInt(m[1], 10);
            if (!c.scriptCompRaw) c.scriptCompRaw = new Map<number, string>();
            c.scriptCompRaw.set(n, val);
        }
        else if ([
            'onload', 'onmouseover', 'onmouseleave', 'ontargetleave', 'ontargetenter',
            'onvartransmit', 'oninvtransmit', 'onstattransmit', 'ontimer', 'onop',
            'onmouserepeat', 'onclick', 'onclickrepeat', 'onrelease', 'onhold',
            'ondrag', 'ondragcomplete', 'onscrollwheel'
        ].includes(key)) {
            c[key] = parseHook(val);
        }
        else if (key === 'onvartransmitlist') c.onvartransmitlist = parseIntArray(val);
        else if (key === 'oninvtransmitlist') c.oninvtransmitlist = parseIntArray(val);
        else if (key === 'onstattransmitlist') c.onstattransmitlist = parseIntArray(val);
    }

    return c;
}

interface IfFileBlock { shortName: string; lines: string[]; }

function readIfFile(filePath: string): IfFileBlock[] {
    const blocks: IfFileBlock[] = [];
    const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/);
    let currentName: string | null = null;
    let currentLines: string[] = [];

    for (let lineNo = 0; lineNo < lines.length; lineNo++) {
        const line = lines[lineNo];
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (/^\[.*]$/.test(trimmed) && !/^\[(.+)]$/.test(trimmed)) {
            throw new Error(
                `${filePath}:${lineNo + 1}: malformed empty block header "${trimmed}". ` +
                `This would silently merge the surrounding blocks — refusing to pack this file. ` +
                `Regenerate it from unpack.ts (which now guards against emitting this) or fix the name manually.`
            );
        }

        const headerMatch = trimmed.match(/^\[(.+)]$/);
        if (headerMatch) {
            if (currentName !== null) blocks.push({ shortName: currentName, lines: currentLines });
            currentName = headerMatch[1];
            currentLines = [];
        } else if (currentName !== null) {
            currentLines.push(trimmed);
        }
    }
    if (currentName !== null) blocks.push({ shortName: currentName, lines: currentLines });
    return blocks;
}

function encodeHook(buf: Packet, hook: (number | string | null)[] | null): void {
    if (!hook || hook.length === 0) {
        buf.p1(0);
        return;
    }
    buf.p1(hook.length);
    for (const entry of hook) {
        if (typeof entry === 'string') {
            buf.p1(1);
            (buf as any).pjstr(entry);
        } else {
            buf.p1(0);
            buf.p4(entry ?? 0);
        }
    }
}

function encodeTransmitList(buf: Packet, arr: number[] | null): void {
    if (!arr || arr.length === 0) {
        buf.p1(0);
        return;
    }
    buf.p1(arr.length);
    for (const v of arr) buf.p4(v);
}

function resolveButtonText(c: ParsedComponent): string {
    if (c.buttonText !== null && c.buttonText !== undefined) return c.buttonText;
    if (c.buttonType === 1) return 'OK';
    if (c.buttonType === 4 || c.buttonType === 5) return 'Select';
    if (c.buttonType === 6) return 'Continue';
    return '';
}

interface EncodeCtx {
    parentId: number;
    seqNameToId: Map<string, number>;
    objNameToId: Map<string, number>;
    varbitNameToId: Map<string, number>;
    varpNameToId: Map<string, number>;
    componentNameToLoc: Map<string, { group: number; file: number }>;
}

function resolveSeq(name: string, seqNameToId: Map<string, number>): number {
    if (name === '-1') return -1;
    const m = name.match(/^seq_(\d+)$/);
    if (m) return parseInt(m[1], 10);
    const num = parseInt(name, 10);
    if (!isNaN(num)) return num;
    return seqNameToId.get(name) ?? -1;
}

function encodeConditions(c: ParsedComponent, ctx: EncodeCtx): { comparator: number[]; operand: number[]; scripts: Int32Array[] } {
    const comparator: number[] = [];
    const operand: number[] = [];
    const scripts: Int32Array[] = [];

    const compRaw: Map<number, string> | null = c.scriptCompRaw ?? null;
    const termsRaw: Map<number, Map<number, string>> | null = c.scriptTermsRaw ?? null;

    if (!compRaw && !termsRaw) {
        return { comparator, operand, scripts };
    }

    const condNs = compRaw ? Array.from(compRaw.keys()).sort((a, b) => a - b) : [];
    for (let i = 0; i < condNs.length; i++) {
        if (condNs[i] !== i + 1) {
            throw new Error(`Condition indices must be contiguous starting at script1, got a gap before script${condNs[i]}`);
        }
    }
    const condCount = condNs.length;

    let sawMissingScript = false;
    for (let i = 0; i < condCount; i++) {
        const n = i + 1;
        const [cmpName, valStr] = compRaw!.get(n)!.split(',').map(s => s.trim());
        let cmpId = COMPARATOR_IDS[cmpName];
        if (cmpId === undefined) {
            const m = cmpName.match(/^cmp(\d+)$/);
            cmpId = m ? parseInt(m[1], 10) : 1;
        }
        comparator.push(cmpId);
        operand.push(parseInt(valStr, 10));

        const termsForN = termsRaw?.get(n);
        if (termsForN) {
            if (sawMissingScript) {
                throw new Error(
                    `script${n} has op terms, but an earlier condition in this component had none. ` +
                    `A script can only be missing from the trailing conditions, not a middle gap.`
                );
            }
            scripts.push(encodeScriptTerms(termsForN, ctx.componentNameToLoc, ctx.objNameToId, ctx.varbitNameToId, ctx.varpNameToId));
        } else {
            sawMissingScript = true;
        }
    }

    if (termsRaw) {
        const bareNs = Array.from(termsRaw.keys()).filter(n => n > condCount).sort((a, b) => a - b);
        for (let i = 0; i < bareNs.length; i++) {
            if (bareNs[i] !== condCount + i + 1) {
                throw new Error(`Bare trailing script indices must be contiguous immediately after script${condCount}, got a gap before script${bareNs[i]}`);
            }
        }
        for (const n of bareNs) {
            scripts.push(encodeScriptTerms(termsRaw.get(n), ctx.componentNameToLoc, ctx.objNameToId, ctx.varbitNameToId, ctx.varpNameToId));
        }
    }

    return { comparator, operand, scripts };
}

function encodeComponent3(c: ParsedComponent, ctx: EncodeCtx): Uint8Array {
    const buf = new Packet(new Uint8Array(4096));

    buf.p1(0xff);
    buf.p1(c.type);
    buf.p2(c.clientCode);
    buf.p2(c.x);
    buf.p2(c.y);
    buf.p2(c.width);
    buf.p2(c.height);
    buf.p1(c.widthAlignment);
    buf.p1(c.heightAlignment);
    buf.p1(c.xAlignment);
    buf.p1(c.yAlignment);

    if (c.layerId === -1) {
        buf.p2(65535);
    } else {
        buf.p2((c.layerId - (ctx.parentId & 0xffff0000)) & 0xffff);
    }
    buf.p1(c.hide ? 1 : 0);

    if (c.type === 0) {
        buf.p2(c.scrollWidth);
        buf.p2(c.scrollHeight);
        buf.p1(c.noClickThrough ? 1 : 0);
    }
    if (c.type === 5) {
        buf.p4(c.graphic);
        buf.p2(c.rotate);
        buf.p1((c.tiling ? 0x1 : 0) | (c.field3477 ? 0x2 : 0));
        buf.p1(c.trans);
        buf.p1(c.outline);
        buf.p4(c.shadowColour);
        buf.p1(c.vFlip ? 1 : 0);
        buf.p1(c.hFlip ? 1 : 0);
    }
    if (c.type === 6) {
        buf.p2(c.model1Id === -1 ? 65535 : c.model1Id);
        buf.p2(c.modelXOf);
        buf.p2(c.modelYOf);
        buf.p2(c.modelXAn);
        buf.p2(c.modelYAn);
        buf.p2(c.modelZAn);
        buf.p2(c.modelZoom);
        buf.p2(c.modelAnimName !== undefined ? (resolveSeq(c.modelAnimName, ctx.seqNameToId) === -1 ? 65535 : resolveSeq(c.modelAnimName, ctx.seqNameToId)) : 65535);
        buf.p1(c.orthog ? 1 : 0);
        buf.p2(c.discardedModelField ?? 0);
        if (c.widthAlignment !== 0) buf.p2(c.modelBaseWidth);
        if (c.heightAlignment !== 0) buf.p2(c.modelBaseHeight);
    }
    if (c.type === 4) {
        buf.p2(c.font === -1 ? 65535 : c.font);
        (buf as any).pjstr(c.text ?? '');
        buf.p1(c.lineHeight);
        buf.p1(c.hAlign);
        buf.p1(c.vAlign);
        buf.p1(c.shadow ? 1 : 0);
        buf.p4(c.colour);
    }
    if (c.type === 3) {
        buf.p4(c.colour);
        buf.p1(c.fill ? 1 : 0);
        buf.p1(c.trans);
    }
    if (c.type === 9) {
        buf.p1(c.lineWidth);
        buf.p4(c.colour);
        buf.p1(c.lineDirection ? 1 : 0);
    }

    buf.p3(c.eventCode >>> 0);

    if (c.hotkeys && c.hotkeys.length > 0) {
        buf.p1(c.hotkeys.length);
        for (const h of c.hotkeys) buf.p1(h & 0xff);
    } else {
        buf.p1(0);
    }

    (buf as any).pjstr(c.baseOpName ?? '');

    if (c.opNames && c.opNames.length > 0) {
        buf.p1(c.opNames.length);
        for (const n of c.opNames) (buf as any).pjstr(n ?? '');
    } else {
        buf.p1(0);
    }

    buf.p1(c.dragdeadzone);
    buf.p1(c.dragdeadtime);
    buf.p1(c.draggablebehavior ? 1 : 0);
    (buf as any).pjstr(c.targetVerb ?? '');

    encodeHook(buf, c.onload);
    encodeHook(buf, c.onmouseover);
    encodeHook(buf, c.onmouseleave);
    encodeHook(buf, c.ontargetleave);
    encodeHook(buf, c.ontargetenter);
    encodeHook(buf, c.onvartransmit);
    encodeHook(buf, c.oninvtransmit);
    encodeHook(buf, c.onstattransmit);
    encodeHook(buf, c.ontimer);
    encodeHook(buf, c.onop);
    encodeHook(buf, c.onmouserepeat);
    encodeHook(buf, c.onclick);
    encodeHook(buf, c.onclickrepeat);
    encodeHook(buf, c.onrelease);
    encodeHook(buf, c.onhold);
    encodeHook(buf, c.ondrag);
    encodeHook(buf, c.ondragcomplete);
    encodeHook(buf, c.onscrollwheel);
    encodeTransmitList(buf, c.onvartransmitlist);
    encodeTransmitList(buf, c.oninvtransmitlist);
    encodeTransmitList(buf, c.onstattransmitlist);

    return buf.data.subarray(0, buf.pos);
}

function encodeComponentOld(c: ParsedComponent, ctx: EncodeCtx): Uint8Array {
    const buf = new Packet(new Uint8Array(4096));

    buf.p1(c.type);
    buf.p1(c.buttonType);
    buf.p2(c.clientCode);
    buf.p2(c.x);
    buf.p2(c.y);
    buf.p2(c.width);
    buf.p2(c.height);
    buf.p1(c.trans);

    if (c.layerId === -1) {
        buf.p2(65535);
    } else {
        buf.p2((c.layerId - (ctx.parentId & 0xffff0000)) & 0xffff);
    }
    buf.p2(c.overLayerId === -1 ? 65535 : c.overLayerId);

    const { comparator, operand, scripts } = encodeConditions(c, ctx);
    if (comparator.length > 0) {
        buf.p1(comparator.length);
        for (let i = 0; i < comparator.length; i++) {
            buf.p1(comparator[i]);
            buf.p2(operand[i]);
        }
    } else {
        buf.p1(0);
    }

    if (scripts.length > 0) {
        buf.p1(scripts.length);
        for (const script of scripts) {
            buf.p2(script.length);
            for (const v of script) buf.p2(v === -1 ? 65535 : v);
        }
    } else {
        buf.p1(0);
    }

    if (c.type === 0) {
        buf.p2(c.scrollHeight);
        buf.p1(c.hide ? 1 : 0);
    }
    if (c.type === 1) {
        buf.p2(c.discardedField1 ?? 0);
        buf.p1(c.discardedField2 ?? 0);
    }
    if (c.type === 2) {
        buf.p1((c.eventCode & 0x10000000) ? 1 : 0);
        buf.p1((c.eventCode & 0x40000000) ? 1 : 0);
        buf.p1((c.eventCode & 0x80000000) ? 1 : 0);
        buf.p1((c.eventCode & 0x20000000) ? 1 : 0);
        buf.p1(c.marginX);
        buf.p1(c.marginY);

        for (let i = 0; i < 20; i++) {
            if (c.invBackgroundPresent?.[i]) {
                buf.p1(1);
                buf.p2(c.invBackgroundX[i]);
                buf.p2(c.invBackgroundY[i]);
                buf.p4(c.invBackground[i]);
            } else {
                buf.p1(0);
            }
        }
        for (let i = 0; i < 5; i++) (buf as any).pjstr(c.iop[i] ?? '');
    }
    if (c.type === 3) {
        buf.p1(c.fill ? 1 : 0);
    }
    if (c.type === 4 || c.type === 1) {
        buf.p1(c.hAlign);
        buf.p1(c.vAlign);
        buf.p1(c.lineHeight);
        buf.p2(c.font === -1 ? 65535 : c.font);
        buf.p1(c.shadow ? 1 : 0);
    }
    if (c.type === 4) {
        (buf as any).pjstr(c.text ?? '');
        (buf as any).pjstr(c.text2 ?? '');
    }
    if (c.type === 1 || c.type === 3 || c.type === 4) {
        buf.p4(c.colour);
    }
    if (c.type === 3 || c.type === 4) {
        buf.p4(c.colour2);
        buf.p4(c.colourOver);
        buf.p4(c.colour2Over);
    }
    if (c.type === 5) {
        buf.p4(c.graphic);
        buf.p4(c.graphic2);
    }
    if (c.type === 6) {
        buf.p2(c.model1Id === -1 ? 65535 : c.model1Id);
        buf.p2(c.model2Id === -1 ? 65535 : c.model2Id);
        buf.p2(c.modelAnimName !== undefined ? (resolveSeq(c.modelAnimName, ctx.seqNameToId) === -1 ? 65535 : resolveSeq(c.modelAnimName, ctx.seqNameToId)) : 65535);
        buf.p2(c.modelAnim2Name !== undefined ? (resolveSeq(c.modelAnim2Name, ctx.seqNameToId) === -1 ? 65535 : resolveSeq(c.modelAnim2Name, ctx.seqNameToId)) : 65535);
        buf.p2(c.modelZoom);
        buf.p2(c.modelXAn);
        buf.p2(c.modelYAn);
    }
    if (c.type === 7) {
        buf.p1(c.hAlign);
        buf.p2(c.font === -1 ? 65535 : c.font);
        buf.p1(c.shadow ? 1 : 0);
        buf.p4(c.colour);
        buf.p2(c.marginX);
        buf.p2(c.marginY);
        buf.p1((c.eventCode & 0x40000000) ? 1 : 0);
        for (let i = 0; i < 5; i++) (buf as any).pjstr(c.iop[i] ?? '');
    }
    if (c.type === 8) {
        (buf as any).pjstr(c.text ?? '');
    }
    if (c.buttonType === 2 || c.type === 2) {
        (buf as any).pjstr(c.targetVerb ?? '');
        (buf as any).pjstr(c.targetBase ?? '');
        buf.p2((c.eventCode >> 11) & 0x3f);
    }
    if ([1, 4, 5, 6].includes(c.buttonType)) {
        (buf as any).pjstr(c.buttonText ?? '');
    }

    return buf.data.subarray(0, buf.pos);
}

export function pack() {
    const interfaceNameToId = loadNameToIdMap('interface-names.pack');

    const componentFullNameToLoc = new Map<string, { group: number; file: number }>();

    const perGroupNameToFile = new Map<number, Map<string, number>>();

    const nameToAllLocs = new Map<string, Array<{ group: number; file: number }>>();

    {
        const raw = loadStringPackFile('component-names.pack');
        for (const [loc, fullName] of raw) {
            const [g, f] = loc.split(':').map(n => parseInt(n, 10));
            componentFullNameToLoc.set(fullName, { group: g, file: f });

            let groupMap = perGroupNameToFile.get(g);
            if (!groupMap) {
                groupMap = new Map<string, number>();
                perGroupNameToFile.set(g, groupMap);
            }
            if (groupMap.has(fullName)) {
                console.error(
                    `component-names.pack: duplicate name "${fullName}" within group ${g} ` +
                    `(file ${groupMap.get(fullName)} and file ${f}) — this WILL cause one of them ` +
                    `to silently overwrite the other's packed bytes unless fixed at the data level.`
                );
            }
            groupMap.set(fullName, f);

            const locs = nameToAllLocs.get(fullName) ?? [];
            locs.push({ group: g, file: f });
            nameToAllLocs.set(fullName, locs);
        }

        const crossGroupDuplicates = Array.from(nameToAllLocs.entries()).filter(([, locs]) => {
            const distinctGroups = new Set(locs.map(l => l.group));
            return distinctGroups.size > 1;
        });
        if (crossGroupDuplicates.length > 0) {
            console.warn(
                `component-names.pack: ${crossGroupDuplicates.length} name(s) are shared across ` +
                `different interface groups. Component-body resolution is now scoped per-group so this ` +
                `can no longer misroute a component's own bytes, but any condition that references one ` +
                `of these names (e.g. inv_count(name, obj)) may resolve ambiguously:`
            );
            for (const [fullName, locs] of crossGroupDuplicates) {
                console.warn(`  "${fullName}" -> ${locs.map(l => `${l.group}:${l.file}`).join(', ')}`);
            }
        }
    }

    const seqNameToId = loadNameToIdMap('seq.pack');
    const objNameToId = loadNameToIdMap('obj.pack');
    const varbitNameToId = loadNameToIdMap('varbit.pack');
    const varpNameToId = loadNameToIdMap('varp.pack');

    if (!fs.existsSync(INTERFACE_DIR)) {
        console.error(`Interface source dir not found: ${INTERFACE_DIR}`);
        return;
    }

    const ifaceIndex = new Js5Index(false, false);
    const ifaceIndexData = readFlatFile(255, 3);
    ifaceIndex.decode(ifaceIndexData);

    const encodedGroups = new Map<number, Map<number, Uint8Array>>();

    const files = fs.readdirSync(INTERFACE_DIR).filter(f => f.endsWith('.if'));
    for (const file of files) {
        const interfaceName = file.slice(0, -3);
        let groupId = interfaceNameToId.get(interfaceName);
        
        if (groupId === undefined) {
            const match = interfaceName.match(/^(?:interface_)?(\d+)$/i);
            if (match) {
                groupId = parseInt(match[1], 10);
            }
        }

        if (groupId === undefined) {
            console.warn(`No group id for interface '${interfaceName}' — skipping file.`);
            continue;
        }

        let groupData: Uint8Array;
        try {
            groupData = readFlatFile(3, groupId);
        } catch {
            console.warn(`Missing interface group ${groupId} ('${interfaceName}') on disk, skipping.`);
            continue;
        }
        ifaceIndex.packed[groupId] = groupData;
        if (!ifaceIndex.unpackGroup(groupId)) {
            console.error(`Failed to unpack interface group ${groupId} ('${interfaceName}') — skipping.`);
            continue;
        }

        const blocks = readIfFile(path.join(INTERFACE_DIR, file));
        const groupMap = encodedGroups.get(groupId) ?? new Map<number, Uint8Array>();
        encodedGroups.set(groupId, groupMap);

        const groupNameToFile = perGroupNameToFile.get(groupId);

        for (const { shortName, lines } of blocks) {
            const fullName = `${interfaceName}:${shortName}`;
            let compId: number | undefined = groupNameToFile?.get(fullName);
            if (compId === undefined) {
                const m = shortName.match(/^com_(\d+)$/);
                if (m) compId = parseInt(m[1], 10);
            }
            if (compId === undefined) {
                console.warn(`Could not resolve component '${shortName}' in interface '${interfaceName}' — skipping.`);
                continue;
            }

            if (groupMap.has(compId) && groupMap.get(compId) !== undefined) {
                console.error(
                    `Interface '${interfaceName}' (group ${groupId}): component '${shortName}' resolved to ` +
                    `file ${compId}, which was already written by an earlier block in this same file. ` +
                    `Keeping the FIRST block's encoding and skipping this one — check component-names.pack ` +
                    `for a duplicate name within group ${groupId}.`
                );
                continue;
            }

            const originalCompData = ifaceIndex.unpacked[groupId]?.[compId];
            const isV3 = originalCompData ? ((originalCompData[0] << 24) >> 24) === -1 : false;

            const parsed = parseComponentBlock(shortName, lines);
            const ctx: EncodeCtx = {
                parentId: compId + (groupId << 16),
                seqNameToId, objNameToId, varbitNameToId, varpNameToId,
                componentNameToLoc: componentFullNameToLoc,
            };

            try {
                const encoded = isV3 ? encodeComponent3(parsed, ctx) : encodeComponentOld(parsed, ctx);
                groupMap.set(compId, encoded);
            } catch (err) {
                console.error(`Failed to encode component '${fullName}' (group ${groupId}, file ${compId}) — keeping original bytes.`, err);
                if (originalCompData) groupMap.set(compId, originalCompData);
            }
        }
    }

    const modifiedContainers = new Map<number, Uint8Array>();

    for (const groupId of Array.from(encodedGroups.keys())) {
        const rawContainer = ifaceIndex.packed[groupId] ?? readFlatFile(3, groupId);
        const filesCount = ifaceIndex.groupSize[groupId];
        const fileIds = ifaceIndex.fileIds[groupId];
        const encodedMap = encodedGroups.get(groupId)!;

        const orderedIds = Array.from({ length: filesCount }, (_, i) => (fileIds ? fileIds[i] : i));
        const orderedFiles = orderedIds.map(id => {
            const enc = encodedMap.get(id);
            if (enc) return enc;
            const orig = ifaceIndex.unpacked[groupId]?.[id];
            if (!orig) throw new Error(`Missing original data for group ${groupId} file ${id}, cannot assemble group.`);
            return orig;
        });

        const groupBuffer = assembleGroupBuffer(orderedFiles);
        const container = packGroupAuto(groupBuffer, rawContainer);

        const outDir = path.join(CACHE_OUT_DIR, '3');
        const outPath = path.join(outDir, `${groupId}.dat`);
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(outPath, container);

        modifiedContainers.set(groupId, container);
    }
}

pack();
