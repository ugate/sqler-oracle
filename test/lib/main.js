'use strict';

// process.env.DPI_DEBUG_LEVEL = 16;

// TODO : ESM comment the following lines...
const { Labrat, LOGGER } = require('@ugate/labrat');
const typedefs = require('sqler/typedefs');
const { Manager } = require('sqler');
const Stream = require('stream');
const Path = require('path');
const Fs = require('fs');
const Os = require('os');
const { expect } = require('@hapi/code');
const readChunk = require('read-chunk');
const imageType = require('image-type');
// TODO : import { Labrat, LOGGER } from '@ugate/labrat';
// TODO : import { Manager } from 'sqler.mjs';
// TODO : import * as Fs from 'fs';
// TODO : import * as Os from 'os';
// TODO : import { expect } from '@hapi/code';
// TODO : import * as readChunk from 'readChunk';
// TODO : import * as imageType from 'imageType';

const CONF_SUFFIX_VAR = 'SQLER_CONF_FILE_SUFFIX';
const test = {
  mgr: null,
  cache: null,
  rowCount: 2,
  mgrLogit: !!LOGGER.info,
  vendor: 'oracle',
  defaultHost: 'sqler_oracle',
  defaultPort: 1521,
  defaultProtocol: 'TCP',
  conf: {}
};

// TODO : ESM uncomment the following line...
// export
class Tester {

  /**
   * Create table(s) used for testing
   */
  static async before() {
    test.suffix = CONF_SUFFIX_VAR in process.env;
    Labrat.header(`${test.vendor}: Creating test tables (if any)${test.suffix ? ` ${CONF_SUFFIX_VAR}=${test.suffix}` : ''}`);
    
    const conf = getConf();
    test.cache = null;
    test.mgr = new Manager(conf, test.cache, test.mgrLogit || generateTestAbyssLogger);
    await test.mgr.init();
    
    if (test.mgr.db[test.vendor].setup) {
      // TODO : Create database?
      //const createDB = getCrudOp('create', test.vendor, 'database');
      //await createDB(test.mgr, test.vendor);
      const createTB = getCrudOp('create', test.vendor, 'tables');
      await createTB(test.mgr, test.vendor);
    }
    test.created = true;
  }

  /**
   * Drop table(s) used for testing
   */
  static async after() {
    if (!test.created) {
      Labrat.header(`${test.vendor}: Skipping dropping of test tables/database`);
      return;
    }
    Labrat.header(`${test.vendor}: Dropping test tables/database (if any)`);
    
    const conf = getConf();
    test.cache = null;
    if (!test.mgr) {
      test.mgr = new Manager(conf, test.cache, test.mgrLogit || generateTestAbyssLogger);
      await test.mgr.init();
    }
    
    try {
      if (test.mgr.db[test.vendor].setup) {
        const deleteTB = getCrudOp('delete', test.vendor, 'tables');
        await deleteTB(test.mgr, test.vendor);
        // TODO : Drop database?
        //const deleteDB = getCrudOp('delete', test.vendor, 'database');
        //await deleteDB(test.mgr, test.vendor);
      }
      test.created = false;
    } catch (err) {
      if (LOGGER.warn) LOGGER.warn(`${test.vendor}: Failed to delete tables/database${test.suffix ? ` (${CONF_SUFFIX_VAR}=${test.suffix})` : ''}`, err);
      throw err;
    }
    return test.mgr.close();
  }

  /**
   * Start cache (if present)
   */
  static async beforeEach() {
    const cch = test.cache;
    test.cache = null;
    if (cch && cch.start) await cch.start();
  }

  /**
   * Stop cache (if present)
   */
  static async afterEach() {
    const cch = test.cache;
    test.cache = null;
    if (cch && cch.stop) await cch.stop();
  }

  //======================== Executions ========================

  /**
   * Test CRUD operations for a specified `priv.vendor` and `priv.mgr`
   */
   static async crud() {
    return crud(null, 2 /* one for each table */);
  }

  /**
   * Test CRUD stream operations for a specified `priv.vendor` and `priv.mgr`
   */
  static async crudStream() {
    return crud('stream', 4 /* 2 for each table */);
  }

