'use strict';

/**
 * Oracle database {@link Dialect} implementation for [`sqler`](https://ugate.github.io/sqler/)
 */
module.exports = class OracleDialect {

  /**
   * Constructor
   * @constructs OracleDialect
   * @param {SQLERPrivateOptions} priv The private configuration options
   * @param {OracleConnectionOptions} connConf The individual SQL __connection__ configuration for the given dialect that was passed into the originating {@link Manager}
   * @param {SQLERTrack} track Container for sharing data between {@link Dialect} instances.
   * @param {Function} [errorLogger] A function that takes one or more arguments and logs the results as an error (similar to `console.error`)
   * @param {Function} [logger] A function that takes one or more arguments and logs the results (similar to `console.log`)
   * @param {Boolean} [debug] A flag that indicates the dialect should be run in debug mode (if supported)
   */
  constructor(priv, connConf, track, errorLogger, logger, debug) {
    const dlt = internal(this);
    dlt.at.track = track;
    dlt.at.transactions = new Map();
    // sqler compatible state
    dlt.at.state = {
      pending: 0
    };

    dlt.at.driver = require('oracledb');
    dlt.at.driver.Promise = Promise; // tell Oracle to use the built-in promise

    const hasDrvrOpts = !!connConf.driverOptions;
    const dopts = hasDrvrOpts && connConf.driverOptions.global;
    if (dopts) dlt.at.track.interpolate(dlt.at.driver, dopts);
    // default autoCommit = true to conform to sqler
    dlt.at.driver.autoCommit = true;
    dlt.at.driver.connectionClass = dlt.at.driver.connectionClass || `SqlerOracleGen${Math.floor(Math.random() * 10000)}`;

    const poolOpts = connConf.pool || {};
    const alias = poolOpts.alias || `sqlerOracleGen${Math.floor(Math.random() * 10000)}`;
    dlt.at.errorLogger = errorLogger;
    dlt.at.logger = logger;
    dlt.at.debug = debug;
    dlt.at.pool = {
      alias,
      conf: poolOpts,
      oracleConf: hasDrvrOpts && connConf.driverOptions.pool ? dlt.at.track.interpolate({}, connConf.driverOptions.pool, dlt.at.driver) : {}
    };
    dlt.at.pingOnInit = hasDrvrOpts && connConf.driverOptions.hasOwnProperty('pingOnInit') ? !!connConf.driverOptions.pingOnInit : true;
    dlt.at.connConf = connConf;

    dlt.at.pool.oracleConf.user = priv.username;
    dlt.at.pool.oracleConf.password = priv.password;

    const host = connConf.host || priv.host, port = connConf.port || priv.port || 1521, protocol = connConf.protocol || priv.protocol || 'TCP';
    if (!host) throw new Error(`sqler-oracle: Missing ${connConf.dialect} "host" for conection ${connConf.id}/${connConf.name} in private configuration options or connection configuration options`);

    if (connConf.service) {
      if (hasDrvrOpts && connConf.driverOptions.useTNS) {
        //process.env.TNS_ADMIN = priv.privatePath;
        //dlt.at.tns = Path.join(process.env.TNS_ADMIN, 'tnsnames.ora');
        dlt.at.pool.oracleConf.connectString = `(DESCRIPTION = (ADDRESS = (PROTOCOL = ${protocol})(HOST = ${host})(PORT = ${port}))` +
        `(CONNECT_DATA = (SERVER = POOLED)(SERVICE = ${connConf.service})))`;
        dlt.at.connectionType = 'TNS SERVICE';
        if (track.tnsCnt) track.tnsCnt++;
        else track.tnsCnt = 1;
      } else {
        dlt.at.pool.oracleConf.connectString = `${host}/${connConf.service}:${port}`;
        dlt.at.connectionType = 'SERVICE';
      }
    } else throw new Error(`sqler-oracle: Missing ${connConf.dialect} "service" or "sid" for conection ${connConf.id}/${connConf.name} in connection configuration options`);
    dlt.at.pool.oracleConf.poolMin = poolOpts.min;
    dlt.at.pool.oracleConf.poolMax = poolOpts.max;
    dlt.at.pool.oracleConf.poolTimeout = poolOpts.idle;
    dlt.at.pool.oracleConf.poolIncrement = poolOpts.increment;
    dlt.at.pool.oracleConf.queueTimeout = poolOpts.timeout;
    dlt.at.pool.oracleConf.poolAlias = alias;
  }

  /**
   * Initializes {@link OracleDialect} by creating the connection pool
   * @param {Dialect~DialectInitOptions} opts The options described by the `sqler` module
   * @returns {Object} The Oracle connection pool
   */
  async init(opts) {
    const dlt = internal(this), numSql = opts.numOfPreparedFuncs;
    // there is no prepare/unprepare since oracle uses statement caching: https://oracle.github.io/node-oracledb/doc/api.html#-313-statement-caching
    // statement cache should account for the number of prepared functions/files by a factor of 3x to accomodate up to 3x fragments for each SQL file
    dlt.at.pool.oracleConf.stmtCacheSize = (numSql || 1) * 3;
    let oraPool;
    try {
      try {
        oraPool = dlt.at.driver.getPool(dlt.at.pool.oracleConf.poolAlias);
      } catch(err) {
        // consume error since the pool might not be created yet
      }
      oraPool = oraPool || (await dlt.at.driver.createPool(dlt.at.pool.oracleConf));
      if (dlt.at.logger) {
        dlt.at.logger(`sqler-oracle: ${dlt.at.connectionType} connection pool "${oraPool.poolAlias}" created with poolPingInterval=${oraPool.poolPingInterval} ` +
          `stmtCacheSize=${oraPool.stmtCacheSize} (${numSql} SQL files) poolTimeout=${oraPool.poolTimeout} poolIncrement=${oraPool.poolIncrement} ` +
          `poolMin=${oraPool.poolMin} poolMax=${oraPool.poolMax}`);
      }
      if (dlt.at.pingOnInit) {
        // validate by pinging connection from pool
        const conn = await oraPool.getConnection();
        try {
          await conn.ping();
        } finally {
          try {
            await conn.close();
          } catch (err) {
            if (dlt.at.errorLogger) dlt.at.errorLogger(`sqler-oracle: Failed to close connection during ping ${err.message}`, err);
          }
        }
      }
      return oraPool;
    } catch (err) {
      const msg = `sqler-oracle: ${oraPool ? 'Unable to ping connection from' : 'Unable to create'} connection pool`;
      if (dlt.at.errorLogger) dlt.at.errorLogger(`${msg} ${JSON.stringify(err, null, ' ')}`);
      const pconf = Object.assign({}, dlt.at.pool.oracleConf);
      pconf.password = '***'; // mask sensitive data
      err.message = `${err.message}\n${msg} for ${JSON.stringify(pconf, null, ' ')}`;
      throw err;
    }
  }

  /**
   * Begins a transaction by opening a connection from the pool
   * @param {String} txId The transaction ID that will be started
   * @returns {SQLERTransaction} The transaction
   */
  async beginTransaction(txId) {
    const dlt = internal(this);
    if (dlt.at.logger) {
      dlt.at.logger(`sqler-oracle: Beginning transaction ${txId} on connection pool "${dlt.at.pool.oracleConf.poolAlias}"`);
    }
    /** @type {SQLERTransaction} */
    const tx = {
      id: txId,
      state: Object.seal({
        isCommitted: false,
        isRolledback: false,
        pending: 0
      })
    };
    const pool = dlt.at.driver.getPool(dlt.at.pool.oracleConf.poolAlias);
    /** @type {OracleTransactionObject} */
    const txo = { tx, conn: await dlt.this.getConnection(pool, dlt.at.connConf) };
    const opts = { transactionId: tx.id };
    tx.commit = operation(dlt, 'commit', true, txo, opts, 'unprepare');
    tx.rollback = operation(dlt, 'rollback', true, txo, opts, 'unprepare');
    Object.freeze(tx);
    dlt.at.transactions.set(txId, txo);
    return tx;
  }

  /**
   * Executes a SQL statement
   * @param {String} sql the SQL to execute
   * @param {OracleExecOptions} opts The execution options
   * @param {String[]} frags the frament keys within the SQL that will be retained
   * @param {SQLERExecMeta} meta The SQL execution metadata
   * @param {(SQLERExecErrorOptions | Boolean)} [errorOpts] The error options to use
   * @returns {SQLERExecResults} The execution results
   */
  async exec(sql, opts, frags, meta, errorOpts) {
    const dlt = internal(this);
    const pool = dlt.at.driver.getPool(dlt.at.pool.oracleConf.poolAlias);
    /** @type {OracleTransactionObject} */
    const txo = opts.transactionId ? dlt.at.transactions.get(opts.transactionId) : null;
    let conn, bndp = {}, dopts, rslts, xopts, error;
    try {
      // interpolate and remove unused binds since
      // Oracle will throw "ORA-01036: illegal variable name/number" when unused bind parameters are passed (also, cuts down on payload bloat)
      bndp = dlt.at.track.interpolate(bndp, opts.binds, dlt.at.driver, props => sql.includes(`:${props[0]}`));

      dopts = opts.driverOptions;
      xopts = !!dopts && dopts.exec ? dlt.at.track.interpolate({}, dopts.exec, dlt.at.driver) : {};
      xopts.autoCommit = opts.autoCommit;
      if (!xopts.hasOwnProperty('outFormat')) xopts.outFormat = dlt.at.driver.OUT_FORMAT_OBJECT;

      conn = txo ? null : await dlt.this.getConnection(pool, opts);

      const rtn = {};

      if (opts.prepareStatement) {
        rtn.unprepare = async () => {
          if (dlt.at.logger) {
            dlt.at.logger(`sqler-oracle: "unprepare" is a noop since Oracle implements the concept of statement caching instead (${
              meta.path
            }). See https://oracle.github.io/node-oracledb/doc/api.html#-313-statement-caching`);
          }
        };
      }

      rslts = await (txo ? txo.conn : conn).execute(sql, bndp, xopts);

      rtn.rows = rslts.rows;
      rtn.raw = rslts;

      if (txo) {
        if (opts.autoCommit) {
          await operation(dlt, 'commit', false, txo, opts, 'unprepare')();
        } else {
          dlt.at.state.pending++;
        }
      }

      return rtn;
    } catch (err) {
      error = err;
      const msg = ` (BINDS: [${Object.keys(bndp)}], FRAGS: ${Array.isArray(frags) ? frags.join(', ') : frags})`;
      if (dlt.at.errorLogger) {
        dlt.at.errorLogger(`Failed to execute the following SQL:\n${sql}`, err);
      }
      err.message += msg;
      err.sqlerOracle = dopts;
      throw err;
    } finally {
      // transactions/prepared statements need the connection to remain open until commit/rollback/unprepare
      if (conn) {
        try {
          await operation(dlt, 'release', true, conn, opts)();
        } catch (cerr) {
          if (error) error.closeError = cerr;
        }
      }
    }
  }

  /**
   * Gets a new connection from the pool
   * @protected
   * @param {Object} pool The connection pool
   * @param {OracleExecOptions} [opts] The execution options
   * @returns {Object} The connection (when present)
   */
  async getConnection(pool, opts) {
    const dlt = internal(this);
    const hasDrvrOpts = opts && !!opts.driverOptions;
    const poolAttrs = (hasDrvrOpts && opts.driverOptions.pool) || {};
    poolAttrs.poolAlias = dlt.at.pool.oracleConf.poolAlias;
    return pool.getConnection(poolAttrs);
  }

  /**
   * Closes the Oracle connection pool
   * @returns {Integer} The number of connections closed
   */
  async close() {
    const dlt = internal(this);
    try {
      let pool;
      try {
        pool = dlt.at.driver.getPool(dlt.at.pool.oracleConf.poolAlias);
      } catch (err) {
      }
      if (dlt.at.logger) {
        dlt.at.logger(`sqler-oracle: Closing connection pool "${dlt.at.pool.oracleConf.poolAlias}" (uncommitted transactions: ${dlt.at.state.pending})`);
      }
      if (pool) await pool.close();
      dlt.at.transactions.clear();
      dlt.at.state.pending = 0;
      return dlt.at.state.pending;
    } catch (err) {
      if (dlt.at.errorLogger) {
        dlt.at.errorLogger(`sqler-oracle: Failed to close connection pool "${dlt.at.pool.oracleConf.poolAlias}" (uncommitted transactions: ${dlt.at.state.pending})`, err);
      }
      throw err;
    }
  }

  /**
   * @returns {SQLERState} The state
   */
  get state() {
    const dlt = internal(this);
    let pooled;
    try {
      pooled = dlt.at.driver.getPool(dlt.at.pool.oracleConf.poolAlias);
    } catch (err) {
      pooled = {};
    }
    return {
      connection: {
        count: pooled.connectionsOpen || 0,
        inUse: pooled.connectionsInUse || 0
      },
      pending: dlt.at.state.pending
    };
  }

  /**
   * @protected
   * @returns {Object} The oracledb driver module
   */
  get driver() {
    return internal(this).at.driver;
  }
};

