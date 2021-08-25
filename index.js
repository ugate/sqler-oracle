'use strict';

const DBDriver = require('oracledb');
const Stream = require('stream');
const typedefs = require('sqler/typedefs');

/**
 * Oracle database {@link Dialect} implementation for [`sqler`](https://ugate.github.io/sqler/)
 */
class OracleDialect {

  /**
   * Constructor
   * @constructs OracleDialect
   * @param {typedefs.SQLERPrivateOptions} priv The private configuration options
   * @param {OracleConnectionOptions} connConf The individual SQL __connection__ configuration for the given dialect that was passed into the originating {@link Manager}
   * @param {typedefs.SQLERTrack} track Container for sharing data between {@link Dialect} instances.
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
      connections: {
        count: 0,
        inUse: 0
      },
      pending: 0
    };

    dlt.at.driver = DBDriver;

    const hasDrvrOpts = !!connConf.driverOptions;
    const dopts = hasDrvrOpts && connConf.driverOptions.global;
    if (dopts) dlt.at.track.interpolate(dlt.at.driver, dopts);
    // default autoCommit = true to conform to sqler
    dlt.at.driver.autoCommit = true;
    dlt.at.driver.connectionClass = dlt.at.driver.connectionClass || `SqlerOracleGen${Math.floor(Math.random() * 10000)}`;

    /** @type {DBDriver.PoolAttributes} */
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
  
    const url = {
      host: connConf.host, // host will be defaulted to priv.host by sqler
      port: connConf.port || priv.port || 1521,
      protocol: connConf.protocol || priv.protocol || 'TCP'
    };
    if (!url.host) throw new Error(`sqler-oracle: Missing ${connConf.dialect} "host" for conection ${connConf.id}/${connConf.name} in private configuration options or connection configuration options`);

