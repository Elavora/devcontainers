'use strict';

// .gitattributes da raiz: padrão da organização (docs/publicacao.md, seção ".gitattributes").
const test = require('node:test');
const assert = require('node:assert/strict');
const { readRepoFile } = require('./helpers.cjs');

const ESPERADO = [
  '* text=auto eol=lf',
  '',
  '*.bat text eol=crlf',
  '*.cmd text eol=crlf',
  '*.gif binary',
  '*.ico binary',
  '*.jpeg binary',
  '*.jpg binary',
  '*.pdf binary',
  '*.png binary',
  '*.webp binary',
  '',
  '*.sh text eol=lf',
  '*.yml text eol=lf',
  '*.yaml text eol=lf',
];

test('.gitattributes segue exatamente o padrão da organização (15 linhas)', () => {
  const linhas = readRepoFile('.gitattributes').replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n');
  assert.equal(linhas.length, 15);
  assert.deepEqual(linhas, ESPERADO);
});
