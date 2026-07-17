import fs from 'fs';
import path from 'path';
import { deflateRaw } from 'pako';
import Packet from '#/io/Packet.ts';
import { ungzip } from 'pako';
import BZip2 from '#/io/BZip2.ts';
import Environment from '#/util/Environment.js';

export const CACHE_DIR = './data/cache';
export const PACK_DIR = '../content/pack';
export const INTERFACE_DIR = '../content/scripts/interfaces';
export const CONFIG_DIR = '../content/scripts/configs';
export const CACHE_OUT_DIR = './data/pack/cache';

const CRC_TABLE = new Int32Array(256);
for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    CRC_TABLE[i] = c;
}

export const enum ContainerCompression {
    NONE  = 0,
    BZIP2 = 1,
    GZIP  = 2,
}

export type ContainerMeta = {
    compressionType: number;
    headerSize: number;
    compSize: number;
    uncompSize: number;
    version: number | null;
};

export function assembleGroupBuffer(orderedFiles: Uint8Array[]): Uint8Array {
    const filesCount = orderedFiles.length;

    if (filesCount === 1) {
        return orderedFiles[0];
    }

    const totalDataSize = orderedFiles.reduce((s, f) => s + f.length, 0);
    const trailerSize = filesCount * 4 + 1;
    const groupBuffer = new Uint8Array(totalDataSize + trailerSize);
    const groupView = new DataView(groupBuffer.buffer, groupBuffer.byteOffset);

    let writePos = 0;
    for (const f of orderedFiles) {
        groupBuffer.set(f, writePos);
        writePos += f.length;
    }

    let trailerPos = totalDataSize;
    let prevSize = 0;
    for (let i = 0; i < filesCount; i++) {
        const delta = orderedFiles[i].length - prevSize;
        groupView.setInt32(trailerPos, delta, false);
        prevSize = orderedFiles[i].length;
        trailerPos += 4;
    }
    groupBuffer[trailerPos] = 1;

    return groupBuffer;
}

export function readContainerMeta(raw: Uint8Array): ContainerMeta {
    const compressionType = raw[0];

    if (compressionType === ContainerCompression.NONE) {
        const compSize = ((raw[1] << 24) | (raw[2] << 16) | (raw[3] << 8) | raw[4]) >>> 0;
        const headerSize = 5;
        const containerBodyEnd = headerSize + compSize;
        const trailerBytes = raw.length - containerBodyEnd;
        const version = trailerBytes >= 2
            ? ((raw[raw.length - 2] << 8) | raw[raw.length - 1])
            : null;

        return { compressionType, headerSize, compSize, uncompSize: compSize, version };
    }

    const compSize   = ((raw[1] << 24) | (raw[2] << 16) | (raw[3] << 8) | raw[4]) >>> 0;
    const uncompSize = ((raw[5] << 24) | (raw[6] << 16) | (raw[7] << 8) | raw[8]) >>> 0;
    const headerSize = 9;
    const containerBodyEnd = headerSize + compSize;
    const trailerBytes = raw.length - containerBodyEnd;
    const version = trailerBytes >= 2
        ? ((raw[raw.length - 2] << 8) | raw[raw.length - 1])
        : null;

    return { compressionType, headerSize, compSize, uncompSize, version };
}

export function packGroupAuto(
    uncompressedData: Uint8Array,
    originalRawContainer: Uint8Array,
    bzip2BlockSize: number = 1,
): Uint8Array {
    const meta = readContainerMeta(originalRawContainer);

    switch (meta.compressionType) {
        case ContainerCompression.NONE:
            return packGroupUncompressed(uncompressedData, meta.version);
        case ContainerCompression.BZIP2:
            return packGroupBzip2(uncompressedData, meta.version, bzip2BlockSize);
        case ContainerCompression.GZIP:
            return packGroup(uncompressedData, meta.version);
        default:
            throw new Error(`Unknown compression type ${meta.compressionType} in original container — cannot repack`);
    }
}

