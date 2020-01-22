'use strict';

const Fs = require('fs');
const Path = require('path');
const Util = require('util');

/**
 * Oracle specific {@link Manager~ConnectionOptions} from the `sqler` module
 * @typedef {Manager~ConnectionOptions} OracleDialect~ConnectionOptions
 * @property {Object} [driverOptions] The raw configuration to set directly on the `oracledb` module, etc.
 * @property {String} [driverOptions.sid] An alternative to the default `service` option that indicates that a unique Oracle System ID for the DB will be used instead
 * A `tnsnames.ora` file will be created under the `TNS_ADMIN` environmental variable path.
 * @property {Object} [driverOptions.global] An object that will contain properties set on the global `oracledb` module class
 * @property {Object} [driverOptions.pool] The pool `conf` options that will be passed into `oracledb.createPool({ conf })`.
 * __Using any of the generic `pool.someOption` will override the `conf` options set on `driverOptions.pool`.__
 */

/**
 * Oracle specific {@link Dialect~DialectExecOptions} from the `sqler` module
 * @typedef {Dialect~DialectExecOptions} OracleDialect~OracleDialectExecOptions
 * @property {Object} [driverOptions.pool] The pool attribute options passed into `oracledbPool.getConnection()`
 * @property {Object} [driverOptions.exec] The execution options passed into `oracledbConnection.execute()`
 */

/**
 * Oracle database implementation for [sqler](https://ugate.github.io/sqler/)
 */
