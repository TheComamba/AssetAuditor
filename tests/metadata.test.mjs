import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
const json = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const placeholders = text => [...new Set(text.match(/\{\w+\}/g) ?? [])].sort();

test('registered translations have matching keys and interpolation parameters', () => {
    const manifest = json('../src/module.json');
    const english = json('../src/lang/en.json');
    for (const language of manifest.languages) {
        const translated = json('../src/' + language.path);
        assert.deepEqual(Object.keys(translated).sort(), Object.keys(english).sort(), language.lang);
        for (const key of Object.keys(english)) {
            assert.equal(typeof translated[key], 'string', `${language.lang}: ${key}`);
            assert.deepEqual(placeholders(translated[key]), placeholders(english[key]), `${language.lang}: ${key}`);
        }
    }
});
test('release versions agree and manifest resources exist', () => {
    const manifest = json('../src/module.json'), pkg = json('../package.json'), lock = json('../package-lock.json');
    assert.equal(manifest.version, pkg.version);assert.equal(pkg.version, lock.version);
    assert.equal(pkg.version, lock.packages[''].version);
    for (const path of [...manifest.esmodules, ...(manifest.styles ?? []), ...manifest.languages.map(language => language.path)]) {
        assert(existsSync(new URL('../src/' + path, import.meta.url)), path);
    }
});
