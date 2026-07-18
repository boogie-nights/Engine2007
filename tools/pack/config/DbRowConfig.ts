import fs from 'fs';
import path from 'path';
import Packet from '#/io/Packet.js';
import ScriptVarType from '#/cache/config/ScriptVarType.js';
import DbTableType from '#/cache/config/DbTableType.js';
import {
    readConfigFile,
    writePackFile,
    loadNameToIdMap,
} from '#tools/util/ConfigPackHelper.ts';
import { lookupParamValue } from '#tools/pack/config/ParamConfig.js';

const OUT_DIR = path.join('data', 'pack', 'server');

function parseCsv(str: string): string[] {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < str.length; i++) {
        const char = str.charAt(i);

        if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else if (char === '"') {
            inQuotes = !inQuotes;
        } else {
            current += char;
        }
    }

    result.push(current);
    return result;
}

export function pack() {
    const configBlocks = readConfigFile('.dbrow');

    if (configBlocks.size === 0) {
        console.error('No .dbrow entries found');
        return;
    }

    DbTableType.load('data/pack');

    const namesToIds = loadNameToIdMap('dbtable.pack');
    
    const idsToNames = new Map<number, string>();
    for (const [name, id] of namesToIds.entries()) {
        idsToNames.set(id, name);
    }

    const names = Array.from(configBlocks.keys()).sort();

    const buf = new Packet(new Uint8Array(1024 * 1024));
    buf.p2(names.length);

    const packLines: string[] = [];

    for (let id = 0; id < names.length; id++) {
        const debugName = names[id];
        const lines = configBlocks.get(debugName)!;

        let tableId = -1;
        const data = [];

        for (const line of lines) {
            const eq = line.indexOf('=');
            if (eq === -1) continue;

            const key = line.slice(0, eq).trim();
            const value = line.slice(eq + 1).trim();

            if (key === 'table') {
                const index = namesToIds.get(value);
                if (index === undefined) {
                    throw new Error(`Unknown table "${value}" for dbrow [${debugName}]`);
                }
                tableId = index;
            }
        }

        if (tableId === -1) {
            throw new Error(`No table defined for dbrow [${debugName}]`);
        }

        const table = DbTableType.get(tableId);
        if (!table) {
            throw new Error(`Could not find loaded table type for ID ${tableId} (table config: ${idsToNames.get(tableId)}) in dbrow [${debugName}]`);
        }

        for (const line of lines) {
            const eq = line.indexOf('=');
            if (eq === -1) continue;

            const key = line.slice(0, eq).trim();
            const value = line.slice(eq + 1).trim();

            if (key === 'data') {
                const parts = parseCsv(value);
                const column = parts.shift();
                const values = parts;

                if (typeof column === 'undefined' || table.columnNames.indexOf(column) === -1) {
                    throw new Error(`Data invalid in row, column "${column}" does not exist in table "${table.debugname}" for dbrow [${debugName}]: data=${value}`);
                }

                data.push({ column, values });
            }
        }

        if (data.length > 0) {
            buf.p1(3);

            buf.p1(table.types.length);
            for (let i = 0; i < table.types.length; i++) {
                buf.p1(i);

                const types = table.types[i];
                buf.p1(types.length);
                for (let j = 0; j < types.length; j++) {
                    buf.p1(types[j]);
                }

                const columnName = table.columnNames[i];
                const fields = data.filter(d => d.column === columnName);
                const props = table.props[i];

                const REQUIRED = 0x2;
                const LIST = 0x4;

                if ((props & REQUIRED) !== 0 && !fields.length) {
                    throw new Error(`${columnName} column is marked REQUIRED in table "${table.debugname}", please add data for it in dbrow [${debugName}]`);
                }

                if ((props & LIST) === 0 && fields.length > 1) {
                    throw new Error(`${columnName} column has multiple data values but is not marked as LIST in table "${table.debugname}" for dbrow [${debugName}]`);
                }

                buf.p1(fields.length);
                for (let j = 0; j < fields.length; j++) {
                    const values = fields[j].values;

                    for (let k = 0; k < values.length; k++) {
                        const type = types[k];
                        const value = lookupParamValue(type, values[k]);
                        if (value === null) {
                            throw new Error(`Data invalid in row, double-check the reference exists: data=${fields[j].column},${values.join(',')} in dbrow [${debugName}]`);
                        }

                        if (type === ScriptVarType.STRING) {
                            buf.pjstr(value as string);
                        } else {
                            buf.p4(value as number);
                        }
                    }
                }
            }
            buf.p1(255);
        }

        buf.p1(4);
        buf.p2(table.id);

        if (debugName.length > 0) {
            buf.p1(250);
            buf.pjstr(debugName);
        }

        buf.p1(0);

        packLines.push(`${id}=${debugName}`);
    }

    writePackFile('dbrow.pack', packLines);

    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, 'dbrow.dat'), buf.data.subarray(0, buf.pos));
}

pack();
