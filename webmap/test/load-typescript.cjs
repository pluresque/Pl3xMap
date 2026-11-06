const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

module.exports = function load(relative, mocks = {}, globals = {}) {
    const filename = path.join(__dirname, '..', relative);
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}
    }).outputText;
    const exports = {};
    vm.runInNewContext(source, {
        exports, console, AbortController, setTimeout, clearTimeout, Date,
        require(name) {
            if (!(name in mocks)) throw new Error(`Unexpected dependency: ${name}`);
            return mocks[name];
        },
        ...globals
    }, {filename});
    return exports;
};
