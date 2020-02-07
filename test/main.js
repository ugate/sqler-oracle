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

// node test/lib/main.js -NODE_ENV=test

// "node_modules/.bin/lab" test/main.js -v
// "node_modules/.bin/lab" test/main.js -vi 1

lab.experiment(plan, () => {
  
  if (Tester.before) lab.before(Tester.before);
  if (Tester.after) lab.after(Tester.after);
  if (Tester.beforeEach) lab.beforeEach(Tester.beforeEach);
  if (Tester.afterEach) lab.afterEach(Tester.afterEach);

  lab.test(`${plan}: Host Missing (Error)`, Labrat.expectFailure('onUnhandledRejection', { expect, label: 'host' }, Tester.confHostMissing));
  lab.test(`${plan}: Service/SID Missing (Error)`, Labrat.expectFailure('onUnhandledRejection', { expect, label: 'service or SID' }, Tester.confServiceMissing));
  lab.test(`${plan}: Credentials Invalid (Error)`, Labrat.expectFailure('onUnhandledRejection', { expect, label: 'credentials' }, Tester.confCredentialsInvalid));
  lab.test(`${plan}: Credentials Invalid (return Error)`, { timeout: TEST_TKO }, Tester.confCredentialsInvalidReturnErrors);

  lab.test(`${plan}: Driver Options Missing`, { timeout: TEST_TKO }, Tester.confDriverOptionsMissing);
  lab.test(`${plan}: Driver Options Global Non-Own Properties`, { timeout: TEST_TKO }, Tester.confDriverOptionsGlobalNonOwnProps);
  lab.test(`${plan}: Driver Options Custom Pool/Connection Naming`, { timeout: TEST_TKO }, Tester.confDriverOptionsConnAndPoolNames);
  lab.test(`${plan}: Driver Options SID`, { timeout: TEST_TKO }, Tester.confDriverOptionsSid);
  lab.test(`${plan}: Driver Options SID Ping (Error)`, { timeout: TEST_LONG_TKO }, Labrat.expectFailure('onUnhandledRejection', { expect, label: 'SID ping' }, Tester.confDriverOptionsSidWithPing));
  lab.test(`${plan}: Driver Options SID (defaults)`, { timeout: TEST_TKO }, Tester.confDriverOptionsSidDefaults);
  lab.test(`${plan}: Driver Options SID (multiple)`, { timeout: TEST_TKO }, Tester.confDriverOptionsSidMultiple);
  lab.test(`${plan}: Driver Options Pool`, { timeout: TEST_TKO }, Tester.confDriverOptionsPool);
  lab.test(`${plan}: Connection Alternatives`, { timeout: TEST_TKO }, Tester.confConnectionAlternatives);

  lab.test(`${plan}: Execute Binds Missing (Error)`, { timeout: TEST_LONG_TKO }, Labrat.expectFailure('onUnhandledRejection', { expect, label: 'binds missing' }, Tester.createBindsMissing));

  lab.test(`${plan}: CREATE`, { timeout: TEST_TKO }, Tester.create);
  lab.test(`${plan}: READ ALL (after create)`, { timeout: TEST_TKO }, Tester.readAfterCreateAll);
  lab.test(`${plan}: READ (after create)`, { timeout: TEST_TKO }, Tester.readAfterCreate);
  lab.test(`${plan}: UPDATE`, { timeout: TEST_TKO }, Tester.update);
  lab.test(`${plan}: READ (after update)`, { timeout: TEST_TKO }, Tester.readAfterUpdate);
  lab.test(`${plan}: DELETE`, { timeout: TEST_TKO }, Tester.delete);
  lab.test(`${plan}: READ (after delete)`, { timeout: TEST_TKO }, Tester.readAfterDelete);

});