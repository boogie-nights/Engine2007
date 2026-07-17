import fs from 'fs';
import path from 'path';
import Js5Index from '#/js5/Js5Index.js';
import Packet from '#/io/Packet.ts';
import {
    ensureOutputDirs,
    writePackFile,
    loadPackFile,
    readFlatFile,
    formatColour,
    INTERFACE_DIR,
    loadStringPackFile
} from '#tools/util/ConfigPackHelper.ts';

const HOOK_INT_LITERALS: Record<number, string> = {
    [-2147483647]: 'mouseX',
    [-2147483646]: 'mouseY',
    [-2147483645]: 'component.parentId',
    [-2147483644]: 'opindex',
    [-2147483643]: 'component.subId',
    [-2147483642]: 'drop.parentId',
    [-2147483641]: 'drop.subId',
    [-2147483640]: 'keyCode',
    [-2147483639]: 'keyChar'
};

const TARGET_MASK_NAMES: Record<number, string> = {
    0x1: 'obj',
    0x2: 'npc',
    0x4: 'loc',
    0x8: 'player',
    0x10: 'inv_item',
    0x20: 'component'
};

export class IfType {
    parentId: number = -1;
    v3: boolean = false;

    type: number = 0;
    buttonType: number = 0;
    clientCode: number = 0;
    width: number = 0;
    height: number = 0;
    trans: number = 0;
    overLayerId: number = -1;
    x: number = 0;
    y: number = 0;
    layerId: number = -1;
    widthAlignment: number = 0;
    heightAlignment: number = 0;
    xAlignment: number = 0;
    yAlignment: number = 0;
    hide: boolean = false;

    // type 0 (layer)
    scrollWidth: number = 0;
    scrollHeight: number = 0;
    noClickThrough: boolean = false;

    // type 1 (discarded fields to preserve exact byte-match)
    discardedField1: number | null = null;
    discardedField2: number | null = null;

    // type 2 / 7 (inv)
    linkObjType: Int32Array | null = null;
    linkObjNumber: Int32Array | null = null;
    marginX: number = 0;
    marginY: number = 0;
    invBackgroundX: Int16Array | null = null;
    invBackgroundY: Int16Array | null = null;
    invBackground: Int32Array | null = null;
    invBackgroundPresent: boolean[] | null = null;
    iop: (string | null)[] | null = null;

    // type 3 (rectangle)
    fill: boolean = false;

    // type 1 / 4 (text)
    hAlign: number = 0;
    vAlign: number = 0;
    lineHeight: number = 0;
    font: number = -1;
    shadow: boolean = false;
    text: string | null = '';
    text2: string | null = '';
    colour: number = 0;
    colour2: number = 0;
    colourOver: number = 0;
    colour2Over: number = 0;

    // type 5 (graphic)
    graphic: number = -1;
    graphic2: number = -1;
    rotate: number = 0;
    tiling: boolean = false;
    field3477: boolean = false;
    outline: number = 0;
    shadowColour: number = 0;
    vFlip: boolean = false;
    hFlip: boolean = false;

    // type 6 (model)
    model1Type: number = 1;
    model1Id: number = -1;
    model2Id: number = -1;
    model2Type: number = 1;
    modelAnim: number = -1;
    modelAnim2: number = -1;
    modelZoom: number = 100;
    modelXAn: number = 0;
    modelZAn: number = 0;
    modelYAn: number = 0;
    modelXOf: number = 0;
    modelYOf: number = 0;
    modelBaseWidth: number = 0;
    modelBaseHeight: number = 0;
    orthog: boolean = false;
    discardedModelField: number | null = null;

    // type 9 (line)
    lineWidth: number = 1;
    lineDirection: boolean = false;

    // buttons
    targetVerb: string | null = '';
    targetBase: string | null = '';
    buttonText: string | null = 'Ok';
    hashook: boolean = false;
    opNames: (string | null)[] | null = null;
    baseOpName: string | null = '';
    eventCode: number = 0;
    hotkeys: Int8Array | null = null;
    dragdeadzone: number = 0;
    dragdeadtime: number = 0;
    draggablebehavior: boolean = false;
    buttonTextOmitted: boolean = false;

    // CS2-style visibility conditions/scripts
    scripts: (Int32Array | null)[] | null = null;
    scriptComparator: Int32Array | null = null;
    scriptOperand: Int32Array | null = null;

    // hooks
    onload: (number | string | null)[] | null = null;
    onmouseover: (number | string | null)[] | null = null;
    onmouseleave: (number | string | null)[] | null = null;
    ontargetleave: (number | string | null)[] | null = null;
    ontargetenter: (number | string | null)[] | null = null;
    onvartransmit: (number | string | null)[] | null = null;
    oninvtransmit: (number | string | null)[] | null = null;
    onstattransmit: (number | string | null)[] | null = null;
    ontimer: (number | string | null)[] | null = null;
    onop: (number | string | null)[] | null = null;
    onmouserepeat: (number | string | null)[] | null = null;
    onclick: (number | string | null)[] | null = null;
    onclickrepeat: (number | string | null)[] | null = null;
    onrelease: (number | string | null)[] | null = null;
    onhold: (number | string | null)[] | null = null;
    ondrag: (number | string | null)[] | null = null;
    ondragcomplete: (number | string | null)[] | null = null;
    onscrollwheel: (number | string | null)[] | null = null;
    onvartransmitlist: Int32Array | null = null;
    oninvtransmitlist: Int32Array | null = null;
    onstattransmitlist: Int32Array | null = null;

