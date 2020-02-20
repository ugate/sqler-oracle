'use strict';

/**
 * Oracle specific extension of the {@link Manager~ConnectionOptions} from the [`sqler`](https://ugate.github.io/sqler/) module.
 * @typedef {Manager~ConnectionOptions} OracleConnectionOptions
 * @property {Object} [driverOptions] The `oracledb` module specific options.
 * @property {String} [driverOptions.sid] An alternative to the default `service` option that indicates that a unique Oracle System ID for the DB will be used instead.
 * @property {Object} [driverOptions.global] An object that will contain properties set on the global `oracledb` module class.
 * When a value is a string surrounded by `${}`, it will be assumed to be a _constant_ property that resides on the `oracledb` module and will be interpolated
 * accordingly.
 * For example `driverOptions.global.someProp = '${ORACLEDB_CONSTANT}'` will be interpolated as `oracledb.someProp = oracledb.ORACLEDB_CONSTANT`.
 * @property {Object} [driverOptions.pool] The pool `conf` options that will be passed into `oracledb.createPool({ conf })`.
 * __Using any of the generic `pool.someOption` will override the `conf` options in favor of options set on `driverOptions.pool`.__
 * When a value is a string surrounded by `${}`, it will be assumed to be a _constant_ property that resides on the `oracledb` module and will be interpolated
 * accordingly.
 * For example `driverOptions.pool.someProp = '${ORACLEDB_CONSTANT}'` will be interpolated as `pool.someProp = oracledb.ORACLEDB_CONSTANT`.
 * @property {Boolean} [driverOptions.pingOnInit=true] A truthy flag that indicates if a _ping_ will be performed after the connection pool is created when
 * {@link OracleDialect.init} is called.
 */

/**
 * Oracle specific extension of the {@link Manager~ExecOptions} from the [`sqler`](https://ugate.github.io/sqler/) module. When a property of `binds` contains
 * an object it will be _interpolated_ for property values on the `oracledb` module.
 * For example, `binds.name = { dir: '${BIND_OUT}', type: '${STRING}', maxSize: 40 }` will be interpolated as
 * `binds.name = { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 40 }`.
 * @typedef {Manager~ExecOptions} OracleExecOptions
 * @property {Object} [driverOptions] The `oracledb` module specific options.
 * @property {Object} [driverOptions.pool] The pool attribute options passed into `oracledbPool.getConnection()`.
 * When a value is a string surrounded by `${}`, it will be assumed to be a _constant_ property that resides on the `oracledb` module and will be interpolated
 * accordingly.
 * For example `driverOptions.pool.someProp = '${ORACLEDB_CONSTANT}'` will be interpolated as `pool.someProp = oracledb.ORACLEDB_CONSTANT`.
 * @property {Object} [driverOptions.exec] The execution options passed into `oracledbConnection.execute()`.
 * __NOTE: `driverOptions.autoCommit` is ignored in favor of the universal `autoCommit` set directly on the {@link Manager~ExecOptions}.__
 * When a value is a string surrounded by `${}`, it will be assumed to be a _constant_ property that resides on the `oracledb` module and will be interpolated
 * accordingly.
 * For example `driverOptions.exec.someProp = '${ORACLEDB_CONSTANT}'` will be interpolated as `oracledbExecOpts.someProp = oracledb.ORACLEDB_CONSTANT`.
 */

/**
 * Oracle database {@link Dialect} implementation for [`sqler`](https://ugate.github.io/sqler/)
 */
