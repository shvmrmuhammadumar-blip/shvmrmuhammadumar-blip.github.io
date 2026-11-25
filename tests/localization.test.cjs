const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const localizationPath = path.join(__dirname, '..', 'lib', 'localization.ts');
const source = fs.readFileSync(localizationPath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const localizationModule = new Module(localizationPath, module);
localizationModule.filename = localizationPath;
localizationModule.paths = Module._nodeModulePaths(path.dirname(localizationPath));
localizationModule._compile(compiled, localizationPath);

const { t } = localizationModule.exports;

test('post deletion confirmation is localized in every supported language', () => {
  const expected = {
    uz: {
      title: 'Bu postni o‘chirmoqchimisiz?',
      cancel: 'Bekor qilish',
      remove: 'O‘chirish',
      confirmation: 'TASDIQLASH',
    },
    en: {
      title: 'Delete this post?',
      cancel: 'Cancel',
      remove: 'Delete',
      confirmation: 'CONFIRMATION',
    },
    ru: {
      title: 'Удалить эту публикацию?',
      cancel: 'Отмена',
      remove: 'Удалить',
      confirmation: 'ПОДТВЕРЖДЕНИЕ',
    },
  };

  for (const [locale, labels] of Object.entries(expected)) {
    assert.equal(t(locale, 'Delete this post?'), labels.title);
    assert.equal(t(locale, 'Cancel'), labels.cancel);
    assert.equal(t(locale, 'Delete'), labels.remove);
    assert.equal(t(locale, 'CONFIRMATION'), labels.confirmation);
    assert.ok(t(locale, 'This post will be permanently deleted. This action cannot be undone.'));
    assert.ok(t(locale, 'Could not delete the post. Check your permissions and try again.'));
  }
});
