'use strict';

const Fs = require('fs');
const Path = require('path');
const Util = require('util');

/**
* Oracle database implementation for [sqler](https://ugate.github.io/sqler/)
*/
module.exports = class OracleDialect {

  /**
   * Constructor
   * @constructs OracleDialect
   * @param {Manager~PrivateOptions} priv the username that will be used to connect to the database
   * @param {Manager~ConnectionOptions} connConf the individual SQL __connection__ configuration for the given dialect that was passed into the originating {@link Manager}
   * @param {String} [connConf.driverOptions.connectionClass] The Oracle connection class to use
   * @param {Object} [track={}] tracking object that will be used to prevent possible file overwrites of the TNS file when multiple {@link OracleDB}s are used
   * @param {function} [errorLogger=console.error] the logging function for errors
   * @param {function} [logger=console.log] the logging function for non-errors
   * @param {Boolean} [debug] the flag that indicates when debugging is turned on
   */
  constructor(priv, connConf, track = {}, errorLogger = console.error, logger = console.log, debug) {
    const ora = internal(this);

    ora.at.oracledb = require('oracledb');
    ora.at.oracledb.connectionClass = (connConf.driverOptions && connConf.driverOptions.connectionClass) || 'DBPOOL';
    ora.at.oracledb.Promise = Promise; // tell Oracle to use the built-in promise

    ora.at.errorLogger = errorLogger || console.error;
    ora.at.logger = logger || console.log;
    ora.at.debug = debug;
    ora.at.pool = { conf: connConf.driverOptions || {}, src: null };
    ora.at.connConf = connConf;

    ora.at.pool.conf.user = priv.username;
    ora.at.pool.conf.password = priv.password;
    ora.at.meta = { connections: { open: 0, inUse: 0 } };

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
      ora.at.pool.conf.connectString = connConf.driverOptions.sid;
      ora.at.connectionType = 'SID';
    } else {
      ora.at.pool.conf.connectString = `${host}${(connConf.service && ('/' + connConf.service)) || ''}${(port && (':' + port)) || ''}`;
      ora.at.connectionType = 'Service';
    }
    ora.at.pool.conf.poolMin = connConf.pool && connConf.pool.min;
    ora.at.pool.conf.poolMax = connConf.pool && connConf.pool.max;
    ora.at.pool.conf.poolTimeout = connConf.pool && connConf.pool.idle;
    ora.at.pool.conf.poolIncrement = connConf.pool && connConf.pool.increment;
    ora.at.pool.conf.queueTimeout = connConf.pool && connConf.pool.timeout;
    ora.at.pool.conf.poolAlias = connConf.pool && connConf.pool.alias;

    ora.at.log = createLog(ora);
  }

  /**
   * Initializes {@link OracleDialect} by creating the connection pool
   * @param {Dialect~DialectInitOptions} opts The options described by the `sqler` module
   * @returns {Object} the Oracle connection pool (or an error when returning errors instead of throwing them)
   */
  async init(opts) {
    const ora = internal(this), numSql = (opts && opts.numOfPreparedStmts && opts.numOfPreparedStmts) || 0;
    // statement cache should account for the number of prepared SQL statements/files by a factor of 3x to accomodate up to 3x fragments for each SQL file
    ora.at.pool.conf.stmtCacheSize = (numSql * 3) || 30;
    var oraPool;
    try {
      oraPool = await ora.at.oracledb.createPool(ora.at.pool.conf);
      ora.at.pool.alias = oraPool.poolAlias;
      ora.at.log(`Oracle ${ora.at.connectionType} connection pool "${oraPool.poolAlias}" created with poolPingInterval=${oraPool.poolPingInterval} ` +
        `stmtCacheSize=${oraPool.stmtCacheSize} (${numSql} SQL files) poolTimeout=${oraPool.poolTimeout} poolIncrement=${oraPool.poolIncrement} ` +
        `poolMin=${oraPool.poolMin} poolMax=${oraPool.poolMax}`);
      return oraPool;
    } catch (err) {
      ora.at.log(`Unable to create Oracle connection pool ${Util.inspect(err)}`);
      const pconf = Object.assign({}, ora.at.pool.conf), perr = new Error(`Unable to create Oracle DB pool for ${Util.inspect((pconf.password = '***') && pconf)}`);
      perr.cause = err;
      if (ora.at.connConf.returnErrors) return perr;
      throw perr;
    }
  }

  /**
   * Executes a SQL statement
   * @param {String} sql the SQL to execute
   * @param {Dialect~DialectExecOptions} opts the options described by the `sqler` module
   * @param {String[]} frags the frament keys within the SQL that will be retained
   * @returns {(Object[] | Error)} The result set, if any (or an error when returning errors instead of throwing them)
   */
  async exec(sql, opts, frags) {
    const ora = internal(this);
    const pool = ora.at.oracledb.getPool(ora.at.pool.alias);
    let conn, bndp, rslts, dopts;
    try {
      if (opts.binds && opts.numOfIterations) {
        throw new Error(`Cannot combine numOfIterations=${opts.numOfIterations} with bind variables=${JSON.stringify(opts.binds)}`);
      }
      conn = await pool.getConnection();
      ora.at.meta.connections.open = pool.connectionsOpen;
      ora.at.meta.connections.inUse = pool.connectionsInUse;
      // becasue binds may be altered for SQL a clone is made
      bndp = (opts.binds && JSON.parse(JSON.stringify(opts.binds))) || {};
      dopts = opts.driverOptions || {};
      if (!dopts.hasOwnProperty('outFormat')) dopts.outFormat = ora.at.oracledb.OBJECT;
      // Oracle will throw "ORA-01036: illegal variable name/number" when unused bind parameters are passed (also, cuts down on payload bloat)
      if (bndp) for (var prop in bndp) {
        if (!prop || sql.indexOf(`:${prop}`) < 0) delete bndp[prop];
      }
      rslts = opts.numOfIterations ? await conn.executeMany(sql, spts.numOfIterations, dopts) : await conn.execute(sql, bndp, dopts);
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
      ora.at.log(`Failed to execute the following SQL: ${msg}\n${sql}`, err);
      err.message += msg;
      err.sql = sql;
      err.sqlOptions = opts;
      err.sqlBindParams = bndp;
      err.sqlResults = rslts;
      if (ora.at.connConf.returnErrors) return err;
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
    const ora = internal(this);
    try {
      pool = ora.at.oracledb.getPool(ora.at.pool.alias);
      ora.at.log(`Closing Oracle connection pool "${ora.at.pool.alias}"${ora.tx.pending ? `(uncommitted transactions: ${opts.tx.pending})` : ''}`);
      pool && pool.close();
      return opts.tx.pending;
    } catch (err) {
      ora.at.log(`Failed to close Oracle connection pool "${ora.at.pool.alias}"${ora.tx.pending ? `(uncommitted transactions: ${opts.tx.pending})` : ''}`, err);
      if (ora.at.connConf.returnErrors) return err;
      throw err;
    }
  }

  /**
   * Determines if an {@link Dialect~DialectExecOptions} is setup for [autocommit](https://en.wikipedia.org/wiki/Autocommit)
   * @param {Dialect~DialectExecOptions} opts The execution options
   * @returns {Boolean} A flag indicating that transactions are setup to autocommit
   */
  isAutocommit(opts) {
    const ora = internal(this);
    return opts && opts.driverOptions && opts.driverOptions.hasOwnProperty('autocommit') ? opts.driverOptions.autocommit : ora.at.oracledb.autocommit || false;
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
};

/**
 * Executes a function by name that resides on the Oracle connection
 * @private
 * @param {String} name The name of the function that will be called on the connection
 * @param {Object} ora The internal Oracle object instance
 * @param {Dialect~DialectOptions} opts The {@link Dialect~DialectOptions}
 * @returns {Integer} The `opts.tx.pending` value
 */
async function operation(name, ora, opts) {
  const pool = ora.at.oracledb.getPool(ora.at.pool.alias);
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
    ora.at.log(`Failed to ${name} ${opts.tx.pending} Oracle transaction(s) with options: ${JSON.stringify(opts)}`, err);
    if (ora.at.connConf.returnErrors) return err;
    throw err;
  }
  return opts.tx.pending;
}

/**
 * Creates a logging function that logs each argument to either an error logger when the argument is an `Error` or a non-error logger
 * @private
 * @param {Object} ora The private Oracle instance
 * @returns {Function} A function that logs each argument using `ora`
 */
function createLog(ora) {
  return function log() {
    for (let arg in arguments) {
      if (arguments[arg] instanceof Error) ora.at.errorLogger(arguments[arg]);
      else ora.at.logger(arguments[arg]);
    }
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