    if (connConf.service) {
      if (hasDrvrOpts && connConf.driverOptions.useTNS) {
        //process.env.TNS_ADMIN = priv.privatePath;
        //dlt.at.tns = Path.join(process.env.TNS_ADMIN, 'tnsnames.ora');
        dlt.at.pool.oracleConf.connectString = `(DESCRIPTION = (ADDRESS = (PROTOCOL = ${url.protocol})(HOST = ${url.host})(PORT = ${url.port}))` +
        `(CONNECT_DATA = (SERVER = POOLED)(SERVICE_NAME = ${connConf.service})))`;
        dlt.at.connectionType = 'TNS_SERVICE';
        if (track.tnsCnt) track.tnsCnt++;
        else track.tnsCnt = 1;
      } else {
        dlt.at.pool.oracleConf.connectString = `${url.host}:${url.port}/${connConf.service}`;
        dlt.at.connectionType = 'SERVICE';
      }
    } else throw new Error(`sqler-oracle: Missing ${connConf.dialect} "service" for conection ${connConf.id}/${connConf.name} in connection configuration options`);
    dlt.at.pool.oracleConf.poolMin = poolOpts.min;
    dlt.at.pool.oracleConf.poolMax = poolOpts.max;
    dlt.at.pool.oracleConf.poolTimeout = poolOpts.idle;
    dlt.at.pool.oracleConf.poolIncrement = poolOpts.increment;
    dlt.at.pool.oracleConf.queueTimeout = poolOpts.timeout;
    dlt.at.pool.oracleConf.poolAlias = alias;
  }

  /**
   * Initializes {@link OracleDialect} by creating the connection pool
   * @param {typedefs.SQLERInitOptions} opts The options described by the `sqler` module
   * @returns {Object} The Oracle connection pool
   */
  async init(opts) {
    const dlt = internal(this), numSql = opts.numOfPreparedFuncs;
    statementCacheSize(dlt, numSql);
    /** @type {DBDriver.Pool} */
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
        /** @type {DBDriver.Connection} */
        const conn = await oraPool.getConnection();
        /** @type {InternalFlightRecorder} */
        let pingRecorder;
        try {
          await conn.ping();
        } catch (err) {
          pingRecorder = errored(`sqler-oracle: ${oraPool ? 'Unable to ping connection from' : 'Unable to create'} connection pool`, dlt, null, err);
        } finally {
          await finalize(pingRecorder, dlt, operation(dlt, 'close', false, conn, opts));
        }
      }
      return oraPool;
    } catch (err) {
      errored(`sqler-oracle: ${oraPool ? 'Unable to ping connection from' : 'Unable to create'} connection pool`, dlt, null, err);
      throw err;
    }
  }

  /**
   * Begins a transaction by opening a connection from the pool
   * @param {String} txId The transaction ID that will be started
   * @param {typedefs.SQLERTransactionOptions} opts The transaction options passed in via the public API
   * @returns {typedefs.SQLERTransaction} The transaction that was started
   */
  async beginTransaction(txId) {
    const dlt = internal(this);
    if (dlt.at.logger) {
      dlt.at.logger(`sqler-oracle: Beginning transaction ${txId} on connection pool "${dlt.at.pool.oracleConf.poolAlias}"`);
    }
    /** @type {typedefs.SQLERTransaction} */
    const tx = {
      id: txId,
      state: Object.seal({
        committed: 0,
        rolledback: 0,
        pending: 0,
        isReleased: false
      })
    };
    const pool = dlt.at.driver.getPool(dlt.at.pool.oracleConf.poolAlias);
    /** @type {OracleTransactionObject} */
    const txo = { tx, conn: await dlt.this.getConnection(pool, dlt.at.connConf) };
    /** @type {typedefs.SQLERExecOptions} */
    const opts = { transactionId: tx.id };
    const commit = operation(dlt, 'commit', true, txo, opts);
    tx.commit = async (isRelease) => {
      await commit();
      if (isRelease) await operation(dlt, 'close', true, txo, opts)();
    };
    const rollback = operation(dlt, 'rollback', true, txo, opts);
    tx.rollback = async (isRelease) => {
      await rollback();
      if (isRelease) await operation(dlt, 'close', true, txo, opts)();
    };
    Object.freeze(tx);
    dlt.at.transactions.set(txId, txo);
    return tx;
  }

  /**
   * Executes a SQL statement
   * @param {String} sql the SQL to execute
   * @param {OracleExecOptions} opts The execution options
   * @param {String[]} frags the frament keys within the SQL that will be retained
   * @param {typedefs.SQLERExecMeta} meta The SQL execution metadata
   * @param {(typedefs.SQLERExecErrorOptions | Boolean)} [errorOpts] The error options to use
   * @returns {typedefs.SQLERExecResults} The execution results
   */
  async exec(sql, opts, frags, meta, errorOpts) {
    /** @type {InternalFlightRecorder} */
    let recorder;
    const dlt = internal(this), numSql = opts.numOfPreparedFuncs;
    statementCacheSize(dlt, numSql); // <- in case it changes from a manager.scan call or the cache expired
    /** @type {OracleTransactionObject} */
    const txo = opts.transactionId ? dlt.at.transactions.get(opts.transactionId) : null;
    /** @type {DBDriver.Connection} */
    let conn;
    /** @type {InternalExecMeta} */
    let execMeta;
    /** @type {DBDriver.Result} */
    let rslts;
    try {
      /** @type {typedefs.SQLERExecResults} */
      const rtn = {};

      if (opts.stream >= 0) { // streams handle prepared statements when streaming starts
        rslts = [ opts.type === 'READ' ? await createReadStream(dlt, sql, opts, meta, txo, rtn) : createWriteStream(dlt, sql, opts, meta, txo, rtn) ];
        rtn.rows = rslts;
        rtn.raw = rslts;
      } else {
        if (opts.prepareStatement) {
          prepared(dlt, sql, opts, meta, txo, rtn);
        }
        execMeta = createExecMeta(dlt, sql, opts);
        const pool = dlt.at.driver.getPool(dlt.at.pool.oracleConf.poolAlias);
        conn = txo ? null : await dlt.this.getConnection(pool, opts);
        rslts = await (txo ? txo.conn : conn).execute(execMeta.sql, execMeta.binds, execMeta.dopts.exec);

        if (txo) {
          if (opts.autoCommit) {
            await operation(dlt, 'commit', false, txo, opts)();
          } else {
            txo.tx.state.pending++;
            dlt.at.state.pending++;
          }
        }
        rtn.rows = rslts.rows;
        rtn.raw = rslts;
      }
      return rtn;
    } catch (err) {
      recorder = errored(`sqler-oracle: Failed to execute the following SQL:\n${sql}`, dlt, meta, err);
      throw err;
    } finally {
      if (conn) {
        await finalize(recorder, dlt, operation(dlt, 'close', false, conn, opts));
      }
    }
  }

  /**
   * Gets a new connection from the pool
   * @protected
   * @param {DBDriver.Pool} pool The connection pool
   * @param {OracleExecOptions} [opts] The execution options
   * @returns {DBDriver.Connection} The connection (when present)
   */
  async getConnection(pool, opts) {
    const dlt = internal(this);
    const hasDrvrOpts = opts && !!opts.driverOptions;
    /** @type {DBDriver.PoolAttributes} */
    const poolAttrs = (hasDrvrOpts && opts.driverOptions.pool) || {};
    poolAttrs.poolAlias = dlt.at.pool.oracleConf.poolAlias;
    return pool.getConnection(poolAttrs);
  }

  /**
   * Closes the Oracle connection pool
   * @returns {Number} The number of connections closed
   */
  async close() {
    const dlt = internal(this);
    try {
      /** @type {DBDriver.Pool} */
      let pool;
      try {
        pool = dlt.at.driver.getPool(dlt.at.pool.oracleConf.poolAlias);
      } catch (err) {
      }
      if (dlt.at.logger) {
        dlt.at.logger(`sqler-oracle: Closing connection pool "${dlt.at.pool.oracleConf.poolAlias}" ${statusLabel(dlt)}`);
      }
      if (pool) await pool.close();
      dlt.at.transactions.clear();
      dlt.at.state.pending = 0;
      if (dlt.at.logger) {
        dlt.at.logger(`sqler-oracle: Closed connection pool "${dlt.at.pool.oracleConf.poolAlias}" ${statusLabel(dlt)}`);
      }
      return dlt.at.state.pending;
    } catch (err) {
      errored(`sqler-oracle: Failed to close connection pool "${dlt.at.pool.oracleConf.poolAlias}" ${statusLabel(dlt)}`, dlt, null, err);
      throw err;
    }
  }

  /**
   * @returns {typedefs.SQLERState} The state
   */
  get state() {
    const dlt = internal(this);
    /** @type {DBDriver.Pool} */
    let pooled;
    try {
      pooled = dlt.at.driver.getPool(dlt.at.pool.oracleConf.poolAlias);
    } catch (err) {
      pooled = {};
    }
    dlt.at.state.connections.count = pooled.connectionsOpen || 0;
    dlt.at.state.connections.inUse = pooled.connectionsInUse || 0;
    // use a copy for external use
    return JSON.parse(JSON.stringify(dlt.at.state));
  }

  /**
   * @protected
   * @returns {DBDriver} The `oracledb` driver module
   */
  get driver() {
    return internal(this).at.driver;
  }
}

