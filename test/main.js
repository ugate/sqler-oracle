'use strict';

const Tester = require('./lib/main');
const { Labrat } = require('@ugate/labrat');
const { expect } = require('@hapi/code');
const Lab = require('@hapi/lab');
const lab = Lab.script();
exports.lab = lab;
// ESM uncomment the following lines...
// TODO : import * as Lab from '@hapi/lab';
// TODO : import * as Tester from './lib/main.mjs';
// TODO : import { Labrat } from '@ugate/labrat';
// TODO : import { expect } from '@hapi/code';
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

  lab.test(`${plan}: Missing Host (Error)`, Labrat.expectFailure('onUnhandledRejection', { expect, label: 'host' }, Tester.confHostMissing));

  lab.test(`${plan}: Multiple Manager Pools`, { timeout: TEST_TKO }, Tester.multipleManagerPools);
  lab.test(`${plan}: Prototype Driver Options Global`, { timeout: TEST_TKO }, Tester.protoGlobals);
  lab.test(`${plan}: Driver Options`, { timeout: TEST_TKO }, Tester.driverOptions);
  lab.test(`${plan}: SID Options`, { timeout: TEST_TKO }, Tester.managerSid);

  lab.test(`${plan}: CREATE`, { timeout: TEST_TKO }, Tester.create);
  lab.test(`${plan}: READ (after create)`, { timeout: TEST_TKO }, Tester.readAfterCreate);
  lab.test(`${plan}: UPDATE`, { timeout: TEST_TKO }, Tester.update);
  lab.test(`${plan}: READ (after update)`, { timeout: TEST_TKO }, Tester.readAfterUpdate);
  lab.test(`${plan}: DELETE`, { timeout: TEST_TKO }, Tester.delete);
  lab.test(`${plan}: READ (after delete)`, { timeout: TEST_TKO }, Tester.readAfterDelete);

});