export function packGroupBzip2(uncompressedData: Uint8Array, version: number | null = null, blockSize: number = 1): Uint8Array {
    const compressed = BZip2.compress(uncompressedData, blockSize);

    const containerSize = 9 + compressed.length + (version !== null ? 2 : 0);
    const container = new Uint8Array(containerSize);
    const view = new DataView(container.buffer, container.byteOffset);

    container[0] = 1; // bzip2
    view.setUint32(1, compressed.length, false);
    view.setUint32(5, uncompressedData.length, false);
    container.set(compressed, 9);

    if (version !== null) {
        container[containerSize - 2] = (version >> 8) & 0xFF;
        container[containerSize - 1] =  version       & 0xFF;
    }

    return container;
}

export function ensureOutputDirs(): void {
    if (!fs.existsSync(PACK_DIR)) fs.mkdirSync(PACK_DIR, { recursive: true });
    if (!fs.existsSync(INTERFACE_DIR)) fs.mkdirSync(INTERFACE_DIR, { recursive: true });
    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

export function loadStringPackFile(packFileName: string): Map<string, string> {
    const result = new Map<string, string>();
    const packFilePath = path.join(PACK_DIR, packFileName);

    if (!fs.existsSync(packFilePath)) return result;

    try {
        const lines = fs.readFileSync(packFilePath, 'utf-8').split(/\r?\n/);
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx === -1) continue;
            
            const key = trimmed.slice(0, eqIdx).trim();
            const value = trimmed.slice(eqIdx + 1).trim();
            if (key) {
                result.set(key, value);
            }
        }
    } catch {
    }

    return result;
}

export function loadPackFile(packFileName: string): Map<number, string> {
    const result = new Map<number, string>();
    const packFilePath = path.join(PACK_DIR, packFileName);

    if (!fs.existsSync(packFilePath)) return result;

    try {
        const lines = fs.readFileSync(packFilePath, 'utf-8').split(/\r?\n/);
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const parts = trimmed.split('=');
            if (parts.length === 2) {
                const id = parseInt(parts[0], 10);
                if (!isNaN(id)) result.set(id, parts[1]);
            }
        }
    } catch {
    }

    return result;
}

export function writePackFile(packFileName: string, lines: string[]): string {
    const outPath = path.join(PACK_DIR, packFileName);
    fs.writeFileSync(outPath, lines.join('\n') + '\n');
    return outPath;
}

export function writeConfigFile(configFileName: string, blocks: string[]): string {
    const outPath = path.join(CONFIG_DIR, configFileName);
    fs.writeFileSync(outPath, blocks.join('\n\n') + '\n');
    return outPath;
}

export function resolveName(debugName: string | null, prefix: string, fileId: number): string {
    return debugName ?? `${prefix}_${fileId}`;
}

export function formatColour(value: number): string {
    return `0x${value.toString(16).toUpperCase().padStart(6, '0')}`;
}

export function parseColour(value: string): number {
    return parseInt(value.replace('#', '0x'), 16);
}

export function computeCrc32(buffer: Uint8Array): number {
    let crc = -1;
    for (let i = 0; i < buffer.length; i++) {
        crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buffer[i]) & 0xFF];
    }
    return (crc ^ -1) >>> 0;
}

export function packGroup(uncompressedData: Uint8Array, version: number | null = null): Uint8Array {
    const deflated = deflateRaw(uncompressedData, {
        level: -1,
        windowBits: -15,
        memLevel: 8,
        strategy: 0,
    });

    const gzipLength = 10 + deflated.length + 8;
    const gzip = new Uint8Array(gzipLength);
    const gzipView = new DataView(gzip.buffer, gzip.byteOffset);

    gzip.set([0x1F, 0x8B, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], 0);
    gzip.set(deflated, 10);

    const footerOffset = 10 + deflated.length;
    gzipView.setUint32(footerOffset,     computeCrc32(uncompressedData), true);
    gzipView.setUint32(footerOffset + 4, uncompressedData.length & 0xFFFFFFFF, true);

    const containerSize = 9 + gzipLength + (version !== null ? 2 : 0);
    const container = new Uint8Array(containerSize);
    const containerView = new DataView(container.buffer, container.byteOffset);

    container[0] = 2;
    containerView.setUint32(1, gzipLength,               false);
    containerView.setUint32(5, uncompressedData.length,  false);
    container.set(gzip, 9);

    if (version !== null) {
        container[containerSize - 2] = (version >> 8) & 0xFF;
        container[containerSize - 1] =  version       & 0xFF;
    }

    return container;
}