module.exports = OracleDialect;

/**
 * Creates bind parameters suitable for SQL execution in Oracle
 * @private
 * @param {InternalOracleDB} dlt The internal Oracle object instance
 * @param {String} sql the SQL to execute
 * @param {OracleExecOptions} opts The execution options
 * @param {Object} [bindsAlt] An alternative to `opts.binds` that will be used
 * @returns {InternalExecMeta} The binds metadata
 */
function createExecMeta(dlt, sql, opts, bindsAlt) {
  /** @type {InternalExecMeta} */
  const rtn = {};
  const binds = bindsAlt || opts.binds;

  // interpolate and remove unused binds since
  // Oracle will throw "ORA-01036: illegal variable name/number" when unused bind parameters are passed (also, cuts down on payload bloat)
  rtn.bndp = dlt.at.track.interpolate({}, binds, dlt.at.driver, props => sql.includes(`:${props[0]}`));

  rtn.dopts = opts.driverOptions || {};
  rtn.dopts.exec = !!rtn.dopts && rtn.dopts.exec ? dlt.at.track.interpolate({}, rtn.dopts.exec, dlt.at.driver) : {};
  rtn.dopts.exec.autoCommit = opts.autoCommit;
  if (!rtn.dopts.exec.hasOwnProperty('outFormat')) rtn.dopts.exec.outFormat = dlt.at.driver.OUT_FORMAT_OBJECT;console.log('~~~~~~~~~~~~~~', rtn.dopts.exec.outFormat === dlt.at.driver.OUT_FORMAT_OBJECT)

  rtn.sql = sql;
  rtn.binds = rtn.bndp;

  return rtn;
}