    decodeTransmitList(arg0: Packet): Int32Array | null {
        const var2 = arg0.g1();
        if (var2 === 0) {
            return null;
        }

        const var3 = new Int32Array(var2);
        for (let var4 = 0; var4 < var2; var4++) {
            var3[var4] = arg0.g4();
        }
        return var3;
    }

    decodeHook(arg0: Packet): (number | string | null)[] | null {
        const var2 = arg0.g1();
        if (var2 === 0) {
            return null;
        }

        const var3 = new Array(var2);
        for (let var4 = 0; var4 < var2; var4++) {
            const var5 = arg0.g1();
            if (var5 === 0) {
                var3[var4] = arg0.g4();
            } else if (var5 === 1) {
                var3[var4] = arg0.gjstr();
            }
        }
        this.hashook = true;
        return var3;
    }

    decode3(arg0: Packet): void {
        arg0.pos++;
        this.v3 = true;
        this.type = arg0.g1();
        this.clientCode = arg0.g2();
        this.x = arg0.g2s();
        this.y = arg0.g2s();
        this.width = arg0.g2();
        this.height = arg0.g2();
        this.widthAlignment = arg0.g1b();
        this.heightAlignment = arg0.g1b();
        this.xAlignment = arg0.g1b();
        this.yAlignment = arg0.g1b();
        this.layerId = arg0.g2();
        if (this.layerId === 65535) {
            this.layerId = -1;
        } else {
            this.layerId += this.parentId & 0xffff0000;
        }
        this.hide = arg0.g1() === 1;

        if (this.type === 0) {
            this.scrollWidth = arg0.g2();
            this.scrollHeight = arg0.g2();
            this.noClickThrough = arg0.g1() === 1;
        }
        if (this.type === 5) {
            this.graphic = arg0.g4();
            this.rotate = arg0.g2();
            const var2 = arg0.g1();
            this.tiling = (var2 & 0x1) !== 0;
            this.field3477 = (var2 & 0x2) !== 0;
            this.trans = arg0.g1();
            this.outline = arg0.g1();
            this.shadowColour = arg0.g4();
            this.vFlip = arg0.g1() === 1;
            this.hFlip = arg0.g1() === 1;
        }
        if (this.type === 6) {
            this.model1Type = 1;
            this.model1Id = arg0.g2();
            if (this.model1Id === 65535) {
                this.model1Id = -1;
            }
            this.modelXOf = arg0.g2s();
            this.modelYOf = arg0.g2s();
            this.modelXAn = arg0.g2();
            this.modelYAn = arg0.g2();
            this.modelZAn = arg0.g2();
            this.modelZoom = arg0.g2();
            this.modelAnim = arg0.g2();
            if (this.modelAnim === 65535) {
                this.modelAnim = -1;
            }
            this.orthog = arg0.g1() === 1;
            this.discardedModelField = arg0.g2();
            if (this.widthAlignment !== 0) {
                this.modelBaseWidth = arg0.g2();
            }
            if (this.heightAlignment !== 0) {
                this.modelBaseHeight = arg0.g2();
            }
        }
        if (this.type === 4) {
            this.font = arg0.g2();
            if (this.font === 65535) {
                this.font = -1;
            }
            this.text = arg0.gjstr();
            this.lineHeight = arg0.g1();
            this.hAlign = arg0.g1();
            this.vAlign = arg0.g1();
            this.shadow = arg0.g1() === 1;
            this.colour = arg0.g4();
        }
        if (this.type === 3) {
            this.colour = arg0.g4();
            this.fill = arg0.g1() === 1;
            this.trans = arg0.g1();
        }
        if (this.type === 9) {
            this.lineWidth = arg0.g1();
            this.colour = arg0.g4();
            this.lineDirection = arg0.g1() === 1;
        }

        this.eventCode = arg0.g3();
        const var3 = arg0.g1();
        if (var3 > 0) {
            this.hotkeys = new Int8Array(var3);
            for (let var4 = 0; var4 < var3; var4++) {
                this.hotkeys[var4] = arg0.g1b();
            }
        }
        this.baseOpName = arg0.gjstr();
        const var5 = arg0.g1();
        if (var5 > 0) {
            this.opNames = new Array(var5);
            for (let var6 = 0; var6 < var5; var6++) {
                this.opNames[var6] = arg0.gjstr();
            }
        }
        this.dragdeadzone = arg0.g1();
        this.dragdeadtime = arg0.g1();
        this.draggablebehavior = arg0.g1() === 1;
        this.targetVerb = arg0.gjstr();
        this.onload = this.decodeHook(arg0);
        this.onmouseover = this.decodeHook(arg0);
        this.onmouseleave = this.decodeHook(arg0);
        this.ontargetleave = this.decodeHook(arg0);
        this.ontargetenter = this.decodeHook(arg0);
        this.onvartransmit = this.decodeHook(arg0);
        this.oninvtransmit = this.decodeHook(arg0);
        this.onstattransmit = this.decodeHook(arg0);
        this.ontimer = this.decodeHook(arg0);
        this.onop = this.decodeHook(arg0);
        this.onmouserepeat = this.decodeHook(arg0);
        this.onclick = this.decodeHook(arg0);
        this.onclickrepeat = this.decodeHook(arg0);
        this.onrelease = this.decodeHook(arg0);
        this.onhold = this.decodeHook(arg0);
        this.ondrag = this.decodeHook(arg0);
        this.ondragcomplete = this.decodeHook(arg0);
        this.onscrollwheel = this.decodeHook(arg0);
        this.onvartransmitlist = this.decodeTransmitList(arg0);
        this.oninvtransmitlist = this.decodeTransmitList(arg0);
        this.onstattransmitlist = this.decodeTransmitList(arg0);
    }

