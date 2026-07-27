import fs from 'fs';
import path from 'path';

import Environment from '#/util/Environment.ts';
import { loadDirExtFull } from '#tools/pack/Parse.ts';

function scriptPackPath(): string {
    return `${Environment.BUILD_SRC_DIR}/pack/script.pack`;
}

function loadScriptPack(): Map<number, string> {
    const pack = new Map<number, string>();
    const file = scriptPackPath();

    if (!fs.existsSync(file)) {
        return pack;
    }

    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    for (const line of lines) {
        if (!line.length || !/^\d+=/.test(line)) {
            continue;
        }

        const idx = line.indexOf('=');
        const id = parseInt(line.substring(0, idx), 10);
        const name = line.substring(idx + 1);

        if (!name.length) {
            continue;
        }

        pack.set(id, name);
    }

    return pack;
}

function saveScriptPack(pack: Map<number, string>): void {
    const file = scriptPackPath();
    const dir = path.dirname(file);

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const contents =
        Array.from(pack.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([id, name]) => `${id}=${name}`)
            .join('\n') + '\n';

    fs.writeFileSync(file, contents);
}

function crawlScriptNames(): string[] {
    const names = new Set<string>();

    loadDirExtFull(`${Environment.BUILD_SRC_DIR}/scripts`, '.rs2', (lines: string[], file: string) => {
        if (file === `${Environment.BUILD_SRC_DIR}/scripts/engine.rs2`) {
            // compiler type-signature declarations only, not real scripts
            return;
        }
        
        if (file === `${Environment.BUILD_SRC_DIR}/scripts/clientscript.rs2`) {
            // compiler type-signature declarations only, not real scripts
            return;
        }

        for (const line of lines) {
            if (line.startsWith('[')) {
                const end = line.indexOf(']');
                if (end !== -1) {
                    names.add(line.substring(0, end + 1));
                }
            }
        }
    });

    return Array.from(names);
}

export function regenScriptPack(): void {
    const pack = loadScriptPack();
    const existingNames = new Set(pack.values());
    let nextId = pack.size ? Math.max(...pack.keys()) + 1 : 0;

    let added = 0;
    for (const name of crawlScriptNames()) {
        if (existingNames.has(name)) {
            continue;
        }

        pack.set(nextId, name);
        existingNames.add(name);
        nextId++;
        added++;
    }

    if (added > 0 || !fs.existsSync(scriptPackPath())) {
        saveScriptPack(pack);
    }
}