/**
 * Executes a function by name that resides on the Oracle connection
 * @private
 * @param {InternalOracleDB} dlt The internal Oracle object instance
 * @param {String} name The name of the function that will be called on the connection
 * @param {Boolean} [reset] Truthy to reset the pending connection and transaction count when the operation completes successfully
 * @param {(OracleTransactionObject | DBDriver.Connection)} txoOrConn Either the transaction object or the connection itself
 * @param {typedefs.SQLERExecOptions} [opts] The {@link typedefs.SQLERExecOptions}
 * @returns {Function} A no-arguement `async` function that returns the number or pending transactions
 */
function operation(dlt, name, reset, txoOrConn, opts) {
  return async () => {
    /** @type {InternalFlightRecorder} */
    let recorder = {};
    /** @type {OracleTransactionObject} */
    const txo = opts.transactionId && txoOrConn.tx ? txoOrConn : null;
    /** @type {DBDriver.Connection} */
    const conn = txo ? txo.conn : txoOrConn;
    try {
      if (txo && txo.tx.state.isReleased && (name === 'commit' || name === 'rollback')) {
        return Promise.reject(new Error(`"${name}" already called on transaction "${txo.tx.id}"`));
      }
      if (dlt.at.logger) {
        dlt.at.logger(`sqler-oracle: Performing ${name} on connection pool "${dlt.at.pool.oracleConf.poolAlias}" ${statusLabel(dlt, null, txo)}`);
      }
      await conn[name]();
      if (txo) {
        if (name === 'commit') {
          txo.tx.state.committed++;
        } else if (name === 'rollback') {
          txo.tx.state.rolledback++;
        } else if (name === 'close' || name === 'release' /* release is depricated */) {
          txo.tx.state.isReleased = true;
        }
      }
      if (reset) {
        if (txo) dlt.at.transactions.delete(txo.tx.id);
        dlt.at.state.pending = 0;
      }
      if (dlt.at.logger) {
        dlt.at.logger(`sqler-oracle: Performed ${name} on connection pool "${dlt.at.pool.oracleConf.poolAlias}" ${statusLabel(dlt, null, txo)}`);
      }
    } catch (err) {
      recorder = errored(`sqler-oracle: Failed to ${name} ${dlt.at.state.pending} transaction(s) with options: ${
        opts ? JSON.stringify(Object.keys(opts)) : 'N/A'}`, dlt, null, err);
      throw err;
    } finally {
      if (name !== 'close' && name !== 'release' /* release is depricated */ && name !== 'end' && ((recorder && recorder.error) || (!txo && conn))) {
        await finalize(recorder, dlt, operation(dlt, 'close', false, conn, opts));
      }
    }
    return dlt.at.state.pending;
  };
}

/**
 * Returns a label that contains connection details, transaction counts, etc.
 * @private
 * @param {InternalOracleDB} dlt The internal dialect object instance
 * @param {OracleExecOptions} [opts] Execution options that will be included in the staus label
 * @param {OracleTransactionObject} [txo] An optional transactiopn to add to the status label
 * @returns {String} The status label
 */
function statusLabel(dlt, opts, txo) {
  try {
    const state = dlt.at.state;
    return `(( ${opts ? `[ ${opts.name ? `name: ${opts.name}, ` : ''}type: ${opts.type} ]` : ''}[ uncommitted transactions: ${state.pending}${
      dlt.at.pool ? `, total connections: ${state.connections.count}, active connections: ${state.connections.inUse}` : ''} ]${
        txo ? ` - Transaction state: ${JSON.stringify(txo.tx.state)}` : ''} ))`;
  } catch (err) {
    if (dlt.at.errorLogger) {
      dlt.at.errorLogger('sqler-oracle: Failed to create status label', err);
    }
  }
}

/**
 * Creates a read stream that batches the read SQL executions
 * @private
 * @param {InternalOracleDB} dlt The internal Oracle object instance
 * @param {String} sql The SQL to execute.
 * @param {OracleExecOptions} opts The execution options
 * @param {typedefs.SQLERExecMeta} meta The SQL execution metadata
 * @param {OracleTransactionObject} [txo] The transaction object to use. When not specified, a connection will be established on the first write to the stream.
 * @param {typedefs.SQLERExecResults} rtn Where the _public_ prepared statement functions will be set (ignored when the read stream is not for a prepared
 * statement).
 * @returns {Stream.Readable} The created read stream
 */
