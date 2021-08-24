'use strict';

const typedefs = require('sqler/typedefs');
const Stream = require('stream');
// node >= v16 :
// const { pipeline } = require('stream/promises');
// node < 16 :
const Util = require('util');
const pipeline = Util.promisify(Stream.pipeline);

// export just to illustrate module usage
module.exports = async function runExample(manager, connName) {

  const date = new Date();

  // binds
  const table1Binds = {
    id: 400, name: 'Error test after commit', updated: date
  };
  const rtn = {};

  try {
    await explicitTransactionUpdate(manager, connName, rtn, table1Binds);
  } catch (err) {
    if (err instanceof ExpectedError) throw err;
    console.error('Failed to throw the expected error', err);
  }

  return rtn;
};

async function explicitTransactionUpdate(manager, connName, rtn, binds) {
  /** @type {typedefs.SQLERTransaction} */
  const tx = await manager.db[connName].beginTransaction();

  // don't exceed connection pool count
  rtn.txExpRslts = await manager.db[connName].update.table1.rows({
    autoCommit: true,
    transactionId: tx.id,
    stream: 1
    // no need to set execOpts.binds since they will be streamed from the update instead
  });

  for (let writeStream of rtn.txExpRslts.rows) {
    writeStream.on(typedefs.EVENT_STREAM_COMMIT, (txId) => {
      throw new ExpectedError(`Testing transaction error for transaction: ${txId}`);
    });
    writeStream.on(typedefs.EVENT_STREAM_ROLLBACK, (txId) => {
      throw new UnExpectedError(`Should not have rolled back transaction "${txId}" since it should have already been committed!`);
    });
    writeStream.on('error', async (err) => {
      if (err instanceof ExpectedError) {
        await Promise.reject(err);
      }
    });
    writeStream.on('end', async () => {
      // rollback and release the connection
      await tx.rollback(true);
    });
    await pipeline(
      Stream.Readable.from([binds]),
      writeStream
    );
  }
}

class ExpectedError extends Error {
}

class UnExpectedError extends Error {
}