    decode(arg0: Packet): void {
        this.v3 = false;
        this.type = arg0.g1();
        this.buttonType = arg0.g1();
        this.clientCode = arg0.g2();
        this.x = arg0.g2s();
        this.y = arg0.g2s();
        this.width = arg0.g2();
        this.height = arg0.g2();
        this.heightAlignment = 0;
        this.widthAlignment = 0;
        this.xAlignment = 0;
        this.yAlignment = 0;
        this.trans = arg0.g1();
        this.layerId = arg0.g2();
        if (this.layerId === 65535) {
            this.layerId = -1;
        } else {
            this.layerId = (this.parentId & 0xffff0000) + this.layerId;
        }
        this.overLayerId = arg0.g2();
        if (this.overLayerId === 65535) {
            this.overLayerId = -1;
        }

        const var2 = arg0.g1();
        if (var2 > 0) {
            this.scriptOperand = new Int32Array(var2);
            this.scriptComparator = new Int32Array(var2);
            for (let var3 = 0; var3 < var2; var3++) {
                this.scriptComparator[var3] = arg0.g1();
                this.scriptOperand[var3] = arg0.g2();
            }
        }

        const var4 = arg0.g1();
        if (var4 > 0) {
            this.scripts = new Array(var4).fill(null);
            for (let var5 = 0; var5 < var4; var5++) {
                const var6 = arg0.g2();
                this.scripts[var5] = new Int32Array(var6);
                for (let var7 = 0; var7 < var6; var7++) {
                    this.scripts[var5]![var7] = arg0.g2();
                    if (this.scripts[var5]![var7] === 65535) {
                        this.scripts[var5]![var7] = -1;
                    }
                }
            }
        }

        if (this.type === 0) {
            this.scrollHeight = arg0.g2();
            this.hide = arg0.g1() === 1;
        }
        if (this.type === 1) {
            this.discardedField1 = arg0.g2();
            this.discardedField2 = arg0.g1();
        }
        if (this.type === 2) {
            this.linkObjType = new Int32Array(this.width * this.height);
            this.linkObjNumber = new Int32Array(this.height * this.width);
            this.heightAlignment = 3;
            this.widthAlignment = 3;
            const var8 = arg0.g1();
            if (var8 === 1) {
                this.eventCode |= 0x10000000;
            }
            const var9 = arg0.g1();
            if (var9 === 1) {
                this.eventCode |= 0x40000000;
            }
            const var10 = arg0.g1();
            if (var10 === 1) {
                this.eventCode |= -2147483648;
            }
            const var11 = arg0.g1();
            if (var11 === 1) {
                this.eventCode |= 0x20000000;
            }
            this.marginX = arg0.g1();
            this.marginY = arg0.g1();
            this.invBackground = new Int32Array(20);
            this.invBackgroundY = new Int16Array(20);
            this.invBackgroundX = new Int16Array(20);
            this.invBackgroundPresent = new Array(20).fill(false);
            for (let var12 = 0; var12 < 20; var12++) {
                const var13 = arg0.g1();
                if (var13 === 1) {
                    this.invBackgroundX[var12] = arg0.g2s();
                    this.invBackgroundY[var12] = arg0.g2s();
                    this.invBackground[var12] = arg0.g4();
                    this.invBackgroundPresent[var12] = true;
                } else {
                    this.invBackground[var12] = -1;
                }
            }
            this.iop = new Array(5).fill(null);
            for (let var14 = 0; var14 < 5; var14++) {
                const var15 = arg0.gjstr();
                if (var15.length > 0) {
                    this.iop[var14] = var15;
                    this.eventCode |= 0x1 << (var14 + 23);
                }
            }
        }
        if (this.type === 3) {
            this.fill = arg0.g1() === 1;
        }
        if (this.type === 4 || this.type === 1) {
            this.hAlign = arg0.g1();
            this.vAlign = arg0.g1();
            this.lineHeight = arg0.g1();
            this.font = arg0.g2();
            if (this.font === 65535) {
                this.font = -1;
            }
            this.shadow = arg0.g1() === 1;
        }
        if (this.type === 4) {
            this.text = arg0.gjstr();
            this.text2 = arg0.gjstr();
        }
        if (this.type === 1 || this.type === 3 || this.type === 4) {
            this.colour = arg0.g4();
        }
        if (this.type === 3 || this.type === 4) {
            this.colour2 = arg0.g4();
            this.colourOver = arg0.g4();
            this.colour2Over = arg0.g4();
        }
        if (this.type === 5) {
            this.graphic = arg0.g4();
            this.graphic2 = arg0.g4();
        }
        if (this.type === 6) {
            this.model1Type = 1;
            this.model1Id = arg0.g2();
            this.model2Type = 1;
            if (this.model1Id === 65535) {
                this.model1Id = -1;
            }
            this.model2Id = arg0.g2();
            if (this.model2Id === 65535) {
                this.model2Id = -1;
            }
            this.modelAnim = arg0.g2();
            if (this.modelAnim === 65535) {
                this.modelAnim = -1;
            }
            this.modelAnim2 = arg0.g2();
            if (this.modelAnim2 === 65535) {
                this.modelAnim2 = -1;
            }
            this.modelZoom = arg0.g2();
            this.modelXAn = arg0.g2();
            this.modelYAn = arg0.g2();
        }
        if (this.type === 7) {
            this.heightAlignment = 3;
            this.linkObjType = new Int32Array(this.width * this.height);
            this.widthAlignment = 3;
            this.linkObjNumber = new Int32Array(this.width * this.height);
            this.hAlign = arg0.g1();
            this.font = arg0.g2();
            if (this.font === 65535) {
                this.font = -1;
            }
            this.shadow = arg0.g1() === 1;
            this.colour = arg0.g4();
            this.marginX = arg0.g2s();
            this.marginY = arg0.g2s();
            const var16 = arg0.g1();
            this.iop = new Array(5).fill(null);
            if (var16 === 1) {
                this.eventCode |= 0x40000000;
            }
            for (let var17 = 0; var17 < 5; var17++) {
                const var18 = arg0.gjstr();
                if (var18.length > 0) {
                    this.iop[var17] = var18;
                    this.eventCode |= 0x1 << (var17 + 23);
                }
            }
        }
        if (this.type === 8) {
            this.text = arg0.gjstr();
        }
        if (this.buttonType === 2 || this.type === 2) {
            this.targetVerb = arg0.gjstr();
            this.targetBase = arg0.gjstr();
            const var19 = arg0.g2() & 0x3f;
            this.eventCode |= var19 << 11;
        }
        if (this.buttonType === 1 || this.buttonType === 4 || this.buttonType === 5 || this.buttonType === 6) {
            this.buttonText = arg0.gjstr();
            if (this.buttonText.length === 0) {
                this.buttonTextOmitted = true;
                if (this.buttonType === 1) {
                    this.buttonText = 'OK';
                }
                if (this.buttonType === 4) {
                    this.buttonText = 'Select';
                }
                if (this.buttonType === 5) {
                    this.buttonText = 'Select';
                }
                if (this.buttonType === 6) {
                    this.buttonText = 'Continue';
                }
            }
        }
        if (this.buttonType === 1 || this.buttonType === 4 || this.buttonType === 5) {
            this.eventCode |= 0x400000;
        }
        if (this.buttonType === 6) {
            this.eventCode |= 0x1;
        }
    }
}

