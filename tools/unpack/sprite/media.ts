import fs from 'fs';
import path from 'path';
import { Jimp } from 'jimp';
import Js5Index from '#/js5/Js5Index.js';
import Packet from '#/io/Packet.js';
import Environment from '#/util/Environment.ts';
import {
    ensureOutputDirs,
    writePackFile,
    loadPackFile,
    readFlatFile,
} from '#tools/util/ConfigPackHelper.ts';

const SPRITE_ARCHIVE = 8;
const SPRITE_OUT_DIR = path.join(Environment.BUILD_SRC_DIR, 'sprites');
const SPRITE_META_DIR = path.join(SPRITE_OUT_DIR, 'meta');
const TRANSPARENT_KEY = 0xff00ffff;

type DepackedSprite = {
    count: number;
    owi: number;
    ohi: number;
    xof: Int32Array;
    yof: Int32Array;
    wi: Int32Array;
    hi: Int32Array;
    bpal: Int32Array;
    bspr: Uint8Array[];
};

function depackSprite(src: Uint8Array): DepackedSprite {
    const packet = new Packet(src);

    packet.pos = src.length - 2;
    const count = packet.g2();

    const xof = new Int32Array(count);
    const yof = new Int32Array(count);
    const wi = new Int32Array(count);
    const hi = new Int32Array(count);
    const bspr: Uint8Array[] = new Array(count);

    packet.pos = src.length - count * 8 - 7;
    const owi = packet.g2();
    const ohi = packet.g2();
    const paletteCount = (packet.g1() & 0xff) + 1;

    for (let i = 0; i < count; i++) xof[i] = packet.g2();
    for (let i = 0; i < count; i++) yof[i] = packet.g2();
    for (let i = 0; i < count; i++) wi[i] = packet.g2();
    for (let i = 0; i < count; i++) hi[i] = packet.g2();

    packet.pos = src.length + 3 - count * 8 - paletteCount * 3 - 7;
    const bpal = new Int32Array(paletteCount);
    for (let i = 1; i < paletteCount; i++) {
        bpal[i] = packet.g3();
        if (bpal[i] === 0) bpal[i] = 1;
    }

    packet.pos = 0;
    for (let i = 0; i < count; i++) {
        const width = wi[i];
        const height = hi[i];
        const pixels = new Uint8Array(width * height);
        bspr[i] = pixels;

        const encoding = packet.g1();
        if (encoding === 0) {
            for (let p = 0; p < pixels.length; p++) {
                pixels[p] = packet.g1();
            }
        } else if (encoding === 1) {
            for (let x = 0; x < width; x++) {
                for (let y = 0; y < height; y++) {
                    pixels[y * width + x] = packet.g1();
                }
            }
        }
    }

    return { count, owi, ohi, xof, yof, wi, hi, bpal, bspr };
}

function frameToPng(sprite: DepackedSprite, frame: number) {
    const width = sprite.wi[frame];
    const height = sprite.hi[frame];
    const pixels = sprite.bspr[frame];
    const palette = sprite.bpal;

    const img = new Jimp({ width, height, color: TRANSPARENT_KEY });

    for (let i = 0; i < pixels.length; i++) {
        const index = pixels[i];
        if (index === 0) continue;

        const x = i % width;
        const y = Math.floor(i / width);
        const pos = (x + y * width) * 4;

        const rgb = palette[index];
        img.bitmap.data[pos] = (rgb >> 16) & 0xff;
        img.bitmap.data[pos + 1] = (rgb >> 8) & 0xff;
        img.bitmap.data[pos + 2] = rgb & 0xff;
        img.bitmap.data[pos + 3] = 0xff;
    }

    return img;
}

type FrameRef = {
    groupId: number;
    fileId: number;
    sprite: DepackedSprite;
    frameIndexInFile: number;
};

type PackedFrame = {
    ref: FrameRef;
    atlasX: number;
    atlasY: number;
    width: number;
    height: number;
};

const SHEET_PADDING = 2;

function frameToPngFromRef(ref: FrameRef) {
    return frameToPng(ref.sprite, ref.frameIndexInFile);
}

function packFrames(refs: FrameRef[]): { frames: PackedFrame[]; sheetWidth: number; sheetHeight: number } {
    const widths = refs.map(r => r.sprite.wi[r.frameIndexInFile]);
    const heights = refs.map(r => r.sprite.hi[r.frameIndexInFile]);
    const totalArea = widths.reduce((sum, w, i) => sum + w * heights[i], 0);
    const targetWidth = Math.max(1, Math.ceil(Math.sqrt(totalArea)));

    const order = refs.map((_, i) => i).sort((a, b) => heights[b] - heights[a]);

    const frames: PackedFrame[] = new Array(refs.length);
    let cursorX = 0;
    let cursorY = 0;
    let rowHeight = 0;
    let sheetWidth = 0;

    for (const i of order) {
        const w = widths[i];
        const h = heights[i];

        if (cursorX > 0 && cursorX + w > targetWidth) {
            cursorX = 0;
            cursorY += rowHeight + SHEET_PADDING;
            rowHeight = 0;
        }

        frames[i] = { ref: refs[i], atlasX: cursorX, atlasY: cursorY, width: w, height: h };

        cursorX += w + SHEET_PADDING;
        rowHeight = Math.max(rowHeight, h);
        sheetWidth = Math.max(sheetWidth, cursorX - SHEET_PADDING);
    }

    const sheetHeight = cursorY + rowHeight;
    return { frames, sheetWidth, sheetHeight };
}

