'use strict';

const Tester = require('./lib/main');
const Lab = require('@hapi/lab');
const lab = Lab.script();
exports.lab = lab;
// ESM uncomment the following lines...
// TODO : import * as Lab from '@hapi/lab';
// TODO : import * as Tester from './lib/main.mjs';
// TODO : export * as lab from lab;

const TEST_TKO = 10000;
const plan = `Oracle DB Manager`;

// node test/lib/main.js -NODE_ENV=test

// "node_modules/.bin/lab" test/main.js -v
// "node_modules/.bin/lab" test/main.js -vi 1

lab.experiment(plan, () => {
  
  if (Tester.before) lab.before(Tester.before);
  if (Tester.after) lab.after(Tester.after);
  if (Tester.beforeEach) lab.beforeEach(Tester.beforeEach);
  if (Tester.afterEach) lab.afterEach(Tester.afterEach);

  lab.test(`${plan}: Create, read, update, read, delete and read test rows`, { timeout: TEST_TKO }, Tester.cruds);
});