export function decodeComponent(compData: Uint8Array, parentId: number): { comp: IfType; consumed: number; isV3: boolean } {
    const comp = new IfType();
    comp.parentId = parentId;

    const isV3 = (compData[0] << 24) >> 24 === -1;
    const packet = new Packet(compData);
    if (isV3) {
        comp.decode3(packet);
    } else {
        comp.decode(packet);
    }

    return { comp, consumed: packet.pos, isV3 };
}

function describeTargetMask(mask: number): string {
    if (mask === 0) return '';
    const names: string[] = [];
    for (const bit of [0x1, 0x2, 0x4, 0x8, 0x10, 0x20]) {
        if ((mask & bit) !== 0) {
            names.push(TARGET_MASK_NAMES[bit]);
        }
    }
    const unknown = mask & ~0x3f;
    if (unknown !== 0) {
        names.push(`unknown(0x${unknown.toString(16)})`);
    }
    return names.join('|');
}

function describeEventCode(eventCode: number): string | null {
    if (eventCode === 0) return null;

    const flags: string[] = [];

    if ((eventCode & 0x1) !== 0) {
        flags.push('pauseButton');
    }

    const activeOps: number[] = [];
    for (let opIndex = 0; opIndex <= 9; opIndex++) {
        if ((eventCode >> (opIndex + 1)) & 0x1) {
            activeOps.push(opIndex + 1);
        }
    }
    if (activeOps.length > 0) {
        flags.push(`hasOp(${activeOps.join(',')})`);
    }

    const targetMask = (eventCode >> 11) & 0x3f;
    if (targetMask !== 0) {
        flags.push(`targetMask=${describeTargetMask(targetMask)}`);
    }

    const draggableDepth = (eventCode >> 17) & 0x7;
    if (draggableDepth !== 0) {
        flags.push(`serverDraggable=${draggableDepth}`);
    }

    if ((eventCode >> 20) & 0x1) {
        flags.push('isDragTarget');
    }
    if ((eventCode >> 21) & 0x1) {
        flags.push('isUseTarget');
    }
    if ((eventCode >> 22) & 0x1) {
        flags.push('flag22');
    }

    const activeIops: number[] = [];
    for (let iopIndex = 0; iopIndex <= 4; iopIndex++) {
        if ((eventCode >> (iopIndex + 23)) & 0x1) {
            activeIops.push(iopIndex);
        }
    }
    if (activeIops.length > 0) {
        flags.push(`hasIop(${activeIops.join(',')})`);
    }

    if ((eventCode >> 28) & 0x1) {
        flags.push('objSwapEnabled');
    }
    if ((eventCode >> 29) & 0x1) {
        flags.push('objReplaceEnabled');
    }
    if ((eventCode >> 30) & 0x1) {
        flags.push('objOpsEnabled');
    }
    if ((eventCode >>> 31) & 0x1) {
        flags.push('objUseEnabled');
    }

    let knownMask = 0;
    knownMask |= 0x1;
    knownMask |= 0x3ff << 1;
    knownMask |= 0x3f << 11;
    knownMask |= 0x7 << 17;
    knownMask |= 0x1 << 20;
    knownMask |= 0x1 << 21;
    knownMask |= 0x1 << 22;
    knownMask |= 0x1f << 23;
    knownMask |= 0x1 << 28;
    knownMask |= 0x1 << 29;
    knownMask |= 0x1 << 30;
    knownMask |= 0x1 << 31;

    const unknown = eventCode & ~knownMask;
    if (unknown !== 0) {
        flags.push(`unknown(0x${(unknown >>> 0).toString(16)})`);
    }

    return flags.length > 0 ? flags.join(', ') : null;
}