async function writeSpriteSet(name: string, refs: FrameRef[]): Promise<void> {
    if (refs.length === 0) return;

    if (refs.length === 1) {
        const ref = refs[0];
        const img = frameToPngFromRef(ref);
        await img.write(`${SPRITE_OUT_DIR}/${name}.png` as `${string}.${string}`);
        const metaPath = path.join(SPRITE_META_DIR, `${name}.opt`);
        if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
        return;
    }

    const { frames, sheetWidth, sheetHeight } = packFrames(refs);

    const sheet = new Jimp({ width: Math.max(sheetWidth, 1), height: Math.max(sheetHeight, 1), color: TRANSPARENT_KEY });

    for (const f of frames) {
        if (f.width === 0 || f.height === 0) continue;
        const img = frameToPngFromRef(f.ref);
        sheet.blit({
            src: img,
            x: f.atlasX,
            y: f.atlasY,
            srcX: 0,
            srcY: 0,
            srcW: f.width,
            srcH: f.height,
        });
    }

    await sheet.write(`${SPRITE_OUT_DIR}/${name}.png` as `${string}.${string}`);

    if (!fs.existsSync(SPRITE_META_DIR)) fs.mkdirSync(SPRITE_META_DIR, { recursive: true });

    const lines: string[] = [`${refs.length}`];
    for (const f of frames) {
        const { ref } = f;
        const xof = ref.sprite.xof[ref.frameIndexInFile];
        const yof = ref.sprite.yof[ref.frameIndexInFile];
        lines.push(`${ref.groupId},${ref.fileId},${ref.frameIndexInFile},${f.atlasX},${f.atlasY},${f.width},${f.height},${xof},${yof},${ref.sprite.owi},${ref.sprite.ohi}`);
    }
    fs.writeFileSync(path.join(SPRITE_META_DIR, `${name}.opt`), lines.join('\n') + '\n');
}

const NUMBERED_NAME = /^(.+)_(\d+)$/;

async function unpack() {
    ensureOutputDirs();
    if (!fs.existsSync(SPRITE_OUT_DIR)) fs.mkdirSync(SPRITE_OUT_DIR, { recursive: true });

    const spriteNames = loadPackFile('sprite-names.pack');

    const spriteIndex = new Js5Index(false, false);
    const indexData = readFlatFile(255, SPRITE_ARCHIVE);
    if (!indexData) {
        console.error(`Failed to read Sprite Archive Index (255.${SPRITE_ARCHIVE}) from cache.`);
        return;
    }
    spriteIndex.decode(indexData);

    const packLines: string[] = [];
    const numberedBuckets = new Map<string, Array<{ index: number; groupId: number; refs: FrameRef[] }>>();

    for (let g = 0; g < spriteIndex.capacity; g++) {
        if (spriteIndex.groupSize[g] === 0) continue;

        let groupData: Uint8Array;
        try {
            groupData = readFlatFile(SPRITE_ARCHIVE, g);
        } catch {
            continue;
        }

        spriteIndex.packed[g] = groupData;
        if (!spriteIndex.unpackGroup(g)) continue;

        const filesCount = spriteIndex.groupSize[g];
        const fileIds = spriteIndex.fileIds[g];
        const registeredName = spriteNames.get(g);
        const name = registeredName ?? `sprite_${g}`;
        packLines.push(`${g}=${name}`);

        const refs: FrameRef[] = [];
        for (let i = 0; i < filesCount; i++) {
            const fileId = fileIds ? fileIds[i] : i;
            const fileData = spriteIndex.unpacked[g]?.[fileId];
            if (!fileData) continue;

            try {
                const sprite = depackSprite(fileData);
                for (let frameIndexInFile = 0; frameIndexInFile < sprite.count; frameIndexInFile++) {
                    refs.push({ groupId: g, fileId, sprite, frameIndexInFile });
                }
            } catch (err) {
                console.error(`Failed to depack sprite file ${g}:${fileId} [${name}]:`, err);
            }
        }

        const match = registeredName?.match(NUMBERED_NAME);
        if (match) {
            const base = match[1];
            const index = parseInt(match[2], 10);
            const bucket = numberedBuckets.get(base) ?? [];
            bucket.push({ index, groupId: g, refs });
            numberedBuckets.set(base, bucket);
            continue;
        }

        try {
            await writeSpriteSet(name, refs);
        } catch (err) {
            console.error(`Failed to write sprite [${name}] (${g}):`, err);
        }
    }

    for (const [base, entries] of numberedBuckets) {
        entries.sort((a, b) => a.index - b.index);

        if (entries.length === 1) {
            const only = entries[0];
            const originalName = spriteNames.get(only.groupId) ?? `sprite_${only.groupId}_${only.index}`;
            try {
                await writeSpriteSet(originalName, only.refs);
            } catch (err) {
                console.error(`Failed to write sprite [${originalName}]:`, err);
            }
            continue;
        }

        const combinedRefs = entries.flatMap(e => e.refs);
        try {
            await writeSpriteSet(base, combinedRefs);
        } catch (err) {
            console.error(`Failed to write combined sprite series [${base}]:`, err);
        }
    }

    writePackFile('sprite.pack', packLines);
}

unpack();