export function packGroupUncompressed(data: Uint8Array, version: number | null = null): Uint8Array {
    const containerSize = 5 + data.length + (version !== null ? 2 : 0);
    const container = new Uint8Array(containerSize);
    const view = new DataView(container.buffer);

    container[0] = 0;
    view.setUint32(1, data.length, false);
    container.set(data, 5);

    if (version !== null) {
        container[containerSize - 2] = (version >> 8) & 0xFF;
        container[containerSize - 1] =  version       & 0xFF;
    }

    return container;
}

export function loadNameToIdMap(packFileName: string): Map<string, number> {
    const result = new Map<string, number>();
    const packFilePath = path.join(PACK_DIR, packFileName);

    if (!fs.existsSync(packFilePath)) return result;

    try {
        const lines = fs.readFileSync(packFilePath, 'utf-8').split(/\r?\n/);
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx === -1) continue;
            const id = parseInt(trimmed.slice(0, eqIdx), 10);
            if (!isNaN(id)) result.set(trimmed.slice(eqIdx + 1), id);
        }
    } catch {
    }

    return result;
}

export function readDirTree(dirTree: Set<string>, dirPath: string): void {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
        const target = `${entry.parentPath}/${entry.name}`;

        if (entry.isDirectory()) {
            readDirTree(dirTree, target);
        } else {
            dirTree.add(target);
        }
    }
}

export function findFiles(dirTree: Set<string>, extension: string): Set<string> {
    const results = new Set<string>();

    for (const entry of dirTree) {
        if (entry.endsWith(extension)) {
            results.add(entry);
        }
    }

    return results;
}

let cachedConfigDirTree: Set<string> | null = null;

function getConfigDirTree(): Set<string> {
    if (!cachedConfigDirTree) {
        const scriptsDir = `${Environment.BUILD_SRC_DIR}/scripts`;
        cachedConfigDirTree = new Set<string>();
        if (fs.existsSync(scriptsDir)) {
            readDirTree(cachedConfigDirTree, scriptsDir);
        }
    }
    return cachedConfigDirTree;
}

export function findConfigFiles(extension: string): Set<string> {
    return findFiles(getConfigDirTree(), extension);
}

export function readConfigFile(extension: string): Map<string, string[]> {
    const blocks = new Map<string, string[]>();
    const files = findFiles(getConfigDirTree(), extension);

    for (const file of files) {
        const rawLines = fs.readFileSync(file, 'utf-8').split('\n');

        let currentName: string | null = null;
        let currentLines: string[] = [];

        for (const raw of rawLines) {
            const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
            const trimmed = line.trim();

            if (trimmed.length === 0 || trimmed.startsWith('//')) continue;

            const headerMatch = trimmed.match(/^\[(.+)]$/);
            if (headerMatch) {
                if (currentName !== null) {
                    if (blocks.has(currentName)) {
                        throw new Error(`Duplicate config found: ${currentName} (in ${file})`);
                    }
                    blocks.set(currentName, currentLines);
                }
                currentName = headerMatch[1];
                currentLines = [];
                continue;
            }

            if (currentName !== null) {
                currentLines.push(line);
            }
        }

        if (currentName !== null) {
            if (blocks.has(currentName)) {
                throw new Error(`Duplicate config found: ${currentName} (in ${file})`);
            }
            blocks.set(currentName, currentLines);
        }
    }

    return blocks;
}