const COMPONENT_TYPE_NAMES: Record<number, string> = {
    0: 'Layer',
    1: 'Container',
    2: 'Inventory',
    3: 'Rectangle',
    4: 'Text',
    5: 'Sprite',
    6: 'Model',
    7: 'Item_List',
    8: 'Tooltip',
    9: 'Line'
};

const BUTTON_TYPE_NAMES: Record<number, string> = {
    0: 'None',
    1: 'Button',
    2: 'Target',
    3: 'Close',
    4: 'Toggly',
    5: 'Select',
    6: 'Pause'
};

const SIZE_ALIGNMENT_NAMES: Record<number, string> = {
    0: 'Absolute',
    1: 'Offset',
    2: 'Percentage',
    3: 'Grid'
};

const POSITION_ALIGNMENT_NAMES: Record<number, string> = {
    0: 'Absolute',
    1: 'Center',
    2: 'Bottom_Right',
    3: 'Percentage',
    4: 'Percentage_Center',
    5: 'Percentage_Bottom_Right'
};

const HORIZONTAL_ALIGNMENT_NAMES: Record<number, string> = {
    0: 'Left',
    1: 'Center',
    2: 'Right'
};

const VERTICAL_ALIGNMENT_NAMES: Record<number, string> = {
    0: 'Top',
    1: 'Center',
    2: 'Bottom'
};

const MODEL_TYPE_NAMES: Record<number, string> = {
    0: 'None',
    1: 'Model',
    2: 'NPC_Head',
    3: 'Player_Head',
    4: 'Item',
    5: 'Player_Model',
    6: 'NPC_Model'
};

function enumName(map: Record<number, string>, value: number): string {
    return map[value] ?? String(value);
}

function formatComponentRef(compId: number, componentNameMap: Map<string, string>): string {
    const group = compId >>> 16;
    const file = compId & 0xffff;
    return componentNameMap.get(`${group}:${file}`) ?? `comp_${group}_${file}`;
}

interface ScriptTerm {
    operator: '+' | '-' | '*' | '/';
    opName: string;
    args: (string | number)[];
}

function disassembleIfScriptTerms(
    ints: Int32Array,
    objNames: Map<number, string>,
    componentNameMap: Map<string, string>,
    varbitNames: Map<number, string>,
    varpNames: Map<number, string>
): ScriptTerm[] {
    const terms: ScriptTerm[] = [];
    let pendingOp: '+' | '-' | '*' | '/' = '+';
    let i = 0;

    const pushTerm = (opName: string, args: (string | number)[] = []) => {
        terms.push({ operator: pendingOp, opName, args });
        pendingOp = '+';
    };

    while (i < ints.length) {
        const op = ints[i++];
        if (op === 0) break;

        if (op === 1) {
            pushTerm('stat_level', [ints[i++]]);
        } else if (op === 2) {
            pushTerm('stat_base', [ints[i++]]);
        } else if (op === 3) {
            pushTerm('stat_xp', [ints[i++]]);
        } else if (op === 4 || op === 10) {
            const group = ints[i++];
            const file = ints[i++];
            const objId = ints[i++];
            const compName = formatComponentRef((group << 16) + file, componentNameMap);
            const objName = objId === -1 ? 'none' : (objNames.get(objId) ?? `obj_${objId}`);
            pushTerm(op === 4 ? 'inv_count' : 'inv_contains', [compName, objName]);
        } else if (op === 5) {
            const varpId = ints[i++];
            pushTerm('varp', [varpNames.get(varpId) ?? `varp_${varpId}`]);
        } else if (op === 6) {
            pushTerm('xp_for_level', [ints[i++]]);
        } else if (op === 7) {
            const varpId = ints[i++];
            pushTerm('varp_percent', [varpNames.get(varpId) ?? `varp_${varpId}`]);
        } else if (op === 8) {
            pushTerm('combat_level');
        } else if (op === 9) {
            pushTerm('total_level');
        } else if (op === 11) {
            pushTerm('run_energy');
        } else if (op === 12) {
            pushTerm('run_weight');
        } else if (op === 13) {
            const varp = ints[i++];
            const bit = ints[i++];
            pushTerm('varp_bit', [varpNames.get(varp) ?? `varp_${varp}`, bit]);
        } else if (op === 14) {
            const varbitId = ints[i++];
            pushTerm('varbit', [varbitNames.get(varbitId) ?? `varbit_${varbitId}`]);
        } else if (op === 15) {
            pendingOp = '-';
        } else if (op === 16) {
            pendingOp = '/';
        } else if (op === 17) {
            pendingOp = '*';
        } else if (op === 18) {
            pushTerm('local_x');
        } else if (op === 19) {
            pushTerm('local_z');
        } else if (op === 20) {
            pushTerm('num', [ints[i++]]);
        } else {
            pushTerm(`unknown_op${op}`);
        }
    }

    return terms;
}

