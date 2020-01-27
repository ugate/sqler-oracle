'use strict';

// TODO : ESM comment the following lines...
const { Labrat, LOGGER } = require('@ugate/labrat');
const { Manager } = require('sqler');
const Path = require('path');
const Fs = require('fs');
const Os = require('os');
const { expect } = require('@hapi/code');
// TODO : import { Labrat, LOGGER } from '@ugate/labrat';
// TODO : import { Manager } from 'sqler.mjs';
// TODO : import * as Fs from 'fs';
// TODO : import * as Os from 'os';
// TODO : import { expect } from '@hapi/code';

const priv = { mgr: null, cache: null, rowCount: 100, mgrLogit: !!LOGGER.info };

// TODO : ESM uncomment the following line...
// export
class Tester {

  /**
   * Create table(s) used for testing
   */
  static async before() {
    Labrat.header('Creating test tables');
    
    const conf = getConf();
    priv.cache = null;
    priv.mgr = new Manager(conf, priv.cache, priv.mgrLogit);
    await priv.mgr.init();
    
    await priv.mgr.db.tst.ora_test.create.tables();
    await priv.mgr.commit();
    priv.created = true;
  }

  /**
   * Drop table(s) used for testing
   */
  static async after() {
    if (!priv.created) {
      Labrat.header('Skipping dropping of test tables');
      return;
    }
    Labrat.header('Dropping test tables');
    
    const conf = getConf();
    priv.cache = null;
    if (!priv.mgr) {
      priv.mgr = new Manager(conf, priv.cache, priv.mgrLogit);
      await priv.mgr.init();
    }
    
    await priv.mgr.db.tst.ora_test.delete.tables();
    await priv.mgr.commit();
    priv.created = false;
  }

  /**
   * Start cache (if present)
   */
  static async beforeEach() {
    const cch = priv.cache;
    priv.cache = null;
    if (cch && cch.start) await cch.start();
  }

  /**
   * Stop cache (if present)
   */
  static async afterEach() {
    const cch = priv.cache;
    priv.cache = null;
    if (cch && cch.stop) await cch.stop();
  }

  static async confHostMissing() {
    const conf = getConf();
    conf.univ.db.testId.host = '';
    new Manager(conf, priv.cache, priv.mgrLogit);
  }

  static async confServiceMissing() {
    const conf = getConf();
    conf.db.connections[0].service = false;
    new Manager(conf, priv.cache, priv.mgrLogit);
  }

  static async confDriverOptionsMissing() {
    const conf = getConf();
    conf.db.connections[0].driverOptions = false;
    new Manager(conf, priv.cache, priv.mgrLogit);
  }

  static async confCredentialsInvalid() {
    const conf = getConf();
    conf.univ.db.testId.password = 'fakePassowrd';
    const mgr = new Manager(conf, priv.cache, priv.mgrLogit);
    await mgr.init();
    return mgr.close();
  }

  static async confDriverOptionsGlobalNonOwnProps() {
    const conf = getConf(), conn = conf.db.connections[0];
    conn.driverOptions.pool = false;
    const TestGlobal = class {};
    TestGlobal.prototype.skip = 'Skip adding this global property';
    conn.driverOptions.global = new TestGlobal();
    conn.driverOptions.global.autocommit = false;
    const mgr = new Manager(conf, priv.cache, priv.mgrLogit);
    await mgr.init();
    return mgr.close();
  }

  static async confDriverOptionsConnAndPoolNames() {
    const conf = getConf(), conn = conf.db.connections[0];
    conn.driverOptions = conn.driverOptions || {};
    conn.driverOptions.global = conn.driverOptions.global || {};
    conn.driverOptions.global.connectionClass = 'TestDriverOptions';
    conn.pool = { alias: 'testDriverOptions' };
    const mgr = new Manager(conf, priv.cache, priv.mgrLogit);
    await mgr.init();
    return mgr.close();
  }

  static async confDriverOptionsSid() {
    return expectSid(getConf());
  }

  static async confDriverOptionsSidWithPing() {
    return expectSid(getConf(), { pingOnInit: true });
  }

  static async confDriverOptionsSidDefaults() {
    const conf = getConf(), conn = conf.db.connections[0];
    conf.univ.db.testId.port = conn.port = false;
    conf.univ.db.testId.protocol = conn.protocol = false;
    return expectSid(conf);
  }

  static async confDriverOptionsSidMultiple() {
    const conf = getConf(), conn2 = JSON.parse(JSON.stringify(conf.db.connections[0]));
    conn2.name += '2';
    conf.db.connections.push(conn2);
    return expectSid(conf);
  }

  static async confDriverOptionsPool() {
    const conf = getConf(), conn = conf.db.connections[0];
    conn.driverOptions = conn.driverOptions || {};
    conn.driverOptions.pool = conn.driverOptions.pool || {};
    conn.driverOptions.pool.poolMin = 5;
    conn.driverOptions.pool.poolMax = 10;
    conn.driverOptions.pool.poolTimeout = 6000;
    conn.driverOptions.pool.poolIncrement = 2;
    conn.driverOptions.pool.queueTimeout = 5000;
    conn.driverOptions.pool.poolAlias = 'testDriverOptionsPool';
    const mgr = new Manager(conf, priv.cache, priv.mgrLogit);
    await mgr.init();
    return mgr.close();
  }

