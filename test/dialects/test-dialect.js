'use strict';

const OracleDialect = require('../../index');

/**
* Test Oracle database {@link Dialect}
*/
module.exports = class OracleTestDialect extends OracleDialect {

  /**
   * @inheritdoc
   */
  constructor(priv, connConf, track, errorLogger, logger, debug) {
    super(priv, connConf, track, errorLogger, logger, debug);
  }

  /**
   * @inheritdoc
   */
  async init(opts) {
    return super.init();
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