  static async execDriverOptionsAlt() {
    const id = 400, name = 'TEST ALT', date = new Date();
    let created, rslt;
    try {
      created = await test.mgr.db[test.vendor].create.table1.rows({
        prepareStatement: true,
        binds: {
          id, name, created: date, updated: date
        }
      });
      expect(created, 'prepared statement results').to.be.object();
      expect(created.unprepare, 'prepared statement results unprepare').to.be.function();
      await created.unprepare();
      rslt = await test.mgr.db[test.vendor].read.table.rows({
        binds: { name },
        driverOptions: {
          query: {
            rowMode: 'array'
          }
        }
      });
    } finally {
      if (created) {
        await test.mgr.db[test.vendor].delete.table1.rows({
          binds: { id }
        });
      }
    }

    if (rslt) { // ensure the results are in array format from rowMode
      expect(rslt.rows, 'alt rslt.rows').to.be.array();
      expect(rslt.rows, 'alt rslt.rows').to.have.length(1);
      expect(rslt.rows[0], 'alt rslt.rows[0]').to.be.array();
      expect(rslt.rows[0], 'alt rslt.rows[0]').to.have.length(5);
      expect(rslt.rows[0][0], 'alt rslt.rows[0][0] (id)').to.equal(id);
      expect(rslt.rows[0][1], 'alt rslt.rows[0][1] (name)').to.equal(name);
      expect(rslt.rows[0][2], 'alt rslt.rows[0][2] (report)').to.be.null();
      expect(rslt.rows[0][3], 'alt rslt.rows[0][3] (created)').to.equal(date);
      expect(rslt.rows[0][4], 'alt rslt.rows[0][4] (updated)').to.equal(date);
    }
  }

  static async sqlInvalidThrow() {
    return test.mgr.db[test.vendor].error.update.non.exist({}, ['error']);
  }

  static async bindsInvalidThrow() {
    const date = new Date();
    return test.mgr.db[test.vendor].create.table1.rows({
      binds: {
        id: 500, name: 'SHOULD NEVER GET INSERTED (from bindsInvalidThrow)', /* "created" missing should throw error */ updated: date
      }
    });
  }

  static async transactionRollback() {
    const tx = await test.mgr.db[test.vendor].beginTransaction();
    const date = new Date();
    const rslt = await test.mgr.db[test.vendor].create.table1.rows({
      autoCommit: false,
      transactionId: tx.id,
      binds: {
        id: 500, name: 'SHOULD NEVER GET INSERTED (from transactionRollback)', created: date, updated: date
      }
    });
    return tx.rollback();
  }

  //====================== Configurations ======================

  static async initThrow() {
    // need to set a conf override to prevent overwritting of privateConf.username
    const conf = getConf({ pool: null });
    conf.univ.db[test.vendor].username = 'invalid';
    conf.univ.db[test.vendor].password = 'invalid';
    const mgr = new Manager(conf, test.cache, test.mgrLogit || generateTestAbyssLogger);
    await mgr.init();
    return mgr.close();
  }

  static async poolNone() {
    const conf = getConf({ pool: null, connection: null });
    const mgr = new Manager(conf, test.cache, test.mgrLogit || generateTestAbyssLogger);
    await mgr.init();
    return mgr.close();
  }

  static async poolPropSwap() {
    const conf = getConf({
      pool: (prop, conn) => {
        conn[prop] = conn[prop] || {};
        if (conn[prop].hasOwnProperty('max')) {
          delete conn[prop].max;
        } else {
          conn[prop].max = 10;
        }
        if (conn[prop].hasOwnProperty('min')) {
          delete conn[prop].min;
        } else {
          conn[prop].min = conn[prop].hasOwnProperty('max') ? conn[prop].max : 10;
        }
        if (conn[prop].hasOwnProperty('idle')) {
          delete conn[prop].idle;
        } else {
          conn[prop].idle = 1800;
        }
        if (conn[prop].hasOwnProperty('timeout')) {
          delete conn[prop].timeout;
        } else {
          conn[prop].timeout = 10000;
        }
      }
    });
    const mgr = new Manager(conf, test.cache, test.mgrLogit);
    await mgr.init();
    return mgr.close();
  }

  static async driverOptionsPoolConnNone() {
    const conf = getConf({
      driverOptions: (prop, conn) => {
        conn[prop] = conn[prop] || {};
        conn[prop].pool = null;
        conn[prop].connection = null;
      }
    });
    const mgr = new Manager(conf, test.cache, test.mgrLogit);
    await mgr.init();
    return mgr.close();
  }