function formatHookEntry(value: number | string | null): string {
    if (value === null) {
        return 'null';
    }
    if (typeof value === 'string') {
        return `"${value.replace(/"/g, '\\"')}"`;
    }
    return HOOK_INT_LITERALS[value] ?? String(value);
}

function formatHook(hook: (number | string | null)[] | null): string | null {
    if (!hook || hook.length === 0) {
        return null;
    }
    return hook.map(formatHookEntry).join(',');
}

function formatIntArray(arr: Int32Array | Int8Array | null): string | null {
    if (!arr || arr.length === 0) {
        return null;
    }
    return Array.from(arr).join(',');
}

const COMPARATOR_NAMES: Record<number, string> = {
    1: 'eq',
    2: 'lt',
    3: 'gt',
    4: 'neq'
};

function formatScriptTerm(term: ScriptTerm): string {
    const parts: string[] = [];
    if (term.operator !== '+') {
        parts.push(term.operator === '-' ? 'sub' : term.operator === '*' ? 'mul' : 'div');
    }
    parts.push(term.opName, ...term.args.map(String));
    return parts.join(',');
}

function emitConditions(
    comp: IfType,
    lines: string[],
    objNames: Map<number, string>,
    componentNameMap: Map<string, string>,
    varbitNames: Map<number, string>,
    varpNames: Map<number, string>
): void {
    const condCount = comp.scriptComparator?.length ?? 0;
    const scriptCount = comp.scripts?.length ?? 0;

    for (let i = 0; i < condCount; i++) {
        const n = i + 1;
        const comparatorName = COMPARATOR_NAMES[comp.scriptComparator![i]] ?? `cmp${comp.scriptComparator![i]}`;
        lines.push(`script${n}=${comparatorName},${comp.scriptOperand![i]}`);

        const script = comp.scripts?.[i];
        if (script) {
            const terms = disassembleIfScriptTerms(script, objNames, componentNameMap, varbitNames, varpNames);
            terms.forEach((term, k) => {
                lines.push(`script${n}op${k + 1}=${formatScriptTerm(term)}`);
            });
        }
    }

    for (let i = condCount; i < scriptCount; i++) {
        const n = i + 1;
        const script = comp.scripts![i];
        if (!script) continue;
        const terms = disassembleIfScriptTerms(script, objNames, componentNameMap, varbitNames, varpNames);
        terms.forEach((term, k) => {
            lines.push(`script${n}op${k + 1}=${formatScriptTerm(term)}`);
        });
    }
}

