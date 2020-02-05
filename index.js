'use strict';

const Fs = require('fs');
const Path = require('path');
const Util = require('util');

/**
 * Oracle specific {@link Manager~ConnectionOptions} from the `sqler` module
 * @typedef {Manager~ConnectionOptions} OracleDialect~ConnectionOptions
 * @property {Object} [driverOptions] The raw configuration to set directly on the `oracledb` module, etc.
 * @property {String} [driverOptions.sid] An alternative to the default `service` option that indicates that a unique Oracle System ID for the DB will be used instead
 * A `tnsnames.ora` file will be created under the `privatePath`. The `TNS_ADMIN` environmental variable will also be set the `privatePath` when using this option.
 * @property {Object} [driverOptions.global] An object that will contain properties set on the global `oracledb` module class
 * @property {Object} [driverOptions.pool] The pool `conf` options that will be passed into `oracledb.createPool({ conf })`.
 * __Using any of the generic `pool.someOption` will override the `conf` options set on `driverOptions.pool`.__
 * @property {Boolean} [driverOptions.pingOnInit=true] A truthy flag that indicates if a _ping_ will be performed after the connection pool is created when
 * {@link OracleDialect.init} is called.
 */

/**
 * Oracle specific {@link Manager~tExecOptions} from the `sqler` module
 * @typedef {Manager~ExecOptions} OracleDialect~OracleExecOptions
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
   * @param {function} [logger] the logging function for non-errors
   * @param {Boolean} [debug] the flag that indicates when debugging is turned on
   */
  constructor(priv, connConf, track = {}, errorLogger, logger, debug) {
    const dlt = internal(this);
    dlt.at.state = {
      pending: 0,
      connection: {
        count: 0,
        inUse: 0
      }
    };

    dlt.at.oracledb = require('oracledb');
    dlt.at.oracledb.Promise = Promise; // tell Oracle to use the built-in promise

    const hasDrvrOpts = !!connConf.driverOptions;
    const odbOpts = hasDrvrOpts && connConf.driverOptions.global;
    if (odbOpts) {
      for (let dopt in odbOpts) {
        if (!odbOpts.hasOwnProperty(dopt)) continue;
        dlt.at.oracledb[dopt] = odbOpts[dopt];
      }
    }
    // default autoCommit = true to conform to sqler
    dlt.at.oracledb.autoCommit = true;
    dlt.at.oracledb.connectionClass = dlt.at.oracledb.connectionClass || `SqlerOracleGen${Math.floor(Math.random() * 10000)}`;

    const poolOpts = connConf.pool || {};
    poolOpts.alias = poolOpts.alias || `sqlerOracleGen${Math.floor(Math.random() * 10000)}`;
    dlt.at.errorLogger = errorLogger;
    dlt.at.logger = logger;
    dlt.at.debug = debug;
    dlt.at.pool = {
      conf: poolOpts,
      orcaleConf: (hasDrvrOpts && connConf.driverOptions.pool) || {}
    };
    dlt.at.pingOnInit = hasDrvrOpts && connConf.driverOptions.hasOwnProperty('pingOnInit') ? !!connConf.driverOptions.pingOnInit : true;
    dlt.at.connConf = connConf;

    dlt.at.pool.orcaleConf.user = priv.username;
    dlt.at.pool.orcaleConf.password = priv.password;

    const host = connConf.host || priv.host, port = connConf.port || priv.port || 1521, protocol = connConf.protocol || priv.protocol || 'TCP';
    if (!host) throw new Error(`Missing ${connConf.dialect} "host" for conection ${connConf.id}/${connConf.name} in private configuration options or connection configuration options`);

    if (hasDrvrOpts && connConf.driverOptions.sid) {
      process.env.TNS_ADMIN = priv.privatePath;
      dlt.at.tns = Path.join(process.env.TNS_ADMIN, 'tnsnames.ora');
      const fdta = `${connConf.driverOptions.sid} = (DESCRIPTION = (ADDRESS = (PROTOCOL = ${protocol})(HOST = ${host})(PORT = ${port}))` +
        `(CONNECT_DATA = (SERVER = POOLED)(SID = ${connConf.driverOptions.sid})))${require('os').EOL}`;
      if (typeof track.tnsCnt === 'undefined') {
        Fs.writeFileSync(dlt.at.tns, fdta);
        track.tnsCnt = 1;
      } else {
        Fs.appendFileSync(dlt.at.tns, fdta);
        track.tnsCnt++;
      }
      dlt.at.pool.orcaleConf.connectString = connConf.driverOptions.sid;
      dlt.at.connectionType = 'SID';
    } else if (connConf.service) {
      dlt.at.pool.orcaleConf.connectString = `${host}/${connConf.service}:${port}`;
      dlt.at.connectionType = 'Service';
    } else throw new Error(`Missing ${connConf.dialect} "service" or "sid" for conection ${connConf.id}/${connConf.name} in connection configuration options`);
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
    const dlt = internal(this), numSql = opts.numOfPreparedStmts;
    // statement cache should account for the number of prepared SQL statements/files by a factor of 3x to accomodate up to 3x fragments for each SQL file
    dlt.at.pool.orcaleConf.stmtCacheSize = numSql * 3;
    let oraPool;
    try {
      oraPool = await dlt.at.oracledb.createPool(dlt.at.pool.orcaleConf);
      if (dlt.at.logger) {
        dlt.at.logger(`Oracle ${dlt.at.connectionType} connection pool "${oraPool.poolAlias}" created with poolPingInterval=${oraPool.poolPingInterval} ` +
          `stmtCacheSize=${oraPool.stmtCacheSize} (${numSql} SQL files) poolTimeout=${oraPool.poolTimeout} poolIncrement=${oraPool.poolIncrement} ` +
          `poolMin=${oraPool.poolMin} poolMax=${oraPool.poolMax}`);
      }
      if (dlt.at.pingOnInit) {
        // validate by ping connection from pool
        const conn = await oraPool.getConnection();
        try {
          await conn.ping();
        } finally {
          try {
            await conn.close();
          } catch (err) {
            // consume ping connection close errors
          }
        }
      }
      return oraPool;
    } catch (err) {
      const msg = `${oraPool ? 'Unable to ping connection from' : 'Unable to create'} Oracle connection pool`;
      if (dlt.at.errorLogger) dlt.at.errorLogger(`${msg} ${Util.inspect(err)}`);
      const pconf = Object.assign({}, dlt.at.pool.orcaleConf);
      pconf.password = '***'; // mask sensitive data
      err.message = `${err.message}\n${msg} for ${Util.inspect(pconf)}`;
      throw err;
    }
  }

  /**
   * Begins a transaction by opening a connection from the pool
   */
  async beginTransaction() {
    const dlt = internal(this);
    if (dlt.at.connection) return;
    if (dlt.at.logger) {
      dlt.at.logger(`Beginning transaction on Oracle connection pool "${
        dlt.at.pool.orcaleConf.poolAlias}"${dlt.at.state.pending ? `(uncommitted transactions: ${dlt.at.state.pending})` : ''}`);
    }
    const pool = dlt.at.oracledb.getPool(dlt.at.pool.orcaleConf.poolAlias);
    dlt.at.connection = await dlt.this.getConnection(pool/*, opts*/);
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
      if (opts.binds && opts.numOfIterations > 1) {
        throw new Error(`Cannot combine options.numOfIterations=${opts.numOfIterations} with bind variables`);
      }

      // becasue binds may be altered for SQL a clone is made
      bndp = {};
      xopts = (!!opts.driverOptions && opts.driverOptions.exec) || {};
      xopts.autoCommit = opts.autoCommit;

      //if (!xopts.hasOwnProperty('outFormat')) xopts.outFormat = dlt.at.oracledb.OUT_FORMAT_OBJECT;
      // Oracle will throw "ORA-01036: illegal variable name/number" when unused bind parameters are passed (also, cuts down on payload bloat)
      if (opts.binds) for (let prop in opts.binds) {
        if (sql.includes(`:${prop}`)) {
          bndp[prop] = opts.binds[prop];
        }
      }

      conn = await dlt.this.getConnection(pool, opts);
      dlt.at.state.connection.count = pool.connectionsOpen;
      dlt.at.state.connection.inUse = pool.connectionsInUse;
      
      rslts = opts.numOfIterations > 1 ? await conn.executeMany(sql, opts.numOfIterations, xopts) : await conn.execute(sql, bndp, xopts);

      const rtn = {
        rows: rslts.rows,
        raw: rslts
      };
      if (opts.autoCommit) {
        await conn.close();
      } else {
        dlt.at.state.pending++;
        rtn.commit = operation('commit', dlt, true, conn, opts);
        rtn.rollback = operation('rollback', dlt, true, conn, opts);
      }
      return rtn;
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
      err.sqlBinds = bndp;
      err.sqlResults = rslts;
      throw err;
    }
  }

  /**
   * Need an async function to prevent race conditions
   * @protected
   * @returns {Object} The connection (when present)
   */
  async getConnection(pool, opts) {
    const dlt = internal(this);
    let conn = dlt.at.connection;
    if (!conn) {
      const hasDrvrOpts = opts && !!opts.driverOptions;
      const poolAttrs = (hasDrvrOpts && opts.driverOptions.pool) || {};
      poolAttrs.poolAlias = dlt.at.pool.orcaleConf.poolAlias;
      conn = await pool.getConnection(poolAttrs);
    }
    return conn;
  }

  /**
   * Closes the Oracle connection pool
   * @returns {Integer} The number of connections closed
   */
  async close() {
    const dlt = internal(this);
    try {
      const pool = dlt.at.oracledb.getPool(dlt.at.pool.orcaleConf.poolAlias);
      if (dlt.at.logger) {
        dlt.at.logger(`Closing Oracle connection pool "${dlt.at.pool.orcaleConf.poolAlias}"${dlt.at.state.pending ? `(uncommitted transactions: ${dlt.at.state.pending})` : ''}`);
      }
      if (pool) await pool.close();
      if (dlt.at.tns) {
        try {
          await Fs.promises.unlink(dlt.at.tns);
        } catch (err) {
          if (dlt.at.errorLogger) {
            dlt.at.errorLogger(`Failed to remove TNS file at "${dlt.at.tns}" for pool "${dlt.at.pool.orcaleConf.poolAlias}"${
              dlt.at.state.pending ? `(uncommitted transactions: ${dlt.at.state.pending})` : ''}`, err);
          }
        }
      }
      return dlt.at.state.pending;
    } catch (err) {
      if (dlt.at.errorLogger) {
        dlt.at.errorLogger(`Failed to close Oracle connection pool "${dlt.at.pool.orcaleConf.poolAlias}"${
          dlt.at.state.pending ? `(uncommitted transactions: ${dlt.at.state.pending})` : ''}`, err);
      }
      throw err;
    }
  }

  /**
   * @returns {Manager~State} The state
   */
  get state() {
    return JSON.parse(JSON.stringify(internal(this).at.state));
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
 * @param {Boolean} [reset] Truthy to reset the pending connection and transaction count when the operation completes successfully
 * @param {Object} [conn] The connection (ommit to get a connection from the pool)
 * @param {Manager~ExecOptions} [opts] The {@link Manager~ExecOptions}
 * @returns {Function} A no-arguement `async` function that returns the number or pending transactions
 */
function operation(name, dlt, reset, conn, opts) {
  return async () => {
    let error;
    try {
      if (!conn) {
        const pool = dlt.at.oracledb.getPool(dlt.at.pool.orcaleConf.poolAlias);
        const hasDrvrOpts = opts && !!opts.driverOptions;
        const poolAttrs = (hasDrvrOpts && opts.driverOptions.pool) || {};
        poolAttrs.poolAlias = dlt.at.pool.orcaleConf.poolAlias;
        conn = await pool.getConnection(poolAttrs);
      }
      await conn[name]();
      if (reset) {
        dlt.at.connection = null;
        dlt.at.state.pending = 0;
      }
    } catch (err) {
      error = err;
      if (dlt.at.errorLogger) {
        dlt.at.errorLogger(`Failed to ${name} ${dlt.at.state.pending} Oracle transaction(s) with options: ${
          opts ? JSON.stringify(opts) : 'N/A'}`, error);
      }
      throw error;
    } finally {
      if (conn) {
        try {
          await conn.close();
        } catch (cerr) {
          if (error) error.closeError = cerr;
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