  static async driverOptionsPoolConnSwap() {
    const conf = getConf({
      driverOptions: (prop, conn) => {
        conn[prop] = conn[prop] || {};
        if (conn[prop].pool && !conn[prop].connection) {
          conn[prop].connection = conn[prop].pool;
          conn[prop].pool = null;
        } else if (!conn[prop].pool && conn[prop].connection) {
          conn[prop].pool = conn[prop].connection;
          conn[prop].connection = null;
        } else {
          conn[prop].pool = {};
          conn[prop].connection = {};
        }
      }
    });
    const mgr = new Manager(conf, test.cache, test.mgrLogit);
    await mgr.init();
    return mgr.close();
  }

  static async hostPortSwap() {
    // need to set a conf override to prevent overwritting of privateConf properties for other tests
    const conf = getConf({ pool: null });
    if (conf.univ.db[test.vendor].host) {
      //delete conf.univ.db[test.vendor].host;
      conf.univ.db[test.vendor].host = `${conf.univ.db[test.vendor].host}_database`; // need to use alias hostname from docker "links"
      for (let conn of conf.db.connections) {
        conn.host = conf.univ.db[test.vendor].host;
      }
    } else {
      const realConf = getConf();
      conf.univ.db[test.vendor].host = realConf.univ.db[test.vendor].host;
    }
    if (conf.univ.db[test.vendor].hasOwnProperty('port')) {
      delete conf.univ.db[test.vendor].port;
    } else {
      conf.univ.db[test.vendor].port = test.defaultPort;
    }
    const mgr = new Manager(conf, test.cache, test.mgrLogit);
    await mgr.init();
    return mgr.close();
  }

  static async multipleConnections() {
    const conf = getConf({} /*pass obj so conf is copy*/);
    const conn2 = JSON.parse(JSON.stringify(conf.db.connections[0]));
    conn2.name += '2';
    conf.db.connections.push(conn2);
    const mgr = new Manager(conf, test.cache, test.mgrLogit);
    await mgr.init();
    return mgr.close();
  }

  static async closeBeforeInit() {
    const conf = getConf();
    const mgr = new Manager(conf, test.cache, test.mgrLogit || generateTestAbyssLogger);
    return mgr.close();
  }

  static async state() {
    const poolCount = 4;
    const conf = getConf({
      pool: (prop, conn) => {
        conn[prop] = conn[prop] || {};
        conn[prop].min = conn[prop].max = poolCount;
      }
    });
    const mgr = new Manager(conf, test.cache, test.mgrLogit || generateTestAbyssLogger);
    await mgr.init();

    const state = await mgr.state();
    expect(state, 'state').to.be.object();
    expect(state.result, 'state.result').to.be.object();
    expect(state.result[test.vendor], `state.result.${test.vendor}`).to.be.object();
    expect(state.result[test.vendor].pending, `state.result.${test.vendor}.pending`).to.equal(0);
    expect(state.result[test.vendor].connections, `state.result.${test.vendor}.connections`).to.be.object();
    expect(state.result[test.vendor].connections.count, `state.result.${test.vendor}.connections.count`).to.equal(poolCount);
    expect(state.result[test.vendor].connections.inUse, `state.result.${test.vendor}.connections.inUse`).to.equal(0);

    return mgr.close();
  }

  //====================== Vendor Specific ======================

  static async driverOptionsTNS() {
    return expectTNS(getConf({} /*pass obj so conf is copy*/));
  }

  static async driverOptionsPingTNS() {
    return expectTNS(getConf({} /*pass obj so conf is copy*/), { pingOnInit: true });
  }

  static async driverOptionsDefaultsTNS() {
    const conf = getConf({} /*pass obj so conf is copy*/), conn = conf.db.connections[0];
    conf.univ.db[conn.dialect].port = conn.port = false;
    conf.univ.db[conn.dialect].protocol = conn.protocol = false;
    return expectTNS(conf);
  }

  static async driverOptionsMultipleTNS() {
    const conf = getConf({} /*pass obj so conf is copy*/), conn2 = JSON.parse(JSON.stringify(conf.db.connections[0]));
    conn2.name += '2';
    conf.db.connections.push(conn2);
    return expectTNS(conf);
  }

  static async driverOptionsPool() {
    const conf = getConf({} /*pass obj so conf is copy*/), conn = conf.db.connections[0];
    conn.driverOptions = conn.driverOptions || {};
    conn.driverOptions.pool = conn.driverOptions.pool || {};
    // test constant pool min from oracledb.poolMin
    conn.driverOptions.pool.poolMin = '${poolMin}';
    conn.driverOptions.pool.poolMax = 10;
    conn.driverOptions.pool.poolTimeout = 6000;
    conn.driverOptions.pool.poolIncrement = 2;
    conn.driverOptions.pool.queueTimeout = 5000;
    conn.driverOptions.pool.poolAlias = 'testDriverOptionsPool';
    const mgr = new Manager(conf, test.cache, test.mgrLogit);
    await mgr.init();
    return mgr.close();
  }