  static async confConnectionAlternatives() {
    const conf = getConf(), conn = conf.db.connections[0];
    conn.host = conf.univ.db.testId.host;
    conn.port = conf.univ.db.testId.port;
    conn.protocol = conf.univ.db.testId.protocol;
    conf.univ.db.testId.host = false;
    conf.univ.db.testId.port = false;
    conf.univ.db.testId.protocol = false;
    const mgr = new Manager(conf, priv.cache, priv.mgrLogit);
    await mgr.init();
    return mgr.close();
  }

  static async createBindsIterInvalid() {
    return rows('create', { numOfIterations: 2 });
  }

  static async create() {
    return rows('create');
  }

  static async readAfterCreateAll() {
    const rslts = await priv.mgr.db.tst.auxy.all.rows({ type: 'READ' });
    //expect(rslts, 'read all results').length(priv.rowCount);
  }

  static async readAfterCreate() {
    return rows('read');
  }

  static async update() {
    return rows('update');
  }

  static async readAfterUpdate() {
    return rows('read');
  }

  static async delete() {
    return rows('read');
  }

  static async readAfterDelete() {
    return rows('read', null, true);
  }
}

// TODO : ESM comment the following line...
module.exports = Tester;

function getConf() {
  const conf = {
    "mainPath": 'test',
    "univ": {
      "db": {
        "testId": {
          "host": "localhost",
          "port": 1521,
          "protocol": "TCP",
          "username": Os.userInfo().username,
          "password": Os.userInfo().username
        }
      }
    },
    "db": {
      "dialects": {
        "oracle": './test/dialects/test-dialect.js'
      },
      "connections": [
        {
          "id": "testId",
          "name": "tst",
          "dir": "db",
          "service": "XE",
          "dialect": "oracle",
          "driverOptions": {
            "global": {
              "autocommit": false
            }
          }
        }
      ]
    }
  };
  return conf;
}

/**
 * Performs `priv.rowCount` CRUD operation(s) and validates the results
 * @param {String} op The CRUD operation name
 * @param {Manager~ExecOptions} [opts] The `sqler` execution options
 * @param {Boolean} [deleted] Truthy to indicate that no rows should appear in the results
 */
async function rows(op, opts, deleted) {
  Labrat.header(`Running ${op}`);
  if (LOGGER.info) LOGGER.info(`Performing "${op}" on ${priv.rowCount} test records`);

  if (!priv.mgr) {
    const conf = getConf();
    priv.mgr = new Manager(conf, priv.cache, priv.mgrLogit);
    await priv.mgr.init();
  }
  
  const proms = new Array(priv.rowCount), date = new Date();
  for (let i = 0, eopts; i < priv.rowCount; i++) {
    eopts = {};
    if (op === 'create') {
      eopts.binds = { id: i + 1, name: `${op} ${i}`, created: date, updated: date };
    } else if (op = 'update') {
      eopts.binds = { id: i + 1, updated: date };
    } else if (op === 'delete') {
      eopts.binds = { id: i + 1 };
    } else if (op === 'read') {
      eopts.binds = { id: i + 1 };
    }
    if (opts) Object.assign(eopts, opts);
    proms[i] = priv.mgr.db.tst[op].table.rows(eopts);
  }

  const rslts = await Promise.all(proms);
  await priv.mgr.commit();
  for (let rslt of rslts) {
    if (LOGGER.info) LOGGER.info(`Result for "${op}"`, rslt);
  }
}

/**
 * Expects the use of Oracle SIDs to work properly
 * @param {Manager~ConfigurationOptions} conf One or more configurations to generate
 * @param {Object} [testOpts] The SID test options
 * @param {String} [testOpts.sid] An alernative SID to use for `conf.db.connections[].driverOptions.sid`
 * Defaults to the `service` set on the connection.
 * @param {Boolean} [testOpts.pingOnInit] An alternative flag for `conf.db.connections[].driverOptions.pingOnInit`
 */
async function expectSid(conf, testOpts) {
  for (let conn of conf.db.connections) {
    conn.driverOptions.sid = (testOpts && testOpts.sid) || conn.service;
    // don't ping the connection pool since it may have not been setup
    conn.driverOptions.pingOnInit = (testOpts && testOpts.hasOwnProperty('pingOnInit')) ? testOpts.pingOnInit : false;
  }
  // ensure there is a manager logger for testing
  const mgr = new Manager(conf, priv.cache, priv.mgrLogit || generateTestAbyssLogger);
  const tns = Path.join(process.env.TNS_ADMIN, 'tnsnames.ora');

  await Fs.promises.access(tns, Fs.constants.F_OK);
  // TODO : check that the TNS records are valid? (await Fs.promises.readFile(tns)).toString()
  await mgr.init();
  await mgr.close();

  let ferr;
  try {
    await Fs.promises.access(tns)
  } catch (err) {
    ferr = err;
  }
  expect(ferr).to.be.error();
}

/**
 * Generate a test logger that just consumes logging
 * @param {Sring[]} [tags] The tags that will prefix the log output
 */
function generateTestAbyssLogger() {
  return function testAbyssLogger() {};
}

// when not ran in a test runner execute static Tester functions (excluding what's passed into Main.run) 
if (!Labrat.usingTestRunner()) {
  (async () => await Labrat.run(Tester))();
}