async function createReadStream(dlt, sql, opts, meta, txo, rtn) {
  /** @type {Promise<DBDriver.Connection>} */
  let connProm;
  /** @type {InternalFlightRecorder[]} */
  const recorders = [];
  const execMeta = createExecMeta(dlt, sql, opts);
  const pool = dlt.at.driver.getPool(dlt.at.pool.oracleConf.poolAlias);
  const conn = txo ? null : connProm ? await connProm : await (connProm = dlt.this.getConnection(pool, opts));
  const readable = (txo ? txo.conn : conn).queryStream(execMeta.sql, execMeta.binds);
  // dlt.at.track.readable(opts, readable);
  readable.on('error', async (err) => {
    if (err.sqlerOracle) return;
    recorders.push(errored(`sqler-oracle: An error occurred during ${Stream.Readable.name} streaming for SQL:\n${sql}`, dlt, meta, err));
  });
  readable.on('close', closeStreamHandler(dlt, sql, opts, meta, txo, () => connProm, readable, recorders));
  return readable;
}

/**
 * Creates a write stream that batches the write SQL executions
 * @private
 * @param {InternalOracleDB} dlt The internal Oracle object instance
 * @param {String} sql The SQL to execute
 * @param {OracleExecOptions} opts The execution options
 * @param {typedefs.SQLERExecMeta} meta The SQL execution metadata
 * @param {OracleTransactionObject} [txo] The transaction object to use. When not specified, a connection will be established on the first write to the stream.
 * @param {typedefs.SQLERExecResults} rtn Where the _public_ prepared statement functions will be set (ignored when the write stream is not for a prepared
 * statement).
 * @returns {Stream.Writable} The created write stream
 */
function createWriteStream(dlt, sql, opts, meta, txo, rtn) {
  /** @type {Promise<DBDriver.Connection>} */
  let connProm;
  /** @type {InternalFlightRecorder[]} */
  const recorders = [];
  const writable = dlt.at.track.writable(opts, async (batch) => {
    try {
      if (dlt.at.logger) {
        dlt.at.logger(`sqler-oracle: Started ${Stream.Writable.name} stream execution for ${batch.length} batches ${statusLabel(dlt, opts, txo)}`);
      }
      const pool = dlt.at.driver.getPool(dlt.at.pool.oracleConf.poolAlias);
      const conn = txo ? txo.conn : connProm ? await connProm : await (connProm = dlt.this.getConnection(pool, opts));
      // batch all the binds into a single exectuion for a performance gain
      // https://oracle.github.io/node-oracledb/doc/api.html see connection.executeMany()
      let rslts, rslt;
      let bi = 0;
      const bindsArray = new Array(batch.length);
      /** @type {InternalExecMeta} */
      let execMeta;
      for (let binds of batch) {
        execMeta = createExecMeta(dlt, sql, opts, binds);
        // rslt = await conn.execute(execMeta.sql, execMeta.binds, execMeta.dopts.exec);
        // if (rslts) rslts.push(rslt);
        // else rslts = [ rslt ];
        bindsArray[bi] = execMeta.binds;
        bi++;
      }
      rslt = await conn.executeMany(execMeta.sql, bindsArray, execMeta.dopts.exec);
      if (rslts) {
        rslts.push(rslt);
      } else {
        rslts = Array.isArray(rslt) ? rslt : [ rslt ];
      }
      if (dlt.at.logger) {
        dlt.at.logger(`sqler-oracle: Completed execution of ${batch.length} batched write streams${
          execMeta.outs ? ` (with ${execMeta.outs.length} out binds)` : ''}`);
      }
      return rslts;
    } catch (err) {
      recorders.push(errored(`sqler-oracle: Failed to execute writable stream batch for ${
        batch ? batch.length : 'invalid batch'} on the following SQL:\n${sql}`, dlt, meta, err));
      throw err;
    }
  });
  writable.on('close' /* 'finish' */, closeStreamHandler(dlt, sql, opts, meta, txo, () => connProm, writable, recorders));
  return writable;
}

