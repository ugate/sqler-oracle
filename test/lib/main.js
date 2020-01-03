'use strict';

// TODO : ESM comment the following lines...
const { Labrat, LOGGER } = require('@ugate/labrat');
const { Manager } = require('sqler');
const Fs = require('fs');
const Os = require('os');
const { expect } = require('@hapi/code');
// TODO : import { Labrat, LOGGER } from '@ugate/labrat';
// TODO : import { Manager } from 'sqler.mjs';
// TODO : import * as Fs from 'fs';
// TODO : import * as Os from 'os';
// TODO : import { expect } from '@hapi/code';

const priv = { mgr: null, cache: null, rowCount: 1 };

// TODO : ESM uncomment the following line...
// export
class Tester {

  /**
   * Create table(s) used for testing
   */
  static async before() {
    if (LOGGER.info) LOGGER.info('Creating test tables');
    
    const conf = getConf();
    priv.cache = null;
    priv.mgr = new Manager(conf, priv.cache, !!LOGGER.info);
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
      if (LOGGER.info) LOGGER.info('Skipping dropping of test tables');
      return;
    }
    if (LOGGER.info) LOGGER.info('Dropping test tables');
    
    const conf = getConf();
    priv.cache = null;
    if (!priv.mgr) {
      priv.mgr = new Manager(conf, priv.cache, !!LOGGER.info);
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

  /**
   * Create, read, update, read, delete and read test rows
   */
  static async cruds() {
    await rows('create');
    await rows('read');
    await rows('update');
    await rows('read');
    await rows('delete');
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
            "autocommit": false
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
  if (LOGGER.info) LOGGER.info(`Performing "${op}" on ${priv.rowCount} test records`);

  opts = opts || {};
  if (!priv.mgr) {
    const conf = getConf();
    priv.mgr = new Manager(conf, priv.cache, !!LOGGER.info);
    await priv.mgr.init();
  }
  
  const proms = new Array(priv.rowCount), date = new Date();
  for (let i = 0, binds; i < priv.rowCount; i++) {
    if (op === 'create') {
      binds = { id: i + 1, name: `${op} ${i}`, created: date, updated: date };
    } else if (op = 'update') {
      binds = { id: i + 1, updated: date };
    } else if (op === 'delete') {
      binds = { id: i + 1 };
    } else if (op === 'read') {
      binds = { id: i + 1 };
    }
    proms[i] = priv.mgr.db.tst[op].table.rows({ binds });
  }

  const rslts = await Promise.all(proms);
  await priv.mgr.commit();
  for (let rslt of rslts) {
    if (LOGGER.info) LOGGER.info(`Result for "${op}"`, rslt);
  }
}

/**
 * Tests that SQL statements work with and w/o {@link Cache} by re-writting the SQL file to see if the cahce picks it up
 * @param {Cache} [cache] the {@link Cache} that will be used for SQL statements
 * @param {Object} [cacheOpts] the options that were used on the specified {@link Cache}
 */
async function testSql(cache, cacheOpts) {
  if (LOGGER.info) LOGGER.info(`Begin basic test`);
    
  const conf = getConf();
  priv.cache = cache;
  priv.mgr = new Manager(conf, priv.cache, !!LOGGER.info);
  await priv.mgr.init();
  
  const binds = undefined;//{ someCol1: 1, someCol2: 2, someCol3: 3 };
  const rslt1 = await priv.mgr.db.tst.ora_test.create.tables(binds, ['test-frag']);
  console.log (rslt1);

  return;
  expect(rslt1).to.be.array();
  expect(rslt1).to.be.length(2); // two records should be returned w/o order by
  if (LOGGER.info) LOGGER.info('BEFORE Cache Update:', rslt1);
  
  
  // change the SQL file
  const sql = (await sqlFile()).toString();
  try {
    // update the file
    await sqlFile(`${sql}\nORDER BY SOME_COL1`);

    // wait for the the SQL statement to expire
    await Labrat.wait(cacheOpts && cacheOpts.hasOwnProperty('expiresIn') ? cacheOpts.expiresIn : 1000);

    const frags = cache ? ['test-frag'] : null;
    const rslt2 = await priv.mgr.db.tst.read.some.tables(binds, frags);

    expect(rslt2).to.be.array();
    expect(rslt2).to.be.length(cache ? 1 : 2); // one record w/order by and updated by cache
    if (LOGGER.info) LOGGER.info('AFTER Cahce Update:', rslt2);

  } finally {
    await sqlFile(sql);
  }
}

/**
 * Reads/writes test SQL file
 * @param {String} [sql] The SQL to write to the test file (omit to just read file)
 */
async function sqlFile(sql) {
  const sqlPath = './test/db/read.some.tables.sql';
  if (typeof sql === 'string') {
    return Fs.promises.writeFile(sqlPath, sql);
  } else {
    return Fs.promises.readFile(sqlPath);
  }
}

// when not ran in a test runner execute static Tester functions (excluding what's passed into Main.run) 
if (!Labrat.usingTestRunner()) {
  (async () => await Labrat.run(Tester))();
}