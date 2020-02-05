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

const priv = { mgr: null, cache: null, rowCount: 2, mgrLogit: !!LOGGER.info };

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

  static async confCredentialsInvalidReturnErrors() {
    const conf = getConf();
    conf.univ.db.testId.password = 'fakePassowrd';
    const mgr = new Manager(conf, priv.cache, priv.mgrLogit);
    const errd = await mgr.init(true), label = 'Manager.init() return';

    expect(errd, label).to.be.object();
    expect(errd.errors, `${label}.errors`).to.be.array();
    expect(errd.errors[0], `${label}.errors[0]`).to.be.error();

    return mgr.close();
  }

  static async confDriverOptionsGlobalNonOwnProps() {
    const conf = getConf(), conn = conf.db.connections[0];
    conn.driverOptions.pool = false;
    const TestGlobal = class {};
    TestGlobal.prototype.skip = 'Skip adding this global property';
    conn.driverOptions.global = new TestGlobal();
    conn.driverOptions.global.fakeObject = {};
    conn.driverOptions.global.fakeConstant = '${FAKE_CONSTANT_NAME}';
    conn.driverOptions.global.autoCommit = false;
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
    // test constant pool min from oracledb.poolMin
    conn.driverOptions.pool.poolMin = '${poolMin}';
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

  //======================== Executions ========================

  static async createBindsMissing() {
    return rows('create', null, {
      binds: { created: new Date() }
    });
  }

  static async create() {
    return rows('create', { autoCommit: false });
  }

  static async readAfterCreateAll() {
    return rows('read-all', {
      type: 'READ',
      driverOptions: {
        exec: {
          // orcaledb constant for array output
          outFormat: '${OUT_FORMAT_ARRAY}'
        }
      }
    });
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
    return rows('read', null, { deleted: true });
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
              "maxRows": 0
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
 * @param {Object} [testOpts] The test options
 * @param {Boolean} [testOpts.deleted] Truthy if the rows are expected to be deleted
 * @param {Object} [testOpts.binds] An alternative binds to pass
 */
async function rows(op, opts, testOpts) {
  Labrat.header(`Running ${op}`);
  if (LOGGER.info) LOGGER.info(`Performing "${op}" on ${priv.rowCount} test records`);

  // default autoCommit = true
  const autoCommit = opts && opts.hasOwnProperty('autoCommit') ? opts.autoCommit : true;

  if (!priv.mgr) {
    const conf = getConf();
    // need to ensure the connection class and pool alias are consistent accross row tests
    conf.driverOptions = conf.driverOptions || {};
    conf.driverOptions.global = conf.driverOptions.global || {};
    conf.driverOptions.global.connectionClass = 'TEST_CONN_CLASS';
    conf.pool = conf.pool || {};
    conf.pool.alias = 'TEST_POOL_ALIAS';
    priv.mgr = new Manager(conf, priv.cache, testOpts && testOpts.hasOwnProperty('managerLogger') ? testOpts.managerLogger : priv.mgrLogit);
    await priv.mgr.init();
  }

  let txId, txId2, tx2Rslt;
  if (!autoCommit) {
    txId = await priv.mgr.db.tst.beginTransaction();
    // test double execution to ensure the transactions are isolated
    /*txId2 = await priv.mgr.db.tst.beginTransaction();
    tx2Rslt = priv.mgr.db.tst.create.table.rows({
      autoCommit: false,
      transactionId: txId2,
      binds: { id: 1, name: `${op} 1 (simultaneous transaction)`, created: new Date(), updated: new Date() }
    });*/
  }
  
  let proms, rowCount = 0, colCount = 4;
  if (op === 'read-all') {
    rowCount = priv.rowCount;
    opts.transactionId = txId;
    proms = [ priv.mgr.db.tst.auxy.all.rows(opts) ];
  } else {
    rowCount = 1; // one row at a time
    proms = new Array(priv.rowCount);
    const date = new Date();
    for (let i = 0, xopts; i < priv.rowCount; i++) {
      xopts = { transactionId: txId };
      if (testOpts && testOpts.binds) {
        xopts.binds = testOpts.binds;
      } else if (op === 'create') {
        xopts.binds = { id: i + 1, name: `${op} ${i}`, created: date, updated: date };
      } else if (op === 'update') {
        xopts.binds = { id: i + 1, updated: date, someFakeBindNotInSql: 'DONT_INCLUDE_ME' };
      } else if (op === 'delete') {
        xopts.binds = { id: i + 1 };
      } else if (op === 'read') {
        xopts.binds = { id: i + 1 };
      }
      if (opts) Object.assign(xopts, opts);
      proms[i] = priv.mgr.db.tst[op].table.rows(xopts);
    }
  }

  const rslts = await Promise.all(proms);
  let committed;
  for (let rslt of rslts) {
    if (LOGGER.info) LOGGER.info(`Result for "${op}"`, rslt);
    expect(rslt, 'CRUD result').to.be.object();
    if (op === 'read' || op === 'read-all') {
      expect(rslt.rows, `${op} result.rows`).to.be.array();
      if (!testOpts || !testOpts.deleted) {
        expect(rslt.rows, `${op} result.rows.length`).to.have.length(rowCount);
        for (let row of rslt.rows) {
          if (opts && opts.driverOptions && opts.driverOptions.exec && opts.driverOptions.exec.outFormat
              && opts.driverOptions.exec.outFormat === '${OUT_FORMAT_ARRAY}') {
            expect(row, `${op} result.rows[] (array)`).to.be.array();
            expect(row, `${op} result.rows[] (array)`).to.be.length(colCount);
          } else {
            expect(row, `${op} result.rows[] (object)`).to.be.object();
            expect(Object.getOwnPropertyNames(row), `${op} result.rows[] (column count)`).to.be.length(colCount);
          }
        }
      }
    } else {
      expect(rslt.raw, `${op} result.raw`).to.be.object();
      // oracle specific checks
      expect(rslt.raw.rowsAffected, `${op} result.raw.rowsAffected`).to.equal(rowCount);
    }

    if (!autoCommit) {
      expect(rslt.commit, 'result.commit').to.be.function();
      expect(rslt.rollback, 'result.rollback').to.be.function();

      if (!committed) {
        await rslt.commit();
        committed = true;
      }
    } else {
      expect(rslt.commit, 'result.commit').to.be.undefined();
      expect(rslt.rollback, 'result.rollback').to.be.undefined();
    }
  }
  if (tx2Rslt) await tx2Rslt.rollback();
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