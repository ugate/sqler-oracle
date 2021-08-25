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
        report2: null
      },
      {
        id2: 200, name2: 'TABLE: 2, ROW: 2, CREATE_STREAM: "Initial creation"', created2: date, updated2: date,
        // tell Oracle that a LOB is inbound - SQL using "RETURNING INTO"
        // (for small files, contents can be directly set on report2)
        report2: null
      },
    ]
  ];
  // since table2 is using oracledb.BIND_OUT for streaming column data,
  // there needs to be a bind definitions set on "driverOptions.exec"
  // https://oracle.github.io/node-oracledb/doc/api.html#-42733-binddefs
  // https://oracle.github.io/node-oracledb/doc/api.html#-313-node-oracledb-type-constants
  const driverOptsArray = [
    {
      exec: {
        dmlRowCounts: true // output of the number of rows affected by each input data record
      }
    },
    {
      exec: {
        dmlRowCounts: true, // output of the number of rows affected by each input data record
        bindDefs: {
          id2: { type: '${NUMBER}' },
          name2: { type: '${STRING}', maxSize: 512 },
          created2: { type: '${DATE}' },
          updated2: { type: '${DATE}' },
          report2: { type: '${CLOB}', dir: '${BIND_OUT}' }
        }
      }
    }
  ];
  // write column stream file would typically be from different files
  const reportsArray = [
    './test/files/audit-report.png',
    './test/files/audit-report.png'
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
        driverOptions: driverOptsArray[ti]
        // no need to set execOpts.binds since they will be streamed from the create instead
      });

      let proms = ti ? new Array(rslts[ti].rows.length) : null;
      for (let writeStream of rslts[ti].rows) {
        // when the batched results come in, stream the lob into the report
        if (ti) {
          writeStream.on(typedefs.EVENT_STREAM_BATCH, async (batch) => {
            for (let rslt of batch) {
              proms.push(streamColumnLobFromFile(rslt, 'report2', reportsArray));
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
 * @param {(String | String[])} pathsToLOB The LOB file path(s) to stream
 * @param {String} [encoding=utf8] The encoding to use when streaming/reading the file 
 * @returns {typedefs.SQLERExecResults} The passed results
 */
async function streamColumnLobFromFile(rslt, name, pathsToLOB, encoding = 'binary') {
  return new Promise((resolve, reject) => {
    const outs = Array.isArray(rslt.outBinds) ? rslt.outBinds : [ rslt.outBinds ];
    const pths = Array.isArray(pathsToLOB) ? pathsToLOB : [ pathsToLOB ];
    let oi = 0, finishCount = 0;
    for (let out of outs) {
      // raw Oracle "outBinds" should contain the bind parameter name
      if (!out || !out[name] || !out[name][0]) {
        reject(new Error(`Missing RETURNING INTO statement for LOB streaming SQL for "${name}"?`));
        return;
      }
      // for "type: '${CLOB}', dir: '${BIND_OUT}'", Oracle returns a stream
      const lob = out[name][0];
      lob.on('error', async (err) => reject(err));
      lob.on('finish', async () => {
        finishCount++;
        if (finishCount >= outs.length) {
          resolve(rslt);
        }
      });
      let stream;
      try {
        stream = Fs.createReadStream(pths[oi], encoding);
      } catch (err) {
        reject(err);
        return;
      }
      stream.on('error', async (err) => reject(err));
      // copy the file contents to the LOB
      stream.pipe(lob);
      oi++;
    }
  });
}