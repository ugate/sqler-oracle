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

const priv = { mgr: null, cache: null, rowCount: 1, mgrLogit: !!LOGGER.info };

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

  static async multipleManagerPools() {
    // spawn another pool in addition to the one created by before()
    const conf = getConf();
    const mgr = new Manager(conf);
    await mgr.init();
    return mgr.close();
  }

  static async driverOptions() {
    const conf = getConf(), conn = conf.db.connections[0];
    conn.driverOptions = conn.driverOptions || {};
    conn.driverOptions.global = conn.driverOptions.global || {};
    conn.driverOptions.global.connectionClass = 'TestDriverOptions';
    conn.pool = { alias: 'testDriverOptions' };
    const mgr = new Manager(conf);
    await mgr.init();
    return mgr.close();
  }

  static async create() {
    return rows('create');
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

  opts = opts || {};
  if (!priv.mgr) {
    const conf = getConf();
    priv.mgr = new Manager(conf, priv.cache, priv.mgrLogit);
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

// when not ran in a test runner execute static Tester functions (excluding what's passed into Main.run) 
if (!Labrat.usingTestRunner()) {
  (async () => await Labrat.run(Tester))();
}