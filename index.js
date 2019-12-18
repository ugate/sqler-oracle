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
   * @param {String} un the connection username
   * @param {String} up the connection password
   * @param {Object} sconf the global options
   * @param {String} sconf.host the host name
   * @param {Integer} [sconf.port] the port
   * @param {String} [sconf.connectionClass] the oracle connection class to use
   * @param {String} [sconf.protocol=TCP] the protocol
   * @param {Object} [sconf.dialectOptions={}] the options passed as directly into the `oracledb` configuration
   * @param {Object} [sconf.pool] the pooling options
   * @param {Integer} [sconf.pool.min] the minimum number of connections
   * @param {Integer} [sconf.pool.max] the maximum number of connections
   * @param {Integer} [sconf.pool.idle] the number of seconds after which the pool terminates idle connections
   * @param {Integer} [sconf.pool.increment] the number of connections that are opened whenever a connection request exceeds the number of currently open connections
   * @param {Integer} [sconf.pool.timeout] the number of milliseconds that a connection request should wait in the queue before the request is terminated
   * @param {Integer} [sconf.pool.alias] the alias of this pool in the connection pool cache
   * @param {String} name the Oracle service name 
   * @param {String} type the Oracle SID
   * @param {String} [privatePath=process.cwd()] the directory path where the TNS file will be created (only used when a `type` is passed for the SID)
   * @param {Object} [track={}] tracking object that will be used to prevent possible file overwrites of the TNS file when multiple {@link OracleDB}s are used
   * @param {function} [errorLogger=console.error] the logging function for errors
   * @param {function} [logger=console.log] the logging function for non-errors
   * @param {Boolean} [debug] the flag that indicates when debugging is turned on
   */
  constructor(un, up, sconf, name, type, privatePath = process.cwd(), track = {}, errorLogger = console.error, logger = console.log, debug) {
    const ora = internal(this);

    ora.at.oracledb = require('oracledb');
    ora.at.oracledb.connectionClass = sconf.connectionClass || 'DBPOOL';
    ora.at.oracledb.Promise = Promise; // tell Oracle to use the built-in promise

    ora.at.errorLogger = errorLogger || console.error;
    ora.at.logger = logger || console.log;
    ora.at.debug = debug;
    ora.at.pool = { conf: sconf.dialectOptions || {}, src: null };
    ora.at.sconf = sconf;

    ora.at.pool.conf.user = un;
    ora.at.pool.conf.password = up;
    ora.at.meta = { connections: { open: 0, inUse: 0 } };

    if (type) {
      process.env.TNS_ADMIN = privatePath;
      const fpth = Path.join(process.env.TNS_ADMIN, 'tnsnames.ora');
      const fdta = `${type} = (DESCRIPTION = (ADDRESS = (PROTOCOL = ${sconf.protocol || 'TCP'})(HOST = ${sconf.host})(PORT = ${sconf.port || 1521}))` +
        `(CONNECT_DATA = (SERVER = POOLED)(SID = ${type})))${require('os').EOL}`;
      if (typeof track.tnsCnt === 'undefined' && (track.tnsCnt = 1)) {
        Fs.writeFileSync(fpth, fdta);
      } else if (++track.tnsCnt) {
        Fs.appendFileSync(fpth, fdta);
      }
      ora.at.pool.conf.connectString = type;
      ora.at.connectionType = 'SID';
    } else {
      ora.at.pool.conf.connectString = `${sconf.host}${(name && ('/' + name)) || ''}${(sconf.port && (':' + sconf.port)) || ''}`;
      ora.at.connectionType = 'Service';
    }
    ora.at.pool.conf.poolMin = sconf.pool && sconf.pool.min;
    ora.at.pool.conf.poolMax = sconf.pool && sconf.pool.max;
    ora.at.pool.conf.poolTimeout = sconf.pool && sconf.pool.idle;
    ora.at.pool.conf.poolIncrement = sconf.pool && sconf.pool.increment;
    ora.at.pool.conf.queueTimeout = sconf.pool && sconf.pool.timeout;
    ora.at.pool.conf.poolAlias = sconf.pool && sconf.pool.alias;
  }

  /**
   * Initializes {@link OracleDialect} by creating the connection pool
   * @param {Object} [opts] initialization options
   * @param {Integer} [opts.numOfPreparedStmts] the number of prepared SQL statements
   * @returns {Object} the Oracle connection pool
   */
  async init(opts) {
    const ora = internal(this), numSql = (opts && opts.numOfPreparedStmts && opts.numOfPreparedStmts) || 0;
    // statement cache should account for the number of prepared SQL statements/files by a factor of 3x to accomodate up to 3x fragments for each SQL file
    ora.at.pool.conf.stmtCacheSize = (numSql * 3) || 30;
    var oraPool;
    try {
      oraPool = await ora.at.oracledb.createPool(ora.at.pool.conf);
      ora.at.pool.alias = oraPool.poolAlias;
      ora.this.log(`Oracle ${ora.at.connectionType} connection pool "${oraPool.poolAlias}" created with poolPingInterval=${oraPool.poolPingInterval} ` +
        `stmtCacheSize=${oraPool.stmtCacheSize} (${numSql} SQL files) poolTimeout=${oraPool.poolTimeout} poolIncrement=${oraPool.poolIncrement} ` +
        `poolMin=${oraPool.poolMin} poolMax=${oraPool.poolMax}`);
      return oraPool;
    } catch (err) {
      ora.this.log(`Unable to create Oracle connection pool ${Util.inspect(err)}`);
      const pconf = Object.assign({}, ora.at.pool.conf), perr = new Error(`Unable to create Oracle DB pool for ${Util.inspect((pconf.password = '***') && pconf)}`);
      perr.cause = err;
      throw perr;
    }
  }

  /**
   * Executes a SQL statement
   * @param {String} sql the SQL to execute 
   * @param {Object} [opts] the options that control SQL execution
   * @param {Object} [opts.statementOptions] the options applied to the SQL statement
   * @param {String} [opts.statementOptions.type] the type of CRUD operation that is being executed (i.e. `CREATE`, `READ`, `UPDATE`, `DELETE`)
   * @param {Object} [opts.bindVariables] the key/value pair of replacement parameters that will be used in the SQL
   * @param {String[]} frags the frament keys within the SQL that will be retained
   * @param {Boolean} [ctch] true to catch and return errors insead of throwing them
   * @returns {Object[]} the result set (if any)
   */
  async exec(sql, opts, frags, ctch) {console.log('##########################3',opts)
    const ora = internal(this);
    const pool = ora.at.oracledb.getPool(ora.at.pool.alias);
    var conn, bndp, rslts, oopts;
    try {
      conn = await pool.getConnection();
      ora.at.meta.connections.open = pool.connectionsOpen;
      ora.at.meta.connections.inUse = pool.connectionsInUse;
      // becasue bindVariables may be altered for SQL a clone is made
      bndp = (opts && opts.bindVariables && JSON.parse(JSON.stringify(opts.bindVariables))) || {};
      oopts = { outFormat: ora.at.oracledb.OBJECT };
      // Oracle will throw "ORA-01036: illegal variable name/number" when unused bind parameters are passed (also, cuts down on payload bloat)
      if (bndp) for (var prop in bndp) {
        if (!prop || sql.indexOf(`:${prop}`) < 0) delete bndp[prop];
      }
      rslts = await conn.execute(sql, bndp, oopts);
      conn.close();
      return rslts.rows;
    } catch (err) {
      if (conn) conn.close();
      err.message += ` BINDS: ${bndp ? JSON.stringify(bndp) : 'N/A'}, FRAGS: ${frags ? frags.join(', ') : 'N/A'}`;
      err.sql = sql;
      err.sqlBindParams = bndp;
      err.sqlResults = rslts;
      if (ctch) return err;
      throw err;
    }
  }

  /**
   * Closes the connection pool
   */
  async close() {
    const ora = internal(this), pool = ora.at.oracledb.getPool(ora.at.pool.alias);
    ora.this.log(`Closing Oracle connection pool "${ora.at.pool.alias}"`);
    return pool ? pool.close() : null;
  }

  /**
   * Logs each argument to either an error logger when the argument is an `Error` or a non-error logger
   */
  log() {
    const ora = internal(this);
    for (let arg in arguments) {
      if (arguments[arg] instanceof Error) ora.at.errorLogger(arguments[arg]);
      else ora.at.logger(arguments[arg]);
    }
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