  static async confDriverOptionsGlobalNonOwnProps() {
    const conf = getConf({} /*pass obj so conf is copy*/), conn = conf.db.connections[0];
    conn.driverOptions = conn.driverOptions || {};
    conn.driverOptions.pool = false;
    const TestGlobal = class {};
    TestGlobal.prototype.skip = 'Skip adding this global property';
    conn.driverOptions.global = new TestGlobal();
    conn.driverOptions.global.fakeObject = {};
    conn.driverOptions.global.fakeConstant = '${FAKE_CONSTANT_NAME}';
    conn.driverOptions.global.autoCommit = false;
    const mgr = new Manager(conf, test.cache, test.mgrLogit);
    await mgr.init();
    return mgr.close();
  }

  static async confDriverOptionsNone() {
    const conf = getConf({} /*pass obj so conf is copy*/), conn = conf.db.connections[0];
    delete conn.driverOptions;
    const mgr = new Manager(conf, test.cache, test.mgrLogit);
    await mgr.init();
    return mgr.close();
  }

  static async confDriverOptionsStmtCacheSize() {
    const conf = getConf({} /*pass obj so conf is copy*/), conn = conf.db.connections[0];
    conn.driverOptions = conn.driverOptions || {};
    conn.driverOptions.stmtCacheSize = 100;
    const mgr = new Manager(conf, test.cache, test.mgrLogit);
    await mgr.init();
    return mgr.close();
  }

  static async confPortProtocolDefaults() {
    const conf = getConf({} /*pass obj so conf is copy*/), conn = conf.db.connections[0];
    conn.port = conf.univ.db[conn.dialect].port || test.defaultPort;
    conn.protocol = conf.univ.db[conn.dialect].protocol || test.defaultProtocol;
    const mgr = new Manager(conf, test.cache, test.mgrLogit);
    await mgr.init();
    await mgr.close();
  }

  static async confPortProtocolNone() {
    const conf = getConf({} /*pass obj so conf is copy*/), conn = conf.db.connections[0];
    conf.univ.db[conn.dialect].port = conn.port = null;
    conf.univ.db[conn.dialect].protocol = conn.protocol = null;
    const mgr = new Manager(conf, test.cache, test.mgrLogit);
    await mgr.init();
    await mgr.close();
  }

  static async confHostNoneThrow() {
    const conf = getConf({} /*pass obj so conf is copy*/), conn = conf.db.connections[0];
    conf.univ.db[conn.dialect].host = conn.host = null;
    const mgr = new Manager(conf, test.cache, test.mgrLogit);
    await mgr.init();
    await mgr.close();
  }

  static async confNoServiceThrow() {
    const conf = getConf({} /*pass obj so conf is copy*/), conn = conf.db.connections[0];
    conn.service = null;
    const mgr = new Manager(conf, test.cache, test.mgrLogit);
    await mgr.init();
    await mgr.close();
  }
}

// TODO : ESM comment the following line...
module.exports = Tester;

/**
 * Generates a configuration
 * @param {Object} [overrides] The connection configuration override properties. Each property will be deleted from the returned
 * connection configuration when falsy. When the property value is an function, the `function(propertyName, connectionConf)` will
 * be called (property not set by the callee). Otherwise, the property value will be set on the configuration.
 * @param {Boolean} [matchPoolToUV] Truthy to update the pool size to match `process.env.UV_THREADPOOL_SIZE` __when `overrides` contains `pool`__
 * @returns {Object} The configuration
 */
