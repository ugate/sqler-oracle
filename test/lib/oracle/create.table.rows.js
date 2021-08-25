'use strict';

const typedefs = require('sqler/typedefs');
const Fs = require('fs');
const Stream = require('stream');
// node >= v16 :
// const { pipeline } = require('stream/promises');
// node < 16 :
const Util = require('util');
const pipeline = Util.promisify(Stream.pipeline);

// export just to illustrate module usage
module.exports = async function runExample(manager, connName) {

  const date = new Date();
  /** @type {typedefs.SQLERExecResults[]} */
  const rtn = new Array(2);

  /** @type {typedefs.SQLERTransaction} */
  let tx;
  try {
    // start a transaction
    tx = await manager.db[connName].beginTransaction();

    // Insert rows (implicit transactions)
    rtn[0] = await manager.db[connName].create.table1.rows({
      name: 'TX Table 1 (ROWS CREATE)', // name is optional
      autoCommit: false, // transaction needs to span the INSERT and LOB/stream
      transactionId: tx.id, // ensure execution takes place within transaction
      binds: {
        // illustrates the use of Oracle specific binds
        // (sqler will interpolate "${SOME_NAME}" into "oracledb.SOME_NAME")
        // alt would be "id: 1" and "name: 'TABLE: 1, ROW: 1'"
        id: {
          val: 1,
          type: '${NUMBER}',
          dir: '${BIND_IN}'
        },
        name: {
          val: 'TABLE: 1, ROW: 1, CREATE: "Initial creation"',
          dir: '${BIND_INOUT}',
          maxSize: 500
        },
        created: date,
        updated: date
      }
    });
    rtn[1] = await manager.db[connName].create.table2.rows({
      name: 'TX Table 2 (ROWS CREATE)', // name is optional
      autoCommit: false, // transaction needs to span the INSERT and pipe()
      transactionId: tx.id, // ensure execution takes place within transaction
      binds: {
        id2: 1,
        name2: 'TABLE: 2, ROW: 1, CREATE: "Initial creation"',
        // tell Oracle that a LOB is inbound - SQL using "RETURNING INTO"
        // (for small files, contents can be directly set on report2)
        report2: { type: '${CLOB}', dir: '${BIND_OUT}' },
        created2: date,
        updated2: date
      }
    });

    // wait until inbound streaming of report2 LOB has been completed
    await streamFromFileLOB(rtn[1], 'report2', './test/files/audit-report.png');

    // commit the transaction
    await tx.commit(true); // true to release the connection back to the pool
  } catch (err) {
    if (tx) {
      // rollback the transaction
      await tx.rollback(true); // true to release the connection back to the pool
    }
    throw err;
  }

  return rtn;
};

/**
 * Streams a LOB from a file path into an `oracledb.Lob` instance
 * @param {typedefs.SQLERExecResults} rslt The `sqler` results that contains the Oracle
 * `rslt.raw.outBinds`
 * @param {String} name The inbound LOB parameter name that will be streamed
 * @param {String} pathToLOB The LOB file path to stream
 * @param {String} [encoding=utf8] The optional encoding to read the file as
 * @returns {typedefs.SQLERExecResults} The passed results
 */
async function streamFromFileLOB(rslt, name, pathToLOB, encoding = 'utf8') {
  return new Promise((resolve, reject) => {
    // raw Oracle "outBinds" should contain the bind parameter name
    if (!rslt.raw.outBinds || !rslt.raw.outBinds[name] || !rslt.raw.outBinds[name][0]) {
      reject(new Error(`Missing RETURNING INTO statement for LOB streaming SQL?`));
      return;
    }
    // for "type: '${CLOB}', dir: '${BIND_OUT}'", Oracle returns a stream
    const lob = rslt.raw.outBinds[name][0];
    await pipeline(
      Fs.createReadStream(pathToLOB, encoding),
      lob
    );
    // lob.on('error', async (err) => reject(err));
    // lob.on('finish', async () => resolve(rslt));
    // let stream;
    // try {
    //   stream = Fs.createReadStream(pathToLOB, 'utf8');
    // } catch (err) {
    //   reject(err);
    //   return;
    // }
    // stream.on('error', async (err) => reject(err));
    // // copy the file contents to the LOB
    // stream.pipe(lob);
  });
}