/**
 * Handles a `close` event on a stream by closing a connection (when passed), emitting the {@link typedefs.EVENT_STREAM_RELEASE} event and handling a transaction
 * `commit` (when a {@link OracleTransactionObject} is passed).
 * @private
 * @param {InternalOracleDB} dlt The internal dialect object instance
 * @param {String} sql The SQL to execute
 * @param {OracleExecOptions} opts The execution options
 * @param {typedefs.SQLERExecMeta} meta The SQL execution metadata
 * @param {OracleTransactionObject} [txo] The transaction object to use. When not specified, a connection will be established on the first write to the stream.
 * @param {Function} [getConn] An `async function()` to get the {@link DBDriver.Connection} that will be closed (ignored when a transaction is specified).
 * @param {(Stream.Readable | Stream.Writable)} stream The stream where the `close` event will be emitted.
 * @param {InternalFlightRecorder[]} recorders The flight recorders where the any errors will be recorded.
 * @returns {Function} An `async function()` that handles the `close` event on the specified stream
 */
function closeStreamHandler(dlt, sql, opts, meta, txo, getConn, stream, recorders) {
  const type = stream instanceof Stream.Readable ? Stream.Readable.name : stream instanceof Stream.Writable ? Stream.Writable.name : 'N/A';
  let isCommitted;
  return async () => {
    try {
      /** @type {DBDriver.Connection} */
      const conn = typeof getConn === 'function' ? await getConn() : null;
      if (conn) {
        await operation(dlt, 'close', false, conn, opts)();
        stream.emit(typedefs.EVENT_STREAM_RELEASE);
      }
      if (txo && opts.autoCommit && !recorders.length) {
        await operation(dlt, 'commit', false, txo, opts)();
        isCommitted = true;
        stream.emit(typedefs.EVENT_STREAM_COMMIT, txo.tx.id);
      } else if (txo) {
        txo.tx.state.pending++;
        dlt.at.state.pending++;
      }
    } catch (err) {
      recorders.push(errored(`sqler-oracle: Failed to handle ${type} stream close event for SQL:\n${sql}`, dlt, meta, err));
      stream.emit('error', recorders[recorders.length - 1].error);
    } finally {
      if (!isCommitted && txo && opts.autoCommit && recorders.length) {
        await finalize(recorders, dlt, async () => {
          await operation(dlt, 'rollback', false, txo, opts)();
          stream.emit(typedefs.EVENT_STREAM_ROLLBACK, txo.tx.id);
        });
      }
    }
  };
}

/**
 * Either generates a prepared statement when it doesn't currently exist, or returns an existing prepared statement that waits for the original prepared statement
 * creation/connectivity/setup to complete before performing any executions.
 * @private
 * @param {InternalOracleDB} dlt The internal Oracle object instance
 * @param {String} sql The raw SQL to execute for the prepared statement
 * @param {OracleExecOptions} opts The execution options
 * @param {typedefs.SQLERExecMeta} meta The SQL execution metadata
 * @param {OracleTransactionObject} [txo] The transaction object to use. When not specified, a connection will be established.
 * @param {typedefs.SQLERExecResults} rtn The execution results used by the prepared statement where `unprepare` will be set
 * @returns {Object} The prepared statement
 */
function prepared(dlt, sql, opts, meta, txo, rtn) {
  rtn.unprepare = async () => {
    if (dlt.at.logger) {
      dlt.at.logger(`sqler-oracle: "unprepare" is a noop since Oracle implements the concept of statement caching instead (${
        meta.path
      }). See https://oracle.github.io/node-oracledb/doc/api.html#-313-statement-caching`);
    }
  };
  return {};
}

/**
 * There is no prepare/unprepare since Oracle uses {@link https://oracle.github.io/node-oracledb/doc/api.html#-313-statement-caching statement caching}.
 * Statement cache should account for the number of prepared functions/SQL files by a factor of `3x` to accomodate that many fragments in each SQL file.
 * @private
 * @param {InternalOracleDB} dlt The internal Oracle object instance
 * @param {Number} numSql The total number of SQL files used on the dialect
 * @returns {Number} The statement cache size
 */
function statementCacheSize(dlt, numSql) {
  dlt.at.pool.oracleConf.stmtCacheSize = (dlt.at.driverOptions && dlt.at.driverOptions.stmtCacheSize) || ((numSql || 1) * 3);
  return dlt.at.pool.oracleConf.stmtCacheSize;
}

/**
 * Error handler
 * @private
 * @param {String} label A label to use to describe the error
 * @param {InternalOracleDB} dlt The internal dialect object instance
 * @param {typedefs.SQLERExecMeta} [meta] The SQL execution metadata
 * @param {Error} error An error that has occurred
 * @returns {InternalFlightRecorder} The flight recorder
 */