function getConf(overrides, matchPoolToUV) {
  /** @type {typedefs.SQLERConfigurationOptions} */
  let conf = test.conf[test.vendor];
  if (!conf) {
    conf = test.conf[test.vendor] = JSON.parse(Fs.readFileSync(Path.join(`test/fixtures/${test.vendor}`, `conf${test.suffix || ''}.json`), 'utf8'));
    if (!test.univ) {
      test.univ = JSON.parse(Fs.readFileSync(Path.join('test/fixtures', `priv${test.suffix || ''}.json`), 'utf8')).univ;
    }
    conf.univ = test.univ;
    conf.mainPath = 'test';
    conf.db.dialects.oracle = './test/dialects/test-dialect.js';
  }
  if (overrides) {
    const confCopy = JSON.parse(JSON.stringify(conf));
    for (let dlct in conf.db.dialects) {
      confCopy.db.dialects[dlct] = conf.db.dialects[dlct];
    }
    conf = confCopy;
  }
  let exclude;
  for (let conn of conf.db.connections) {
    for (let prop in conn) {
      if (!conn.hasOwnProperty(prop)) continue;
      exclude = overrides && overrides.hasOwnProperty(prop);
      if (exclude) {
        if (typeof overrides[prop] === 'function') overrides[prop](prop, conn);
        else if (overrides[prop]) conn[prop] = overrides[prop];
        else delete conn[prop];
      } else if (prop === 'pool') {
        if (matchPoolToUV) {
          conn.pool.min = Math.floor((process.env.UV_THREADPOOL_SIZE - 1) / 2) || 2;
          conn.pool.max = conn.pool.min;
          conn.pool.increment = 0;
        }
        if (!overrides) return conf; // no need to continue since there are no more options that need to be set manually
      }
    }
  }
  return conf;
}

/**
 * Test CRUD operations for a specified `priv.vendor` and `priv.mgr`
 * @param {String} [type] The type of CRUD tests to perform. For example, for an initial __create__ rows, with `type = 'stream'` would
 * use a module source with prefix of `create.stream` while _omitting_ would use a prefix of just `create`. See {@link getCrudOp}.
 * @param {Number} [count=0] The expected record count for each CRUD operation (other than the read after deletion)
 * @returns {Array} All of the CRUD results
 */
async function crud(type, count = 0) {
  Labrat.header(`${test.vendor}: Running CRUD tests`, 'info');
  const rslts = new Array(6);
  const isStream = type === 'stream';
  const streamClassRead = isStream ? Stream.Readable : null;
  const streamClassWrite = isStream ? Stream.Writable : null;
  const createNameIncl = isStream ? 'CREATE_STREAM' : 'CREATE';
  const updateNameIncl = isStream ? 'UPDATE_STREAM_PS_TX' : 'UPDATE_PS_TX';
  const typd = type ? `.${type}` : '';
  let rslti = -1, state = {};

  const create = getCrudOp(`create${typd}`, test.vendor);
  rslts[++rslti] = await create(test.mgr, test.vendor);
  crudly(state, { label: `create${typd}`, streamClass: streamClassWrite, count }, rslts[rslti]);

  const read = getCrudOp(`read${typd}`, test.vendor);
  rslts[++rslti] = await read(test.mgr, test.vendor);
  crudly(state, { label: `read${typd}`, streamClass: streamClassRead, nameIncl: createNameIncl, count }, rslts[rslti]);

  const update = getCrudOp(`update${typd}`, test.vendor);
  rslts[++rslti] = await update(test.mgr, test.vendor);
  crudly(state, { label: `update${typd}`, streamClass: streamClassWrite, count }, rslts[rslti]);

  rslts[++rslti] = await read(test.mgr, test.vendor);
  crudly(state, { label: `update read${typd}`, streamClass: streamClassRead, nameIncl: updateNameIncl, count }, rslts[rslti]);

  const del = getCrudOp(`delete${typd}`, test.vendor);
  rslts[++rslti] = await del(test.mgr, test.vendor);
  // delete will be checked in next read
  // crudly(state, { label: `delete${typd}`, streamClass: streamClassWrite, count }, rslts[rslti]);

  rslts[++rslti] = await read(test.mgr, test.vendor);
  crudly(state, { label: `delete read${typd}`, streamClass: streamClassRead, count: 0 }, rslts[rslti]);

  if (LOGGER.debug) LOGGER.debug(`CRUD${type ? ` ${type}` : ''} ${test.vendor} execution results:`, ...rslts);
  Labrat.header(`${test.vendor}: Completed CRUD${type ? ` ${type}` : ''} tests`, 'info');
  return rslts;
}

/**
 * Gets the `async function` that will execute a CRUD operation
 * @param {String} name The name of the CRUD operation (e.g. `create`, `read`, etc.)
 * @param {String} vendor The vendor to use (e.g. `oracle`, `mssql`, etc.)
 * @param {String} [setupKey] Truty when the CRUD operation is for a setup operation (e.g. creating/dropping tables)
 * @returns {Function} The `async function(manager)` that will return the CRUD results
 */
function getCrudOp(name, vendor, setupKey) {
  const base = Path.join(process.cwd(), `test/lib/${vendor}${setupKey ? '/setup' : ''}`);
  const pth = Path.join(base, `${name}.${setupKey || 'table.rows'}.js`);
  return require(pth);
}

