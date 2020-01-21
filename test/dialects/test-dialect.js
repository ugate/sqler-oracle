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
    expect(priv.host, 'priv.host').to.be.string();
    expect(priv.host, 'priv.host.length').to.not.be.empty();
    expect(priv.username, 'priv.username').to.be.string();
    expect(priv.username, 'priv.username.length').to.not.be.empty();
    expect(priv.password, 'priv.password').to.be.string();
    expect(priv.password, 'priv.password.length').to.not.be.empty();

    expect(connConf, 'connConf').to.be.object();
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

    expect(connConf.driverOptions, 'connConf.driverOptions').to.be.object();
    expect(connConf.driverOptions.oracledb, 'connConf.driverOptions.oracledb').to.be.object();
    expect(connConf.driverOptions.oracledb.autocommit, 'connConf.driverOptions.oracledb.autocommit = this.isAutocommit').to.equal(this.isAutocommit());
    expect(this.driver, `${this.constructor.name} driver`).to.be.object();
    for (let odb in connConf.driverOptions.oracledb) {
      expect(connConf.driverOptions.oracledb[odb], `connConf.driverOptions.oracledb.${odb}`).to.be.equal(this.driver[odb]);
    }
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