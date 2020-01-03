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
    expect(connConf.driverOptions.autocommit, 'connConf.driverOptions.autocommit').to.be.boolean();
    expect(connConf.driverOptions.autocommit, 'connConf.driverOptions.autocommit = this.isAutocommit').to.equal(this.isAutocommit());

    expect(track, 'track').to.be.object();
    expect(errorLogger, 'errorLogger').to.be.function();
    expect(logger, 'logger').to.be.function();
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
  async exec(sql, opts, frags) {console.log('##########################3',opts)
    return super.exec(sql, opts, frags);
  }

  /**
   * @inheritdoc
   */
  async commit(opts) {
    return super.commit(opts);
  }

  /**
   * @inheritdoc
   */
  async rollback(opts) {
    return super.rollback(opts);
  }

  /**
   * @inheritdoc
   */
  async close(opts) {
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