/**
 * Validates an CRUD execution result
 * @param {Object} [state] State that spans multiple calls to this function
 * @param {*} [state.lastUpdated] The last `row.updated` (will be set)
 * @param {Object} expectOpts The expect options
 * @param {String} expectOpts.label The label to use for `expect`
 * @param {String} [expectOpts.nameIncl] A name to check to see if `row.name` includes it
 * @param {Number} [expectOpts.count=0] The expected count for the result rows
 * @param {Object} [expectOpts.streamClass] The expected stream instance name (e.g. `Stream.Readable`, `Stream.Writable`, etc)
 * @param {typedefs.SQLERExecResults} rslt The execution results
 */
function crudly(state, expectOpts, rslt) {
  if (!rslt.rows) return;
  expectOpts.count = expectOpts.hasOwnProperty('count') ? expectOpts.count : 0;
  expect(rslt.rows, `CRUD ${expectOpts.label} rows`).array();
  if (!expectOpts.label.includes('read')) return;
  expect(rslt.rows, `CRUD ${expectOpts.label} rows.length`).length(expectOpts.streamClass ? 2 : expectOpts.count);
  let updated;
  const expectRow = (row) => {
    expect(row, `CRUD ${expectOpts.label} row`).object();
    if (expectOpts.nameIncl) expect(row.name, `CRUD ${expectOpts.label} row.name`).includes(expectOpts.nameIncl);
    updated = row.updated && expectOpts.streamClass ? new Date(row.updated) /* coming from JSON file */ : row.updated;
    expect(updated, `CRUD ${expectOpts.label} row.updated`).date();
    if (state && state.lastUpdated) expect(updated, `CRUD ${expectOpts.label} row.updated > lastUpdated`).greaterThan(state.lastUpdated);
    // expect binary report image
    if (row.reportPath) {
      const reportBuffer = readChunk.sync(row.reportPath, 0, 12);
      const reportType = imageType(reportBuffer);
      expect(reportType, `CRUD ${expectOpts.label} row.report Image Type`).to.be.object();
      expect(reportType.mime, `CRUD ${expectOpts.label} row.report Image Mime-Type`).to.equal('image/png');
    }
  };
  let rows;
  if (expectOpts.streamClass) {
    // should be set by the executing script
    expect(rslt.jsonFile, `CRUD ${expectOpts.label} jsonFile`).not.empty();
    rows = JSON.parse(Fs.readFileSync(rslt.jsonFile, { encoding: 'utf-8' }));
    expect(rows, `CRUD ${expectOpts.label} jsonFile rows`).array();
    expect(rows, `CRUD ${expectOpts.label} jsonFile rows.length`).length(expectOpts.count);
    for (let row of rslt.rows) {
      expect(row, `CRUD ${expectOpts.label} class`).instanceOf(expectOpts.streamClass);
      // row.on(typedefs.EVENT_STREAM_RELEASE, () => expect('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@2'));
    }
  } else {
    rows = rslt.rows;
  }
  for (let row of rows) {
    expectRow(row);
  }
  if (state) state.lastUpdated = updated;
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
  // ensure unhandled rejections puke with a non-zero exit code
  process.on('unhandledRejection', up => { throw up });
  // run the test(s)
  (async () => await Labrat.run(Tester))();
}

//====================== Vendor Specific ======================

/**
 * Expects the use of Oracle SIDs to work properly
 * @param {SQLERConfigurationOptions} conf One or more configurations to generate
 * @param {Object} [testOpts] The SID test options
 * @param {String} [testOpts.sid] An alernative SID to use for `conf.db.connections[].driverOptions.sid`
 * Defaults to the `service` set on the connection.
 * @param {Boolean} [testOpts.pingOnInit] An alternative flag for `conf.db.connections[].driverOptions.pingOnInit`
 */
async function expectTNS(conf, testOpts) {
  for (let conn of conf.db.connections) {
    conn.driverOptions.useTNS = testOpts && testOpts.useTNS;
    // don't ping the connection pool since it may have not been setup
    conn.driverOptions.pingOnInit = (testOpts && testOpts.hasOwnProperty('pingOnInit')) ? testOpts.pingOnInit : false;
  }
  // ensure there is a manager logger for testing
  const mgr = new Manager(conf, test.cache, test.mgrLogit || generateTestAbyssLogger);
  await mgr.init();
  return mgr.close();
}