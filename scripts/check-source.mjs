import {readFileSync, readdirSync} from 'node:fs';
import {join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const source = fileURLToPath(new URL('../src/', import.meta.url));
const decoder = new TextDecoder('utf-8', {fatal: true});
const textExtensions = /\.(?:js|mjs|json|css|hbs)$/;
function* sourceFiles(directory) {
    for (const entry of readdirSync(directory, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) yield* sourceFiles(path);
        else if (entry.isFile() && textExtensions.test(entry.name)) yield path;
    }
}
let textFiles = 0, modules = 0;
for (const path of sourceFiles(source)) {
    try { decoder.decode(readFileSync(path));textFiles++; }
    catch (error) {
        console.error(`${relative(source, path)}: invalid UTF-8 (${error.message})`);
        process.exitCode = 1;
        continue;
    }
    if (/\.(?:js|mjs)$/.test(path)) {
        const result = spawnSync(process.execPath, ['--check', path], {stdio: 'inherit'});
        if (result.error) {console.error(result.error.message);process.exitCode = 1;}
        else if (result.status !== 0) process.exitCode = 1;
        modules++;
    }
}
console.log(`Checked UTF-8 in ${textFiles} source files and syntax in ${modules} modules.`);
