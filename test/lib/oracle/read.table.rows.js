'use strict';

const typedefs = require('sqler/typedefs');
const Os = require('os');
const Fs = require('fs');

// export just to illustrate module usage
module.exports = async function runExample(manager, connName) {
  /** @type {typedefs.SQLERExecResults[]} */
  const rtn = new Array(2);

  /** @type {typedefs.SQLERTransaction} */
  let tx;
  try {
    // start a transaction (needed to keep LOB stream open)
    tx = await manager.db[connName].beginTransaction();

    // read from multiple tables
    rtn[0] = manager.db[connName].read.table1.rows({ binds: { name: 'table' } });
    rtn[1] = manager.db[connName].read.table2.rows({
      autoCommit: false, // transaction needs to span the life of the LOB stream
      transactionId: tx.id, // ensure execution takes place within transaction
      binds: { name: 'table' }
    });
    rtn[0] = await rtn[0];
    rtn[1] = await rtn[1];

    // write report to file?
    const writeProms = [];
    for (let row of rtn[1].rows) {
      if (row.report) {
        // store the path to the report (illustrative purposes only)
        row.reportPath = `${Os.tmpdir()}/sqler-${connName}-read-${row.id}.png`;
        writeProms.push(streamLobToFile(row.report, row.reportPath));
      }
    }
    if (writeProms.length) {
      await Promise.all(writeProms);
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

  return { rows: [ ...rtn[0].rows, ...rtn[1].rows ] };
};

/**
 * Streams a LOB `oracledb.Lob` instance into a file
 * @param {Object} lob The outbound LOB parameter name that will be streamed
 * @param {String} pathToLOB The LOB file path to stream
 * @returns {Promise} The LOB to file promise
 */
 function streamLobToFile(lob, pathToLOB) {
  return new Promise((resolve, reject) => {
    const writeStream = Fs.createWriteStream(pathToLOB);
    writeStream.on('error', (err) => lob.destroy(err));
    lob.on('close', () => resolve());
    lob.on('end', () => lob.destroy());
    lob.on('error', (err) => reject(err));
    lob.pipe(writeStream);
  });
}