export function updateMasterIndex(
    archiveId: number,
    updatedContainers: Map<number, Uint8Array>,
    sourceDir: string = CACHE_DIR,
): Uint8Array {
    const masterPath = path.join(sourceDir, '255', `${archiveId}.dat`);

    if (!fs.existsSync(masterPath)) {
        throw new Error(`Master index not found at ${masterPath}`);
    }

    const masterRaw = new Uint8Array(fs.readFileSync(masterPath));

    const compSize = ((masterRaw[1] << 24) | (masterRaw[2] << 16) |
                      (masterRaw[3] << 8)  |  masterRaw[4]) >>> 0;
    const gzipPayload = masterRaw.subarray(9, 9 + compSize);
    const indexData   = ungzip(gzipPayload);

    const buf = new Packet(indexData);
    const protocol = buf.g1();
    if (protocol >= 6) buf.g4();
    const flags    = buf.g1();
    const hasNames = (flags & 0x1) !== 0;
    const groupCount = buf.g2();

    const groupIds: number[] = [];
    let prev = 0;
    for (let i = 0; i < groupCount; i++) {
        prev += buf.g2();
        groupIds.push(prev);
    }

    if (hasNames) {
        buf.pos += groupCount * 4;
    }

    const crcTableOffset     = buf.pos;
    const versionTableOffset = crcTableOffset + groupCount * 4;

    const patched     = new Uint8Array(indexData);
    const patchedView = new DataView(patched.buffer);

    if (protocol >= 6) {
        const currentInnerVersion = patchedView.getUint32(1, false);
        const newInnerVersion = currentInnerVersion + 1;
        patchedView.setUint32(1, newInnerVersion, false);
    }

    for (let i = 0; i < groupCount; i++) {
        const groupId      = groupIds[i];
        const newContainer = updatedContainers.get(groupId);
        if (!newContainer) continue;

        const oldVersion = patchedView.getInt32(versionTableOffset + i * 4, false);
        const newCrc = computeCrc32(newContainer.subarray(0, newContainer.length - 2));
        const newVersion = oldVersion + 1;

        patchedView.setUint32(crcTableOffset + i * 4, newCrc, false);
        patchedView.setInt32(versionTableOffset + i * 4, newVersion, false);
    }

    const masterVersion = (masterRaw.length - (9 + compSize)) >= 2
        ? ((masterRaw[masterRaw.length - 2] << 8) | masterRaw[masterRaw.length - 1])
        : null;

    const result = packGroup(patched, masterVersion);
    return result;
}

export function updateChecksumTable(
    updatedMasterIndexes: Map<number, Uint8Array>,
    sourceDir: string = CACHE_DIR,
): Uint8Array {
    const tablePath = path.join(sourceDir, '255', '255.dat');
    if (!fs.existsSync(tablePath)) {
        throw new Error(`Checksum table not found at ${tablePath}`);
    }

    const raw = new Uint8Array(fs.readFileSync(tablePath));
    const compressionType = raw[0];
    const compSize = ((raw[1] << 24) | (raw[2] << 16) | (raw[3] << 8) | raw[4]) >>> 0;

    const headerSize = compressionType === 0 ? 5 : 9;
    const containerEnd = headerSize + compSize;
    const trailerBytes = raw.length - containerEnd;
    const containerVersion = trailerBytes >= 2
        ? ((raw[raw.length - 2] << 8) | raw[raw.length - 1])
        : null;

    let payload: Uint8Array;
    if (compressionType === 0) {
        payload = raw.slice(5, 5 + compSize);
    } else {
        payload = ungzip(raw.subarray(9, 9 + compSize));
    }

    const patched     = new Uint8Array(payload);
    const patchedView = new DataView(patched.buffer);
    const archiveCount = Math.floor(payload.length / 8);

    for (const [id, newContainer] of updatedMasterIndexes) {
        if (id >= archiveCount) {
            console.warn(`Archive ${id} out of range (${archiveCount} entries)`);
            continue;
        }
        const offset = id * 8;
        const oldCrc = patchedView.getUint32(offset, false);
        const newCrc = computeCrc32(newContainer);
        const version = patchedView.getUint32(offset + 4, false);
        patchedView.setUint32(offset, newCrc, false);
        patchedView.setUint32(offset, newCrc, false);
        patchedView.setUint32(offset + 4, version + 1, false);
    }
    return packGroupUncompressed(patched, containerVersion);
}
 
export function writeMasterIndex(
    updatedMaster: Uint8Array,
    archiveId: number,
    outDir: string = CACHE_OUT_DIR,
): void {
    const dir  = path.join(outDir, '255');
    const outPath = path.join(dir, `${archiveId}.dat`);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(outPath, updatedMaster);
}

export function writeChecksumTable(updatedChecksum: Uint8Array, outDir: string = CACHE_OUT_DIR): void {
    const dir  = path.join(outDir, '255');
    const outPath = path.join(dir, '255.dat');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(outPath, updatedChecksum);
}

export function readFlatFile(archive: number, group: number): Uint8Array {
    const filePath = path.join(CACHE_DIR, String(archive), `${group}.dat`);
    if (!fs.existsSync(filePath)) {
        throw new Error(`Cache file not found: ${filePath}`);
    }
    return new Uint8Array(fs.readFileSync(filePath));
}