function errored(label, dlt, meta, error) {
  if (dlt.at.errorLogger) {
    dlt.at.errorLogger(label, error);
  }
  try {
    const pconf = Object.assign({}, dlt.at.pool.oracleConf);
    pconf.password = '***'; // mask sensitive data
    error.sqlerOracle = {
      message: label,
      poolConf: pconf,
      status: statusLabel(dlt)
    };
  } catch (err) {
    if (dlt.at.errorLogger) {
      dlt.at.errorLogger('sqler-oracle: Failed to capture error meta', err);
    }
  }
  return { error };
}

/**
 * Finally block handler
 * @private
 * @param {(InternalFlightRecorder | InternalFlightRecorder[])} [recorder] The flight recorder
 * @param {InternalOracleDB} dlt The internal dialect object instance
 * @param {Function} [func] An `async function()` that will be invoked in a catch wrapper that will be consumed and recorded when a flight recorder is
 * provided
 * @param {String} [funcErrorProperty=releaseError] A property name on the flight recorder error that will be set when the `func` itself errors
 * @returns {InternalFlightRecorder} The recorded error
 */
async function finalize(recorder, dlt, func, funcErrorProperty = 'releaseError') {
  // transactions/prepared statements need the connection to remain open until commit/rollback/unprepare
  if (typeof func === 'function') {
    try {
      await func();
    } catch (err) {
      if (recorder) {
        for (let rec of Array.isArray(recorder) ? recorder : [recorder]) {
          if (rec.error) recorder.error[funcErrorProperty] = err;
        }
      }
    }
  }
}

// private mapping
let map = new WeakMap();

/**
 * Internal state generator
 * @private
 * @param {DBDriver} dialect The dialect driver
 * @returns {InternalOracleDB} TThe internal dialect state
 */
let internal = function(dialect) {
  if (!map.has(dialect)) {
    map.set(dialect, {});
  }
  return {
    at: map.get(dialect),
    this: dialect
  };
};

/**
 * Oracle specific driver options
 * @typedef {Object} OracleDriverOptions
 * @property {Object} [global] An object that will contain properties set on the global `oracledb` module class. When a value is a string surrounded by `${}`,
 * it will be assumed to be a _constant_ property that resides on the `oracledb` module and will be interpolated accordingly.
 * For example `driverOptions.global.someProp = '${ORACLEDB_CONSTANT}'` will be interpolated as `oracledb.someProp = oracledb.ORACLEDB_CONSTANT`.
 * @property {Object} [pool] The pool `conf` options that will be passed into `oracledb.createPool({ conf })`. __Using any of the generic `pool.someOption`
 * will override the `conf` options set on `driverOptions.pool`.__ When a value is a string surrounded by `${}`, it will be assumed to be a _constant_
 * property that resides on the `oracledb` module and will be interpolated accordingly.
 * For example `driverOptions.pool.someProp = '${ORACLEDB_CONSTANT}'` will be interpolated as `pool.someProp = oracledb.ORACLEDB_CONSTANT`.
 * @property {Boolean} [pingOnInit=true] A truthy flag that indicates if a _ping_ will be performed after the connection pool is created when
 * {@link OracleDialect.init} is called.
 * @property {Boolean} [useTNS] Truthy to build a TNS `sql*net` connection string
 * @property {Number} [stmtCacheSize=numberOfSQLFiles * 3] The statement size that `oracledb` uses
 */

/**
 * Oracle specific extension of the {@link typedefs.SQLERConnectionOptions} from the [`sqler`](https://ugate.github.io/sqler/) module.
 * @typedef {Object} OracleConnectionOptionsType
 * @property {OracleDriverOptions} [driverOptions] The `oracledb` module specific options.
 * @typedef {typedefs.SQLERConnectionOptions & OracleConnectionOptionsType} OracleConnectionOptions
 */

