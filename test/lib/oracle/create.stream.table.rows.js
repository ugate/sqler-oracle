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

  // The driver module currently doesn't support streaming into a column
  // (e.g. Fs.createReadStream())
  // const report = await Fs.promises.readFile('./test/files/audit-report.png');

  const bindsArray = [
    [
      {
        id: 100, name: 'TABLE: 1, ROW: 1, CREATE_STREAM: "Initial creation"', created: date, updated: date
      },
      {
        id: 200, name: 'TABLE: 1, ROW: 2, CREATE_STREAM: "Initial creation"', created: date, updated: date
      },
    ],
    [
      {
        id2: 100, name2: 'TABLE: 2, ROW: 1, CREATE_STREAM: "Initial creation"', created2: date, updated2: date,
        // tell Oracle that a LOB is inbound - SQL using "RETURNING INTO"
        // (for small files, contents can be directly set on report2)
        report2: { type: '${CLOB}', dir: '${BIND_OUT}' }
      },
      {
        id2: 200, name2: 'TABLE: 2, ROW: 2, CREATE_STREAM: "Initial creation"', created2: date, updated2: date,
        // tell Oracle that a LOB is inbound - SQL using "RETURNING INTO"
        // (for small files, contents can be directly set on report2)
        report2: { type: '${CLOB}', dir: '${BIND_OUT}' }
      },
    ]
  ];
  /** @type {typedefs.SQLERExecResults[]} */
  const rslts = new Array(bindsArray.length);

  /** @type {typedefs.SQLERTransaction} */
  let tx;
  try {
    // start a transaction
    tx = await manager.db[connName].beginTransaction();

    for (let ti = 0; ti < bindsArray.length; ti++) {
      // Insert rows into multiple tables within a single execution
      rslts[ti] = await manager.db[connName].create[`table${ti + 1}`].rows({
        // create binds will be batched in groups of 2 before streaming them to the database since
        // execOpts.stream = 2, but we could have batched them individually (stream = 1) as well
        // https://oracle.github.io/node-oracledb/doc/api.html#-427-connectionexecutemany
        stream: 2,
        autoCommit: false, // transaction needs to span the INSERT and pipe()
        transactionId: tx.id, // ensure execution takes place within transaction
        // no need to set execOpts.binds since they will be streamed from the create instead
      });

      let proms = ti ? new Array(rslts[ti].rows.length) : null;
      for (let writeStream of rslts[ti].rows) {
        // when the batched results come in, stream the lob into the report
        if (ti) {
          writeStream.on(typedefs.EVENT_STREAM_BATCH, async (batch) => {
            for (let rslt of batch) {
              proms.push(streamFromFileLOB(rslt, 'report2', './test/files/audit-report.png'));
            }
          });
        }

        await pipeline(
          // here we're just using some static values for illustration purposes, but they can come from a
          // any readable stream source like a file, database, etc. as long as they are "transformed"
          // into JSON binds before the sqler writable stream receives them
          Stream.Readable.from(bindsArray[ti]),
          writeStream
        );

        if (proms && proms.length) {
          // wait until inbound streaming of report2 LOB has been completed
          await Promise.all(proms);
        }
      }
    }

    // commit the transaction
    await tx.commit(true); // true to release the connection back to the pool
  } catch (err) {
    if (tx) {
      // rollback the transaction
      await tx.rollback(true); // true to release the connection back to the pool
    }
    throw err;
  }

  return rslts;
};

/**
 * Streams a LOB from a file path into an `oracledb.Lob` instance
 * @param {typedefs.SQLERExecResults} rslt The `sqler` results that contains the Oracle
 * `rslt.raw.outBinds`
 * @param {String} name The inbound LOB parameter name that will be streamed
 * @param {String} pathToLOB The LOB file path to stream
 * @returns {typedefs.SQLERExecResults} The passed results
 */
async function streamFromFileLOB(rslt, name, pathToLOB) {
  return new Promise((resolve, reject) => {
    // raw Oracle "outBinds" should contain the bind parameter name
    if (!rslt.outBinds || !rslt.outBinds[name] || !rslt.outBinds[name][0]) {
      reject(new Error(`Missing RETURNING INTO statement for LOB streaming SQL?`));
      return;
    }
    // for "type: '${CLOB}', dir: '${BIND_OUT}'", Oracle returns a stream
    const lob = rslt.outBinds[name][0];
    lob.on('error', async (err) => reject(err));
    lob.on('finish', async () => resolve(rslt));
    let stream;
    try {
      stream = Fs.createReadStream(pathToLOB, 'utf8');
    } catch (err) {
      reject(err);
      return;
    }
    stream.on('error', async (err) => reject(err));
    // copy the file contents to the LOB
    stream.pipe(lob);
  });
}