function serializeComponent(
    c: IfType,
    lines: string[],
    seqNames: Map<number, string>,
    objNames: Map<number, string>,
    componentNameMap: Map<string, string>,
    varbitNames: Map<number, string>,
    varpNames: Map<number, string>
): void {
    const push = (key: string, value: unknown) => {
        if (value === null || value === undefined || value === '') return;
        lines.push(`${key}=${value}`);
    };

    push('type', enumName(COMPONENT_TYPE_NAMES, c.type));
    
    if (c.buttonType !== 0) {
        push('buttonType', enumName(BUTTON_TYPE_NAMES, c.buttonType));
    }
    
    if (c.clientCode !== 0) {
        push('clientCode', c.clientCode);
    }
    
    if (c.x !== 0) push('x', c.x);
    if (c.y !== 0) push('y', c.y);
    
    if (c.width !== 0 || c.type === 0) push('width', c.width);
    if (c.height !== 0 || c.type === 0) push('height', c.height);

    if (c.widthAlignment !== 0) {
        push('widthAlignment', enumName(SIZE_ALIGNMENT_NAMES, c.widthAlignment));
    }
    if (c.heightAlignment !== 0) {
        push('heightAlignment', enumName(SIZE_ALIGNMENT_NAMES, c.heightAlignment));
    }
    if (c.xAlignment !== 0) {
        push('xAlignment', enumName(POSITION_ALIGNMENT_NAMES, c.xAlignment));
    }
    if (c.yAlignment !== 0) {
        push('yAlignment', enumName(POSITION_ALIGNMENT_NAMES, c.yAlignment));
    }
    
    if (c.layerId !== -1) push('layerId', c.layerId);
    if (c.overLayerId !== -1) push('overLayerId', c.overLayerId);
    if (c.hide) push('hide', 'yes');
    if (c.trans !== 0) push('trans', c.trans);

    if (c.type === 0) {
        if (c.scrollWidth !== 0) push('scrollWidth', c.scrollWidth);
        if (c.scrollHeight !== 0) push('scrollHeight', c.scrollHeight);
        if (c.noClickThrough) push('noClickThrough', 'yes');
    }

    if (c.type === 1) {
        if (c.discardedField1 !== null && c.discardedField1 !== undefined) {
            push('discardedField1', c.discardedField1);
        }
        if (c.discardedField2 !== null && c.discardedField2 !== undefined) {
            push('discardedField2', c.discardedField2);
        }
    }

    const isTextComponent = c.type === 4 || c.type === 1;
    const isRectangleComponent = c.type === 3;
    const isLineComponent = c.type === 9;

    if (isTextComponent || isRectangleComponent || isLineComponent) {
        if (c.colour !== 0) {
            push('colour', formatColour(c.colour));
        }
    }
    if (isTextComponent || isRectangleComponent) {
        if (c.colour2 !== 0) push('colour2', formatColour(c.colour2));
        if (c.colourOver !== 0) push('colourOver', formatColour(c.colourOver));
        if (c.colour2Over !== 0) push('colour2Over', formatColour(c.colour2Over));
    }

    if (c.type === 3) {
        if (c.fill) push('fill', 'yes');
    }
    
    if (isTextComponent) {
        if (c.hAlign !== 0) {
            push('hAlign', enumName(HORIZONTAL_ALIGNMENT_NAMES, c.hAlign));
        }
        if (c.vAlign !== 0) {
            push('vAlign', enumName(VERTICAL_ALIGNMENT_NAMES, c.vAlign));
        }
        if (c.lineHeight !== 0) push('lineHeight', c.lineHeight);
        if (c.font !== -1) push('font', c.font);
        if (c.shadow) push('shadow', 'yes');
    }
    
    if (c.type === 4) {
        if (c.text && c.text !== '') push('text', `"${c.text.replace(/"/g, '\\"')}"`);
        if (c.text2 && c.text2 !== '') push('text2', `"${c.text2.replace(/"/g, '\\"')}"`);
    }
    if (c.type === 5) {
        if (c.graphic !== -1) push('graphic', c.graphic);
        if (c.graphic2 !== -1) push('graphic2', c.graphic2);
        if (c.rotate !== 0) push('rotate', c.rotate);
        if (c.tiling) push('tiling', 'yes');
        if (c.field3477) push('field3477', 'yes');
        if (c.outline !== 0) push('outline', c.outline);
        if (c.shadowColour !== 0) push('shadowColour', formatColour(c.shadowColour));
        if (c.vFlip) push('vFlip', 'yes');
        if (c.hFlip) push('hFlip', 'yes');
    }
    if (c.type === 6) {
        if (c.model1Type !== 1) {
            push('model1Type', enumName(MODEL_TYPE_NAMES, c.model1Type));
        }
        if (c.model1Id !== -1) push('model1Id', c.model1Id);
        
        if (c.model2Type !== 1) {
            push('model2Type', enumName(MODEL_TYPE_NAMES, c.model2Type));
        }
        if (c.model2Id !== -1) push('model2Id', c.model2Id);
        
        if (c.modelAnim !== -1) {
            push('modelAnim', seqNames.get(c.modelAnim) ?? `seq_${c.modelAnim}`);
        }
        if (c.modelAnim2 !== -1) {
            push('modelAnim2', seqNames.get(c.modelAnim2) ?? `seq_${c.modelAnim2}`);
        }
        if (c.modelZoom !== 100) push('modelZoom', c.modelZoom);
        if (c.modelXAn !== 0) push('modelXAn', c.modelXAn);
        if (c.modelYAn !== 0) push('modelYAn', c.modelYAn);
        if (c.modelZAn !== 0) push('modelZAn', c.modelZAn);
        if (c.modelXOf !== 0) push('modelXOf', c.modelXOf);
        if (c.modelYOf !== 0) push('modelYOf', c.modelYOf);
        if (c.orthog) push('orthog', 'yes');
        if (c.discardedModelField !== null && c.discardedModelField !== undefined) {
            push('discardedModelField', c.discardedModelField);
        }
        if (c.modelBaseWidth !== 0) push('modelBaseWidth', c.modelBaseWidth);
        if (c.modelBaseHeight !== 0) push('modelBaseHeight', c.modelBaseHeight);
    }
    if (c.type === 9) {
        if (c.lineWidth !== 1) push('lineWidth', c.lineWidth);
        if (c.lineDirection) push('lineDirection', 'yes');
    }
    if (c.type === 8) {
        if (c.text && c.text !== '') push('text', `"${c.text.replace(/"/g, '\\"')}"`);
    }
    if (c.type === 2 || c.type === 7) {
        if (c.marginX !== 0) push('marginX', c.marginX);
        if (c.marginY !== 0) push('marginY', c.marginY);

        if (c.invBackground) {
            for (let i = 0; i < 20; i++) {
                if (c.invBackgroundPresent?.[i]) {
                    push(`invBackground${i}`, `${c.invBackgroundX![i]},${c.invBackgroundY![i]},${c.invBackground[i]}`);
                }
            }
        }

        push('iop0', c.iop?.[0]);
        push('iop1', c.iop?.[1]);
        push('iop2', c.iop?.[2]);
        push('iop3', c.iop?.[3]);
        push('iop4', c.iop?.[4]);
    }

    if (c.v3) {
        if (c.targetVerb && c.targetVerb !== '') push('targetVerb', `"${c.targetVerb}"`);
    } else if (c.buttonType === 2 || c.type === 2) {
        if (c.targetVerb && c.targetVerb !== '') push('targetVerb', `"${c.targetVerb}"`);
        if (c.targetBase && c.targetBase !== '') push('targetBase', `"${c.targetBase}"`);
    }
    
    if (c.buttonType >= 1 && c.buttonType <= 6) {
        if (!c.buttonTextOmitted && c.buttonText) {
            push('buttonText', `"${c.buttonText}"`);
        }
    }

    push('eventCode', describeEventCode(c.eventCode));
    push('hotkeys', formatIntArray(c.hotkeys));
    if (c.baseOpName && c.baseOpName !== '') push('baseOpName', `"${c.baseOpName}"`);
    
    if (c.opNames) {
        for (let i = 0; i < c.opNames.length; i++) {
            if (c.opNames[i]) push(`opName${i}`, `"${c.opNames[i]}"`);
        }
    }
    if (c.dragdeadzone !== 0) push('dragdeadzone', c.dragdeadzone);
    if (c.dragdeadtime !== 0) push('dragdeadtime', c.dragdeadtime);
    if (c.draggablebehavior) push('draggablebehavior', 'yes');
    emitConditions(c, lines, objNames, componentNameMap, varbitNames, varpNames);

    push('onload', formatHook(c.onload));
    push('onmouseover', formatHook(c.onmouseover));
    push('onmouseleave', formatHook(c.onmouseleave));
    push('ontargetleave', formatHook(c.ontargetleave));
    push('ontargetenter', formatHook(c.ontargetenter));
    push('onvartransmit', formatHook(c.onvartransmit));
    push('oninvtransmit', formatHook(c.oninvtransmit));
    push('onstattransmit', formatHook(c.onstattransmit));
    push('ontimer', formatHook(c.ontimer));
    push('onop', formatHook(c.onop));
    push('onmouserepeat', formatHook(c.onmouserepeat));
    push('onclick', formatHook(c.onclick));
    push('onclickrepeat', formatHook(c.onclickrepeat));
    push('onrelease', formatHook(c.onrelease));
    push('onhold', formatHook(c.onhold));
    push('ondrag', formatHook(c.ondrag));
    push('ondragcomplete', formatHook(c.ondragcomplete));
    push('onscrollwheel', formatHook(c.onscrollwheel));
    push('onvartransmitlist', formatIntArray(c.onvartransmitlist));
    push('oninvtransmitlist', formatIntArray(c.oninvtransmitlist));
    push('onstattransmitlist', formatIntArray(c.onstattransmitlist));
}