module.exports = class OracleDialect {

  /**
   * Constructor
   * @constructs OracleDialect
   * @param {Manager~PrivateOptions} priv the username that will be used to connect to the database
   * @param {OracleDialect~ConnectionOptions} connConf the individual SQL __connection__ configuration for the given dialect that was passed into the originating {@link Manager}
   * @param {Object} [track={}] tracking object that will be used to prevent possible file overwrites of the TNS file when multiple {@link OracleDB}s are used
   * @param {function} [errorLogger] the logging function for errors
   * @param {function} [logger=console.log] the logging function for non-errors
   * @param {Boolean} [debug] the flag that indicates when debugging is turned on
   */
  constructor(priv, connConf, track = {}, errorLogger, logger, debug) {
    const dlt = internal(this);

    dlt.at.oracledb = require('oracledb');
    dlt.at.oracledb.Promise = Promise; // tell Oracle to use the built-in promise

    const odbOpts = connConf.driverOptions && connConf.driverOptions.global;
    if (odbOpts) {
      for (let dopt in odbOpts) {
        if (!odbOpts.hasOwnProperty(dopt)) continue;
        dlt.at.oracledb[dopt] = odbOpts[dopt];
      }
    }
    if (!dlt.at.oracledb.connectionClass) dlt.at.oracledb.connectionClass = 'SqlerOracle';

    const poolOpts = connConf.pool || {};
    poolOpts.alias = poolOpts.alias || `sqlerOracleGenAlias${Math.floor(Math.random() * 10000)}`;
    dlt.at.errorLogger = errorLogger;
    dlt.at.logger = logger;
    dlt.at.debug = debug;
    dlt.at.pool = { conf: poolOpts, src: null, orcaleConf: (connConf.driverOptions && connConf.driverOptions.pool) || {} };
    dlt.at.connConf = connConf;

    dlt.at.pool.orcaleConf.user = priv.username;
    dlt.at.pool.orcaleConf.password = priv.password;
    dlt.at.meta = { connections: { open: 0, inUse: 0 } };

    const host = connConf.host || priv.host, port = connConf.port || priv.port, protocol = connConf.protocol || priv.protocol;
    if (!host) throw new Error(`Missing ${connConf.dialect} "host" for conection ${connConf.id}/${connConf.name} in private configuration options or connection configuration options`);

    if (connConf.driverOptions && connConf.driverOptions.sid) {
      process.env.TNS_ADMIN = priv.privatePath;
      const fpth = Path.join(process.env.TNS_ADMIN, 'tnsnames.ora');
      const fdta = `${connConf.driverOptions.sid} = (DESCRIPTION = (ADDRESS = (PROTOCOL = ${protocol || 'TCP'})(HOST = ${host})(PORT = ${port || 1521}))` +
        `(CONNECT_DATA = (SERVER = POOLED)(SID = ${connConf.driverOptions.sid})))${require('os').EOL}`;
      if (typeof track.tnsCnt === 'undefined' && (track.tnsCnt = 1)) {
        Fs.writeFileSync(fpth, fdta);
      } else if (++track.tnsCnt) {
        Fs.appendFileSync(fpth, fdta);
      }
      dlt.at.pool.orcaleConf.connectString = connConf.driverOptions.sid;
      dlt.at.connectionType = 'SID';
    } else {
      dlt.at.pool.orcaleConf.connectString = `${host}${(connConf.service && ('/' + connConf.service)) || ''}${(port && (':' + port)) || ''}`;
      dlt.at.connectionType = 'Service';
    }
    if (!dlt.at.pool.orcaleConf.hasOwnProperty('poolMin')) dlt.at.pool.orcaleConf.poolMin = poolOpts.min;
    if (!dlt.at.pool.orcaleConf.hasOwnProperty('poolMax')) dlt.at.pool.orcaleConf.poolMax = poolOpts.max;
    if (!dlt.at.pool.orcaleConf.hasOwnProperty('poolTimeout')) dlt.at.pool.orcaleConf.poolTimeout = poolOpts.idle;
    if (!dlt.at.pool.orcaleConf.hasOwnProperty('poolIncrement')) dlt.at.pool.orcaleConf.poolIncrement = poolOpts.increment;
    if (!dlt.at.pool.orcaleConf.hasOwnProperty('queueTimeout')) dlt.at.pool.orcaleConf.queueTimeout = poolOpts.timeout;
    if (!dlt.at.pool.orcaleConf.hasOwnProperty('poolAlias')) dlt.at.pool.orcaleConf.poolAlias = poolOpts.alias;
  }

  /**
   * Initializes {@link OracleDialect} by creating the connection pool
   * @param {Dialect~DialectInitOptions} opts The options described by the `sqler` module
   * @returns {Object} the Oracle connection pool (or an error when returning errors instead of throwing them)
   */
  async init(opts) {
    const dlt = internal(this), numSql = (opts && opts.numOfPreparedStmts && opts.numOfPreparedStmts) || 0;
    // statement cache should account for the number of prepared SQL statements/files by a factor of 3x to accomodate up to 3x fragments for each SQL file
    dlt.at.pool.orcaleConf.stmtCacheSize = (numSql * 3) || 30;
    let oraPool;
    try {
      try {
        oraPool = dlt.at.oracledb.getPool(dlt.at.pool.orcaleConf.poolAlias);
      } catch (err) {
        // consume any errors
      }
      if (!oraPool) {
        oraPool = await dlt.at.oracledb.createPool(dlt.at.pool.orcaleConf);
      }
      if (dlt.at.logger) {
        dlt.at.logger(`Oracle ${dlt.at.connectionType} connection pool "${oraPool.poolAlias}" created with poolPingInterval=${oraPool.poolPingInterval} ` +
          `stmtCacheSize=${oraPool.stmtCacheSize} (${numSql} SQL files) poolTimeout=${oraPool.poolTimeout} poolIncrement=${oraPool.poolIncrement} ` +
          `poolMin=${oraPool.poolMin} poolMax=${oraPool.poolMax}`);
      }
      return oraPool;
    } catch (err) {
      if (dlt.at.errorLogger) {
        dlt.at.errorLogger(`Unable to create Oracle connection pool ${Util.inspect(err)}`);
      }
      const pconf = Object.assign({}, dlt.at.pool.orcaleConf), perr = new Error(`Unable to create Oracle DB pool for ${Util.inspect((pconf.password = '***') && pconf)}`);
      perr.cause = err;
      if (dlt.at.connConf.returnErrors) return perr;
      throw perr;
    }
  }

  /**
   * Executes a SQL statement
   * @param {String} sql the SQL to execute
   * @param {OracleDialect~OracleDialectExecOptions} opts The execution options
   * @param {String[]} frags the frament keys within the SQL that will be retained
   * @returns {(Object[] | Error)} The result set, if any (or an error when returning errors instead of throwing them)
   */
  async exec(sql, opts, frags) {
    const dlt = internal(this);
    const pool = dlt.at.oracledb.getPool(dlt.at.pool.orcaleConf.poolAlias);
    let conn, bndp, rslts, xopts;
    try {
      if (opts.binds && opts.numOfIterations) {
        throw new Error(`Cannot combine numOfIterations=${opts.numOfIterations} with bind variables=${JSON.stringify(opts.binds)}`);
      }
      const poolAttrs = opts.driverOptions && opts.driverOptions.pool;
      conn = poolAttrs ? await pool.getConnection(poolAttrs) : await pool.getConnection();
      dlt.at.meta.connections.open = pool.connectionsOpen;
      dlt.at.meta.connections.inUse = pool.connectionsInUse;
      // becasue binds may be altered for SQL a clone is made
      bndp = {};
      xopts = (opts.driverOptions && opts.driverOptions.exec) || {};
      if (!xopts.hasOwnProperty('outFormat')) xopts.outFormat = dlt.at.oracledb.OBJECT;
      // Oracle will throw "ORA-01036: illegal variable name/number" when unused bind parameters are passed (also, cuts down on payload bloat)
      if (opts.binds) for (let prop in opts.binds) {
        if (prop || sql.includes(`:${prop}`)) bndp[prop] = opts.binds[prop];
      }
      rslts = opts.numOfIterations ? await conn.executeMany(sql, spts.numOfIterations, xopts) : await conn.execute(sql, bndp, xopts);
      conn.close();
      return rslts.rows;
    } catch (err) {
      if (conn) {
        try {
          conn.close();
        } catch (cerr) {
          err.closeError = cerr;
        }
      }
      const msg = ` (BINDS: ${bndp ? JSON.stringify(bndp) : 'N/A'}, FRAGS: ${frags ? Array.isArray(frags) ? frags.join(', ') : frags : 'N/A'})`;
      if (dlt.at.errorLogger) {
        dlt.at.errorLogger(`Failed to execute the following SQL: ${msg}\n${sql}`, err);
      }
      err.message += msg;
      err.sql = sql;
      err.sqlOptions = opts;
      err.sqlBindParams = bndp;
      err.sqlResults = rslts;
      if (dlt.at.connConf.returnErrors) return err;
      throw err;
    }
  }

  /**
   * Commit the current transaction(s) in progress
   * @param {Dialect~DialectOptions} opts The dialect options
   * @returns {(Integer | Error)} The number of transactions that were successfully committed (or an error when returning errors instead of throwing them)
   */
  async commit(opts) {
    return operation('commit', internal(this), opts);
  }

  /**
   * Rollback the current transaction(s) in progress
   * @param {Dialect~DialectOptions} opts The dialect options
   * @returns {(Integer | Error)} The number of transactions that were successfully rolled back (or an error when returning errors instead of throwing them)
   */
  async rollback(opts) {
    return operation('rollback', internal(this), opts);
  }

  /**
   * Closes the Oracle connection pool
   * @param {Dialect~DialectOptions} opts the options described by the `sqler` module
   * @returns {(Integer | Error)} The number of connections closed (or an error when returning errors instead of throwing them)
   */
  async close(opts) {
    const dlt = internal(this);
    try {
      const pool = dlt.at.oracledb.getPool(dlt.at.pool.orcaleConf.poolAlias);
      if (dlt.at.logger) {
        dlt.at.logger(`Closing Oracle connection pool "${dlt.at.pool.orcaleConf.poolAlias}"${opts.tx.pending ? `(uncommitted transactions: ${opts.tx.pending})` : ''}`);
      }
      pool && pool.close();
      return opts.tx.pending;
    } catch (err) {
      if (dlt.at.errorLogger) {
        dlt.at.errorLogger(`Failed to close Oracle connection pool "${dlt.at.pool.orcaleConf.poolAlias}"${opts.tx.pending ? `(uncommitted transactions: ${opts.tx.pending})` : ''}`, err);
      }
      if (dlt.at.connConf.returnErrors) return err;
      throw err;
    }
  }

  /**
   * Determines if an {@link Dialect~DialectExecOptions} is setup for [autocommit](https://en.wikipedia.org/wiki/Autocommit)
   * @param {Dialect~DialectExecOptions} opts The execution options
   * @returns {Boolean} A flag indicating that transactions are setup to autocommit
   */
  isAutocommit(opts) {
    const dlt = internal(this);
    return opts && opts.driverOptions && opts.driverOptions.global && opts.driverOptions.global.hasOwnProperty('autocommit') ? opts.driverOptions.global.autocommit : dlt.at.oracledb.autocommit || false;
  }

  /**
   * @returns {Integer} the last captured number of connections
   */
  get lastConnectionCount() {
    return internal(this).at.meta.connections.open;
  }

  /**
   * @returns {Integer} the last captured number of connections that were in use
   */
  get lastConnectionInUseCount() {
    return internal(this).at.meta.connections.inUse;
  }

  /**
   * @protected
   * @returns {Object} The oracledb driver module
   */
  get driver() {
    return internal(this).at.oracledb;
  }
};

/**
 * Executes a function by name that resides on the Oracle connection
 * @private
 * @param {String} name The name of the function that will be called on the connection
 * @param {Object} dlt The internal Oracle object instance
 * @param {Dialect~DialectOptions} opts The {@link Dialect~DialectOptions}
 * @returns {Integer} The `opts.tx.pending` value
 */
async function operation(name, dlt, opts) {
  const pool = dlt.at.oracledb.getPool(dlt.at.pool.orcaleConf.poolAlias);
  let conn;
  try {
    conn = await pool.getConnection();
    await conn[name]();
    conn.close();
  } catch (err) {
    if (conn) {
      try {
        conn.close();
      } catch (cerr) {
        err.closeError = cerr;
      }
    }
    if (dlt.at.errorLogger) {
      dlt.at.errorLogger(`Failed to ${name} ${opts.tx.pending} Oracle transaction(s) with options: ${JSON.stringify(opts)}`, err);
    }
    if (dlt.at.connConf.returnErrors) return err;
    throw err;
  }
  return opts.tx.pending;
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