/**
 * Executes a function by name that resides on the Oracle connection
 * @private
 * @param {Object} dlt The internal Oracle object instance
 * @param {String} name The name of the function that will be called on the connection
 * @param {Boolean} [reset] Truthy to reset the pending connection and transaction count when the operation completes successfully
 * @param {(PGTransactionObject | Object)} txoOrConn Either the transaction object or the connection itself
 * @param {SQLERExecOptions} [opts] The {@link SQLERExecOptions}
 * @returns {Function} A no-arguement `async` function that returns the number or pending transactions
 */
function operation(dlt, name, reset, txoOrConn, opts) {
  return async () => {
    /** @type {OracleTransactionObject} */
    const txo = opts.transactionId && txoOrConn.tx ? txoOrConn : null;
    const conn = txo ? txo.conn : txoOrConn;
    let ierr;
    try {
      if (dlt.at.logger) {
        dlt.at.logger(`sqler-oracle: Performing ${name} on connection pool "${dlt.at.pool.oracleConf.poolAlias}" (uncommitted transactions: ${dlt.at.state.pending})`);
      }
      await conn[name]();
      if (reset) {
        if (txo) dlt.at.transactions.delete(txo.tx.id);
        dlt.at.state.pending = 0;
      }
    } catch (err) {
      ierr = err;
      if (dlt.at.errorLogger) {
        dlt.at.errorLogger(`sqler-oracle: Failed to ${name} ${dlt.at.state.pending} transaction(s) with options: ${
          opts ? JSON.stringify(opts) : 'N/A'}`, ierr);
      }
      throw ierr;
    } finally {
      if (name !== 'end' && name !== 'release') {
        try {
          await conn.release();
        } catch (cerr) {
          if (ierr) {
            ierr.releaseError = cerr;
          }
        }
      }
    }
    return dlt.at.state.pending;
  };
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

/**
 * Oracle specific extension of the {@link SQLERConnectionOptions} from the [`sqler`](https://ugate.github.io/sqler/) module.
 * @typedef {SQLERConnectionOptions} OracleConnectionOptions
 * @property {Object} [driverOptions] The `oracledb` module specific options.
 * @property {Object} [driverOptions.global] An object that will contain properties set on the global `oracledb` module class.
 * When a value is a string surrounded by `${}`, it will be assumed to be a _constant_ property that resides on the `oracledb` module and will be interpolated
 * accordingly.
 * For example `driverOptions.global.someProp = '${ORACLEDB_CONSTANT}'` will be interpolated as `oracledb.someProp = oracledb.ORACLEDB_CONSTANT`.
 * @property {Object} [driverOptions.pool] The pool `conf` options that will be passed into `oracledb.createPool({ conf })`.
 * __Using any of the generic `pool.someOption` will override the `conf` options set on `driverOptions.pool`.__
 * When a value is a string surrounded by `${}`, it will be assumed to be a _constant_ property that resides on the `oracledb` module and will be interpolated
 * accordingly.
 * For example `driverOptions.pool.someProp = '${ORACLEDB_CONSTANT}'` will be interpolated as `pool.someProp = oracledb.ORACLEDB_CONSTANT`.
 * @property {Boolean} [driverOptions.pingOnInit=true] A truthy flag that indicates if a _ping_ will be performed after the connection pool is created when
 * {@link OracleDialect.init} is called.
 * @property {Boolean} [driverOptions.useTNS] Truthy to build a TNS `sql*net` connection string
 */

/**
 * Oracle specific extension of the {@link SQLERExecOptions} from the [`sqler`](https://ugate.github.io/sqler/) module. When a property of `binds` contains
 * an object it will be _interpolated_ for property values on the `oracledb` module.
 * For example, `binds.name = { dir: '${BIND_OUT}', type: '${STRING}', maxSize: 40 }` will be interpolated as
 * `binds.name = { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 40 }`.
 * @typedef {SQLERExecOptions} OracleExecOptions
 * @property {Object} [driverOptions] The `oracledb` module specific options.
 * @property {Object} [driverOptions.pool] The pool attribute options passed into `oracledbPool.getConnection()`.
 * When a value is a string surrounded by `${}`, it will be assumed to be a _constant_ property that resides on the `oracledb` module and will be interpolated
 * accordingly.
 * For example `driverOptions.pool.someProp = '${ORACLEDB_CONSTANT}'` will be interpolated as `pool.someProp = oracledb.ORACLEDB_CONSTANT`.
 * @property {Object} [driverOptions.exec] The execution options passed into `oracledbConnection.execute()`.
 * __NOTE: `driverOptions.autoCommit` is ignored in favor of the universal `autoCommit` set directly on the {@link SQLERExecOptions}.__
 * When a value is a string surrounded by `${}`, it will be assumed to be a _constant_ property that resides on the `oracledb` module and will be interpolated
 * accordingly.
 * For example `driverOptions.exec.someProp = '${ORACLEDB_CONSTANT}'` will be interpolated as `oracledbExecOpts.someProp = oracledb.ORACLEDB_CONSTANT`.
 */

/**
 * Transactions are wrapped in a parent transaction object so private properties can be added (e.g. prepared statements)
 * @typedef {Object} OracleTransactionObject
 * @property {SQLERTransaction} tx The transaction
 * @property {Object} conn The connection
 * @property {Map} unprepares Map of prepared statement names (key) and no-argument _async_ functions that will be called as a pre-operation call prior to
 * `commit` or `rollback` (value)
 */