module.exports = class OracleDialect {

  /**
   * Constructor
   * @constructs OracleDialect
   * @param {Manager~PrivateOptions} priv The private configuration options
   * @param {OracleConnectionOptions} connConf The individual SQL __connection__ configuration for the given dialect that was passed into the originating {@link Manager}
   * @param {Manager~Track} track Container for sharing data between {@link Dialect} instances.
   * @param {Function} [errorLogger] A function that takes one or more arguments and logs the results as an error (similar to `console.error`)
   * @param {Function} [logger] A function that takes one or more arguments and logs the results (similar to `console.log`)
   * @param {Boolean} [debug] A flag that indicates the dialect should be run in debug mode (if supported)
   */
  constructor(priv, connConf, track, errorLogger, logger, debug) {
    const dlt = internal(this);
    dlt.at.track = track;
    dlt.at.connections = {};
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
    const dopts = hasDrvrOpts && connConf.driverOptions.global;
    if (dopts) dlt.at.track.interpolate(dlt.at.oracledb, dopts);
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
      orcaleConf: hasDrvrOpts && connConf.driverOptions.pool ? dlt.at.track.interpolate({}, connConf.driverOptions.pool, dlt.at.oracledb) : {}
    };
    dlt.at.pingOnInit = hasDrvrOpts && connConf.driverOptions.hasOwnProperty('pingOnInit') ? !!connConf.driverOptions.pingOnInit : true;
    dlt.at.connConf = connConf;

    dlt.at.pool.orcaleConf.user = priv.username;
    dlt.at.pool.orcaleConf.password = priv.password;

    const host = connConf.host || priv.host, port = connConf.port || priv.port || 1521, protocol = connConf.protocol || priv.protocol || 'TCP';
    if (!host) throw new Error(`Oracle: Missing ${connConf.dialect} "host" for conection ${connConf.id}/${connConf.name} in private configuration options or connection configuration options`);

    if (hasDrvrOpts && connConf.driverOptions.sid) {
      //process.env.TNS_ADMIN = priv.privatePath;
      //dlt.at.tns = Path.join(process.env.TNS_ADMIN, 'tnsnames.ora');
      dlt.at.pool.orcaleConf.connectString = `(DESCRIPTION = (ADDRESS = (PROTOCOL = ${protocol})(HOST = ${host})(PORT = ${port}))` +
      `(CONNECT_DATA = (SERVER = POOLED)(SID = ${connConf.driverOptions.sid})))`;
      dlt.at.connectionType = 'SID';
      if (track.tnsCnt) track.tnsCnt++;
      else track.tnsCnt = 1;
    } else if (connConf.service) {
      dlt.at.pool.orcaleConf.connectString = `${host}/${connConf.service}:${port}`;
      dlt.at.connectionType = 'Service';
    } else throw new Error(`Oracle: Missing ${connConf.dialect} "service" or "sid" for conection ${connConf.id}/${connConf.name} in connection configuration options`);
    dlt.at.pool.orcaleConf.poolMin = poolOpts.min;
    dlt.at.pool.orcaleConf.poolMax = poolOpts.max;
    dlt.at.pool.orcaleConf.poolTimeout = poolOpts.idle;
    dlt.at.pool.orcaleConf.poolIncrement = poolOpts.increment;
    dlt.at.pool.orcaleConf.queueTimeout = poolOpts.timeout;
    dlt.at.pool.orcaleConf.poolAlias = poolOpts.alias;
  }

  /**
   * Initializes {@link OracleDialect} by creating the connection pool
   * @param {Dialect~DialectInitOptions} opts The options described by the `sqler` module
   * @returns {Object} The Oracle connection pool
   */
  async init(opts) {
    const dlt = internal(this), numSql = opts.numOfPreparedStmts;
    // statement cache should account for the number of prepared SQL statements/files by a factor of 3x to accomodate up to 3x fragments for each SQL file
    dlt.at.pool.orcaleConf.stmtCacheSize = numSql * 3;
    let oraPool;
    try {
      oraPool = await dlt.at.oracledb.createPool(dlt.at.pool.orcaleConf);
      if (dlt.at.logger) {
        dlt.at.logger(`Oracle: ${dlt.at.connectionType} connection pool "${oraPool.poolAlias}" created with poolPingInterval=${oraPool.poolPingInterval} ` +
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
      const msg = `Oracle: ${oraPool ? 'Unable to ping connection from' : 'Unable to create'} connection pool`;
      if (dlt.at.errorLogger) dlt.at.errorLogger(`${msg} ${JSON.stringify(err, null, ' ')}`);
      const pconf = Object.assign({}, dlt.at.pool.orcaleConf);
      pconf.password = '***'; // mask sensitive data
      err.message = `${err.message}\n${msg} for ${JSON.stringify(pconf, null, ' ')}`;
      throw err;
    }
  }

  /**
   * Begins a transaction by opening a connection from the pool
   * @param {String} txId The transaction ID that will be started
   */
  async beginTransaction(txId) {
    const dlt = internal(this);
    if (dlt.at.connections[txId]) return;
    if (dlt.at.logger) {
      dlt.at.logger(`Oracle: Beginning transaction on connection pool "${dlt.at.pool.orcaleConf.poolAlias}"`);
    }
    const pool = dlt.at.oracledb.getPool(dlt.at.pool.orcaleConf.poolAlias);
    dlt.at.connections[txId] = await dlt.this.getConnection(pool, { transactionId: txId });
  }

  /**
   * Executes a SQL statement
   * @param {String} sql the SQL to execute
   * @param {OracleExecOptions} opts The execution options
   * @param {String[]} frags the frament keys within the SQL that will be retained
   * @returns {Dialect~ExecResults} The execution results
   */
  async exec(sql, opts, frags) {
    const dlt = internal(this);
    const pool = dlt.at.oracledb.getPool(dlt.at.pool.orcaleConf.poolAlias);
    let conn, bndp = {}, rslts, xopts;
    try {
      // interpolate and remove unused binds since
      // Oracle will throw "ORA-01036: illegal variable name/number" when unused bind parameters are passed (also, cuts down on payload bloat)
      bndp = dlt.at.track.interpolate(bndp, opts.binds, dlt.at.oracledb, props => sql.includes(`:${props[0]}`));

      xopts = !!opts.driverOptions && opts.driverOptions.exec ? dlt.at.track.interpolate({}, opts.driverOptions.exec, dlt.at.oracledb) : {};
      xopts.autoCommit = opts.autoCommit;
      if (!xopts.hasOwnProperty('outFormat')) xopts.outFormat = dlt.at.oracledb.OUT_FORMAT_OBJECT;

      conn = await dlt.this.getConnection(pool, opts);
      dlt.at.state.connection.count = pool.connectionsOpen;
      dlt.at.state.connection.inUse = pool.connectionsInUse;
      
      rslts = await conn.execute(sql, bndp, xopts);

      const rtn = {
        rows: rslts.rows,
        raw: rslts
      };
      if (opts.autoCommit) {
        await operation(dlt, 'close', true, conn, opts)();
      } else {
        dlt.at.state.pending++;
        rtn.commit = operation(dlt, 'commit', true, conn, opts);
        rtn.rollback = operation(dlt, 'rollback', true, conn, opts);
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
      const msg = ` (BINDS: ${JSON.stringify(bndp)}, FRAGS: ${frags ? Array.isArray(frags) ? frags.join(', ') : frags : 'N/A'})`;
      if (dlt.at.errorLogger) {
        dlt.at.errorLogger(`Oracle: Failed to execute the following SQL: ${msg}\n${sql}`, err);
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
   * Gets the currently open connection or a new connection when no transaction is in progress
   * @protected
   * @param {Object} pool The connection pool
   * @param {OracleExecOptions} [opts] The execution options
   * @returns {Object} The connection (when present)
   */
  async getConnection(pool, opts) {
    const dlt = internal(this);
    const txId = opts && opts.transactionId;
    let conn = txId ? dlt.at.connections[txId] : null;
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
        dlt.at.logger(`Oracle: Closing connection pool "${dlt.at.pool.orcaleConf.poolAlias}" (uncommitted transactions: ${dlt.at.state.pending})`);
      }
      if (pool) await pool.close();
      dlt.at.connections = {};
      dlt.at.state.connection.count = 0;
      dlt.at.state.connection.inUse = 0;
      return dlt.at.state.pending;
    } catch (err) {
      if (dlt.at.errorLogger) {
        dlt.at.errorLogger(`Oracle: Failed to close connection pool "${dlt.at.pool.orcaleConf.poolAlias}" (uncommitted transactions: ${dlt.at.state.pending})`, err);
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
 * @param {Object} dlt The internal Oracle object instance
 * @param {String} name The name of the function that will be called on the connection
 * @param {Boolean} [reset] Truthy to reset the pending connection and transaction count when the operation completes successfully
 * @param {Object} [conn] The connection (ommit to get a connection from the pool)
 * @param {Manager~ExecOptions} [opts] The {@link Manager~ExecOptions}
 * @returns {Function} A no-arguement `async` function that returns the number or pending transactions
 */
function operation(dlt, name, reset, conn, opts) {
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
      if (conn && dlt.at.logger) {
        dlt.at.logger(`Oracle: Performing ${name} on connection pool "${dlt.at.pool.orcaleConf.poolAlias}" (uncommitted transactions: ${dlt.at.state.pending})`);
      }
      if (conn) await conn[name]();
      if (reset) {
        if (opts && opts.transactionId) delete dlt.at.connections[opts.transactionId];
        dlt.at.state.pending = 0;
      }
    } catch (err) {
      error = err;
      if (dlt.at.errorLogger) {
        dlt.at.errorLogger(`Oracle: Failed to ${name} ${dlt.at.state.pending} transaction(s) with options: ${
          opts ? JSON.stringify(opts) : 'N/A'}`, error);
      }
      throw error;
    } finally {
      if (conn && name !== 'close') {
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