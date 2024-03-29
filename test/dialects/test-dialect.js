'use strict';

const OracleDialect = require('../../index');
const { expect } = require('@hapi/code');

/**
* Test Oracle database {@link Dialect}
*/
module.exports = class OracleTestDialect extends OracleDialect {

  /**
   * @inheritdoc
   */
  constructor(priv, connConf, track, errorLogger, logger, debug) {
    super(priv, connConf, track, errorLogger, logger, debug);

    expect(priv, 'priv').to.be.object();

    expect(connConf, 'connConf').to.be.object();
    
    expect(connConf.username || priv.username, 'priv.username').to.be.string();
    expect(connConf.username || priv.username, 'priv.username.length').to.not.be.empty();

    expect(connConf.id, 'connConf.id').to.be.string();
    expect(connConf.id, 'connConf.id.length').to.not.be.empty();
    expect(connConf.name, 'connConf.name').to.be.string();
    expect(connConf.name, 'connConf.name.length').to.not.be.empty();
    expect(connConf.dir, 'connConf.dir').to.be.string();
    expect(connConf.dir, 'connConf.dir.length').to.not.be.empty();
    expect(connConf.service, 'connConf.service').to.be.string();
    expect(connConf.service, 'connConf.service.length').to.not.be.empty();
    expect(connConf.dialect, 'connConf.dialect === oracle').to.equal('oracle');

    expectDriverOptions(connConf, this);
    expect(this.driver.connectionClass, 'this.driver.connectionClass').to.be.string();
    expect(this.driver.connectionClass, 'this.driver.connectionClass.length').to.not.be.length(0);

    expect(track, 'track').to.be.object();
    if (errorLogger) expect(errorLogger, 'errorLogger').to.be.function();
    if (logger) expect(logger, 'logger').to.be.function();
    expect(debug, 'debug').to.be.boolean();
  }

  /**
   * @inheritdoc
   */
  async init(opts) {
    const pool = await super.init(opts);

    /*const conn = await pool.getConnection();
    await conn.execute(`
    set isolation serializable
    `, {}, { autoCommit: true });
    await conn.commit();*/

    return pool;
  }

  /**
   * @inheritdoc
   */
  async exec(sql, opts, frags, meta, errorOpts) {
    expect(sql, 'sql').to.be.string();

    expect(opts, 'opts').to.be.object();

    const state = super.state;
    expect(state, 'dialect.state').to.be.object();
    expect(state.pending, 'dialect.state.pending').to.be.number();
    expect(state.connections, 'dialect.connections').to.be.object();
    expect(state.connections.count, 'dialect.connections.count').to.be.number();
    expect(state.connections.inUse, 'dialect.connections.inUse').to.be.number();

    expect(meta, 'meta').to.be.object();
    expect(meta.name, 'meta').to.be.string();
    expect(meta.name, 'meta').to.not.be.empty();

    return super.exec(sql, opts, frags, meta, errorOpts);
  }

  /**
   * @inheritdoc
   */
  async close() {
    return super.close();
  }
};

/**
 * Expects the oracle driver options (when present)
 * @param {SQLERConnectionOptions} opts The connection options to check
 * @param {OracleTestDialect} dlt The test dialect
 */
function expectDriverOptions(opts, dlt) {
  expect(dlt.driver, `${dlt.constructor.name} driver`).to.be.object();
  if (!opts.driverOptions) return;
  expect(opts.driverOptions, 'connConf.driverOptions').to.be.object();
  if (!opts.global) return;
  expect(opts.driverOptions.global, 'connConf.driverOptions.global').to.be.object();
  //expect(opts.driverOptions.global.autoCommit, 'connConf.driverOptions.global.autoCommit = dlt.isAutocommit').to.equal(dlt.isAutocommit());
  for (let odb in opts.driverOptions.global) {
    expect(opts.driverOptions.global[odb], `connConf.driverOptions.global.${odb} = dlt.driver.${odb}`).to.be.equal(dlt.driver[odb]);
  }
}

// private mapping
let map = new WeakMap();
let internal = function(object) {
  if (!map.has(object)) {
    map.set(object, {});
  }
  return {
    at: map.get(object),
    this: object
  };
};