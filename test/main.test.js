'use strict';

process.env.UV_THREADPOOL_SIZE = 10;

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

const TEST_TKO = 3000;
const TEST_LONG_TKO = 7000;
const plan = `Oracle DB Manager`;

// node test/lib/main.js someTestFunction -NODE_ENV=test

// "node_modules/.bin/lab" test/main.test.js -v
// "node_modules/.bin/lab" test/main.test.js -vi 1

lab.experiment(plan, () => {
  
  if (Tester.before) lab.before(Tester.before);
  if (Tester.after) lab.after(Tester.after);
  if (Tester.beforeEach) lab.beforeEach(Tester.beforeEach);
  if (Tester.afterEach) lab.afterEach(Tester.afterEach);

  // standard sqler tests

  lab.test(`${plan}: Connection Failure`, { timeout: TEST_LONG_TKO }, Labrat.expectFailure('onUnhandledRejection', { expect, label: 'init throw' }, Tester.initThrow));
  lab.test(`${plan}: No Pool`, { timeout: TEST_TKO }, Tester.poolNone);
  lab.test(`${plan}: Pool Property Defaults`, { timeout: TEST_TKO }, Tester.poolPropSwap);
  lab.test(`${plan}: Driver Options No Pool/Connection`, { timeout: TEST_TKO }, Tester.driverOptionsPoolConnNone);
  lab.test(`${plan}: Driver Options Pool or Connection`, { timeout: TEST_TKO }, Tester.driverOptionsPoolConnSwap);
  lab.test(`${plan}: Driver Options Client`, { timeout: TEST_TKO }, Tester.driverOptionsClient);
  lab.test(`${plan}: Host and Port Defaults`, { timeout: TEST_TKO }, Tester.hostPortSwap);
  lab.test(`${plan}: Multiple connections`, { timeout: TEST_TKO }, Tester.multipleConnections);
  lab.test(`${plan}: Close before init`, { timeout: TEST_TKO }, Tester.closeBeforeInit);
  lab.test(`${plan}: Prepared Statement Explicit Name Not Supported`, Labrat.expectFailure('onUnhandledRejection', { expect, label: 'no driver options throw' }, Tester.preparedStatementNameThrow));
  lab.test(`${plan}: State`, { timeout: TEST_TKO }, Tester.state);

  lab.test(`${plan}: CRUD`, { timeout: TEST_TKO }, Tester.crud);
  lab.test(`${plan}: Execution Driver Options and Prepared Statement (Alternatives)`, { timeout: TEST_TKO }, Tester.execDriverOptionsAlt);
  lab.test(`${plan}: Invalid SQL`, Labrat.expectFailure('onUnhandledRejection', { expect, label: 'invalid SQL throw' }, Tester.sqlInvalidThrow));
  lab.test(`${plan}: Invalid bind parameter`, Labrat.expectFailure('onUnhandledRejection', { expect, label: 'invalid bind param throw' }, Tester.bindsInvalidThrow));
  lab.test(`${plan}: Leave transaction open`, { timeout: TEST_TKO }, Tester.transactionLeaveOpen);
  lab.test(`${plan}: Rollback transaction`, { timeout: TEST_TKO }, Tester.transactionRollback);

  // vendor specific tests

  lab.test(`${plan}: Driver Options SID`, { timeout: TEST_TKO }, Tester.driverOptionsSid);
  lab.test(`${plan}: Driver Options SID Ping (Error)`, { timeout: TEST_LONG_TKO }, Labrat.expectFailure('onUnhandledRejection', { expect, label: 'SID ping' }, Tester.driverOptionsSidWithPing));
  lab.test(`${plan}: Driver Options SID (defaults)`, { timeout: TEST_TKO }, Tester.driverOptionsSidDefaults);
  lab.test(`${plan}: Driver Options SID (multiple)`, { timeout: TEST_TKO }, Tester.driverOptionsSidMultiple);
  lab.test(`${plan}: Driver Options Pool`, { timeout: TEST_TKO }, Tester.driverOptionsPool);

});