/**
 * Oracle specific extension of the execution options
 * @typedef {Object} OracleExecDriverOptions
 * @property {DBDriver.Pool} [pool] The pool attribute options passed into `oracledbPool.getConnection()`. When a value is a string surrounded by `${}`, it will be assumed
 * to be a _constant_ property that resides on the `oracledb` module and will be interpolated accordingly.
 * For example `driverOptions.pool.someProp = '${ORACLEDB_CONSTANT}'` will be interpolated as `pool.someProp = oracledb.ORACLEDB_CONSTANT`.
 * @property {(DBDriver.ExecuteOptions | DBDriver.ExecuteManyOptions)} [exec] The execution options passed into `oracledbConnection.execute()`.
 * __NOTE: `driverOptions.autoCommit` is ignored in favor of the universal `autoCommit` set directly on the {@link typedefs.SQLERExecOptions}.__
 * When a value is a string surrounded by `${}`, it will be assumed to be a _constant_ property that resides on the `oracledb` module and will be interpolated
 * accordingly.
 * For example `driverOptions.exec.someProp = '${ORACLEDB_CONSTANT}'` will be interpolated as `oracledbExecOpts.someProp = oracledb.ORACLEDB_CONSTANT`.
 * When streaming __writes__ using `execOpts.stream`, all executions are batched into `oracledb.Connection.executeMany` using `execOpts.stream` value as the batch size.
 * Therefore, a valid `exec.bindDefs` should be included as defined within the [oracldb documentation](https://oracle.github.io/node-oracledb/doc/api.html) when [DML
 * RETURNING](https://oracle.github.io/node-oracledb/doc/api.html#dml-returning-with-executemany).
 */

/**
 * Oracle specific extension of the {@link typedefs.SQLERExecOptions} from the [`sqler`](https://ugate.github.io/sqler/) module. When a property of `binds` contains
 * an object it will be _interpolated_ for property values on the `oracledb` module.
 * For example, `binds.name = { dir: '${BIND_OUT}', type: '${STRING}', maxSize: 40 }` will be interpolated as
 * `binds.name = { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 40 }`.
 * @typedef {Object} OracleExecOptionsType
 * @property {OracleExecDriverOptions} [driverOptions] The `oracledb` module specific execution options.
 * @typedef {typedefs.SQLERExecOptions & OracleExecOptionsType} OracleExecOptions
 */

/**
 * Transactions are wrapped in a parent transaction object so private properties can be added (e.g. prepared statements)
 * @typedef {Object} OracleTransactionObject
 * @property {typedefs.SQLERTransaction} tx The transaction
 * @property {DBDriver.Connection} conn The connection
 * @property {Map<String, Function>} unprepares Map of prepared statement names (key) and no-argument _async_ functions that will be called as a pre-operation
 * call prior to `commit` or `rollback` (value)
 */

// ========================================== Internal Use ==========================================

/**
 * Internal database use
 * @typedef {Object} InternalOracleDB
 * @property {OracleDialect} this The dialect instance
 * @property {Object} at The internal dialect state
 * @property {typedefs.SQLERTrack} at.track The track
 * @property {DBDriver} at.driver The dialect driver
 * @property {Map<String, OracleTransactionObject>} at.transactions The transactions map
 * @property {Object} at.pool The connection pool
 * @property {DBDriver.PoolAttributes} at.pool.oracleConf The `oracledb` pool attributes
 * @property {String} at.pool.alias The alias for the pool used to lookup the pool
 * @property {DBDriver.PoolAttributes} at.pool.conf The original/raw pool attributes
 * @property {typedefs.SQLERState} at.state The __global__ dialect state
 * @property {Function} [at.errorLogger] A function that takes one or more arguments and logs the results as an error (similar to `console.error`)
 * @property {Function} [at.logger] A function that takes one or more arguments and logs the results (similar to `console.log`)
 * @property {Boolean} [at.debug] A flag that indicates the dialect should be run in debug mode (if supported)
 * @property {Boolean} [at.pingOnInit] Truthy to ping when {@link OracleDialect.init}
 * @private
 */

/**
 * Metadata used inpreparation for execution.
 * @typedef {Object} InternalExecMeta
 * @property {OracleExecDriverOptions} dopts The formatted execution driver options.
 * @property {String} sql The formatted/bound execution SQL statement. Will also be set on `dopts.exec.sql` (when present).
 * @property {(Object | Array)} [binds] Either an object that contains the bind parameters as property names and property values as the bound values that can be
 * bound to an SQL statement or an `Array` of values format to support use of `?` parameter markers (non-prepared statements).
 * @property {Object} [bndp] The interpolated version of `opts.binds`.
 * @property {Object} [bindDefs] The properties within `binds` that are marked to be `oracledb.BIND_OUT`
 * @private
 */

/**
 * @typedef {Object} InternalFlightRecorder
 * @property {Error} [error] An errored that occurred
 * @property {DBDriver.Connection} [conn] A connection that will be `released` when an error exists
 * @private
 */