function unpack() {
    ensureOutputDirs();

    const nameMap = loadPackFile('interface-names.pack');
    const seqNames = loadPackFile('seq.pack');
    const objNames = loadPackFile('obj.pack');
    const varbitNames = loadPackFile('varbit.pack');
    const varpNames = loadPackFile('varp.pack');

    let componentNameMap = new Map<string, string>();
    try {
        componentNameMap = loadStringPackFile('component-names.pack');
    } catch {
    }

    try {
        const ifaceIndexData = readFlatFile(255, 3);
        if (!ifaceIndexData) {
            console.error(`Failed to read Interfaces Archive Index (255.3) from cache.`);
            return;
        }

        const ifaceIndex = new Js5Index(false, false);
        ifaceIndex.decode(ifaceIndexData);

        const packLines: string[] = [];
        let nextId = 0;

        for (let groupId = 0; groupId < ifaceIndex.capacity; groupId++) {
            if (!ifaceIndex.isGroupValid(groupId)) continue;

            let groupData: Uint8Array;
            try {
                groupData = readFlatFile(3, groupId);
            } catch {
                console.warn(`Missing interface group ${groupId} on disk, skipping.`);
                continue;
            }

            ifaceIndex.packed[groupId] = groupData;
            if (!ifaceIndex.unpackGroup(groupId)) {
                console.error(`Failed to unpack interface group ${groupId}.`);
                continue;
            }

            const name = nameMap.get(groupId) ?? `interface_${groupId}`;

            packLines.push(`${nextId}=${name}`);
            nextId++;

            const compCount = ifaceIndex.groupSize[groupId];
            const compFileIds = ifaceIndex.fileIds[groupId];
            const ifaceBlocks: string[] = [];

            for (let i = 0; i < compCount; i++) {
                const compId = compFileIds ? compFileIds[i] : i;
                const compData = ifaceIndex.unpacked[groupId][compId];
                if (!compData) continue;

                const lookupKey = `${groupId}:${compId}`;
                const componentFullName = componentNameMap.get(lookupKey);

                let compName = `com_${compId}`;
                let compPackName = `${name}:com_${compId}`;

                if (componentFullName) {
                    compPackName = componentFullName;
                    const colonIndex = componentFullName.indexOf(':');
                    if (colonIndex !== -1) {
                        compName = componentFullName.substring(colonIndex + 1);
                    } else {
                        compName = componentFullName;
                    }
                    if (!compName) {
                        console.error(
                            `Interface group ${groupId}, component ${compId}: component-names.pack entry ` +
                            `"${componentFullName}" has an empty name after the ':' — falling back to ` +
                            `com_${compId} instead of writing a malformed [] header. Fix the name in ` +
                            `component-names.pack.`
                        );
                        compName = `com_${compId}`;
                    }
                }

                packLines.push(`${nextId}=${compPackName}`);
                nextId++;

                try {
                    const { comp } = decodeComponent(compData, compId + (groupId << 16));

                    const block: string[] = [`[${compName}]`];
                    serializeComponent(comp, block, seqNames, objNames, componentNameMap, varbitNames, varpNames);
                    ifaceBlocks.push(block.join('\n'));
                } catch (err) {
                    console.error(`Parsing warning on interface ${groupId}, component ${compId}:`, err);
                }
            }

            const ifacePath = path.join(INTERFACE_DIR, `${name}.if`);
            fs.writeFileSync(ifacePath, ifaceBlocks.join('\n\n') + '\n');
        }

        writePackFile('interface.pack', packLines);
    } catch (err) {
        console.error('Interface unpack failed:', err);
    }
}

unpack();