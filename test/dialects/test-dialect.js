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
    
    expect(connConf.host || priv.host, 'priv.host').to.be.string();
    expect(connConf.host || priv.host, 'priv.host.length').to.not.be.empty();
    expect(connConf.username || priv.username, 'priv.username').to.be.string();
    expect(connConf.username || priv.username, 'priv.username.length').to.not.be.empty();
    expect(connConf.password || priv.password, 'priv.password').to.be.string();
    expect(connConf.password || priv.password, 'priv.password.length').to.not.be.empty();

    expect(connConf.id, 'connConf.id').to.be.string();
    expect(connConf.id, 'connConf.id.length').to.not.be.empty();
    expect(connConf.name, 'connConf.name').to.be.string();
    expect(connConf.name, 'connConf.name.length').to.not.be.empty();
    expect(connConf.dir, 'connConf.dir').to.be.string();
    expect(connConf.dir, 'connConf.dir.length').to.not.be.empty();
    expect(connConf.service, 'connConf.service').to.be.string();
    expect(connConf.service, 'connConf.service.length').to.not.be.empty();
    expect(connConf.dialect, 'connConf.dialect').to.be.string();
    expect(connConf.dialect, 'connConf.dialect.length').to.not.be.empty();

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
    return super.init(opts);
  }

  /**
   * @inheritdoc
   */
  async exec(sql, opts, frags) {
    expect(sql, 'sql').to.be.string();

    expect(opts, 'opts').to.be.object();

    return super.exec(sql, opts, frags);
  }

  /**
   * @inheritdoc
   */
  async commit(opts) {
    expect(opts, 'opts').to.be.object();

    return super.commit(opts);
  }

  /**
   * @inheritdoc
   */
  async rollback(opts) {
    expect(opts, 'opts').to.be.object();

    return super.rollback(opts);
  }

  /**
   * @inheritdoc
   */
  async close(opts) {
    expect(opts, 'opts').to.be.object();

    return super.close(opts);
  }

  /**
   * @inheritdoc
   */
  isAutocommit(opts) {
    return super.isAutocommit(opts);
  }
};

/**
 * Expects the oracle driver options (when present)
 * @param {Manager~ConnectionOptions} opts The connection options to check
 * @param {OracleTestDialect} dlt The test dialect
 */
function expectDriverOptions(opts, dlt) {
  if (!opts.driverOptions) return;
  expect(opts.driverOptions, 'connConf.driverOptions').to.be.object();
  if (!opts.global) return;
  expect(opts.driverOptions.global, 'connConf.driverOptions.global').to.be.object();
  expect(opts.driverOptions.global.autocommit, 'connConf.driverOptions.global.autocommit = dlt.isAutocommit').to.equal(dlt.isAutocommit());
  expect(dlt.driver, `${dlt.constructor.name} driver`).to.be.object();
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