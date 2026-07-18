import fs from 'fs';
import path from 'path';
import Packet from '#/io/Packet.js';
import ScriptVarType from '#/cache/config/ScriptVarType.js';
import {
    readConfigFile,
    writePackFile,
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
    const configBlocks = readConfigFile('.dbtable');

    if (configBlocks.size === 0) {
        console.error('No .dbtable entries found');
        return;
    }

    const names = Array.from(configBlocks.keys()).sort();

    const buf = new Packet(new Uint8Array(1024 * 1024));
    buf.p2(names.length);

    const packLines: string[] = [];

    for (let id = 0; id < names.length; id++) {
        const debugName = names[id];
        const lines = configBlocks.get(debugName)!;

        const columns = [];
        const defaults = [];

        for (const line of lines) {
            const eq = line.indexOf('=');
            if (eq === -1) continue;

            const key = line.slice(0, eq).trim();
            const value = line.slice(eq + 1).trim();

            if (key === 'column') {
                const column = parseCsv(value);
                const columnName = column.shift();
                if (!columnName) continue;

                const types = [];
                const properties = [];

                for (let j = 0; j < column.length; j++) {
                    const part = column[j];

                    if (part.toUpperCase() === part) {
                        properties.push(part);
                    } else {
                        const typeChar = ScriptVarType.getTypeChar(part);
                        if (typeChar === null) {
                            throw new Error(`Invalid column type "${part}" in dbtable [${debugName}]`);
                        }

                        types.push(typeChar);
                    }
                }

                if (properties.find(p => p === 'INDEXED') && !properties.find(p => p === 'REQUIRED')) {
                    throw new Error(`INDEXED columns must be marked REQUIRED as well in dbtable [${debugName}]`);
                }

                columns.push({ name: columnName, types, properties });
            } else if (key === 'default') {
                const parts = parseCsv(value);
                const columnName = parts.shift();
                if (!columnName) continue;

                const columnIndex = columns.findIndex(col => col.name === columnName);
                const values = parts;

                if (columnIndex === -1) {
                    throw new Error(`Could not assign default to column "${columnName}" - column does not exist in dbtable [${debugName}]`);
                }

                if (columns[columnIndex].properties.find(p => p === 'REQUIRED')) {
                    throw new Error(`Could not assign default to column "${columnName}" - no default value is allowed because the column is marked REQUIRED in dbtable [${debugName}]`);
                }

                defaults[columnIndex] = values;
            }
        }

        if (columns.length > 0) {
            buf.p1(1);

            buf.p1(columns.length);
            for (let i = 0; i < columns.length; i++) {
                const column = columns[i];

                let flags = i;
                if (defaults[i]) {
                    flags |= 0x80;
                }
                buf.p1(flags);

                buf.p1(column.types.length);
                for (let j = 0; j < column.types.length; j++) {
                    buf.p1(column.types[j] as number);
                }

                if (flags & 0x80) {
                    buf.p1(1); // # of fields

                    for (let j = 0; j < column.types.length; j++) {
                        const type = column.types[j];
                        const value = lookupParamValue(type as number, defaults[i][j]);
                        if (value === null) {
                            throw new Error(`Data invalid in column, double-check the reference exists: default=${column.name},${defaults[i].join(',')} in dbtable [${debugName}]`);
                        }

                        if (type === ScriptVarType.STRING) {
                            buf.pjstr(value as string);
                        } else {
                            buf.p4(value as number);
                        }
                    }
                }
            }

            buf.p1(255); // end of column tuple
        }

        if (columns.length > 0) {
            buf.p1(251);

            buf.p1(columns.length);
            for (let i = 0; i < columns.length; i++) {
                buf.pjstr(columns[i].name as string);
            }
        }

        if (columns.length > 0) {
            buf.p1(252);

            buf.p1(columns.length);
            for (let i = 0; i < columns.length; i++) {
                const column = columns[i];

                let props = 0;
                for (const prop of column.properties) {
                    if (prop === 'INDEXED') {
                        props |= 0x1;
                    } else if (prop === 'REQUIRED') {
                        props |= 0x2;
                    } else if (prop === 'LIST') {
                        props |= 0x4;
                    } else if (prop === 'CLIENTSIDE') {
                        props |= 0x8;
                    }
                }
                buf.p1(props);
            }
        }

        if (debugName.length > 0) {
            buf.p1(250);
            buf.pjstr(debugName);
        }

        buf.p1(0);

        packLines.push(`${id}=${debugName}`);
    }

    writePackFile('dbtable.pack', packLines);

    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, 'dbtable.dat'), buf.data.subarray(0, buf.pos));
}

pack();
