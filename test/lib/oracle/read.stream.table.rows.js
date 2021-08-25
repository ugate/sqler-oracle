'use strict';

const typedefs = require('sqler/typedefs');
const Os = require('os');
const Fs = require('fs');
const Stream = require('stream');
// node >= v16 :
// const { pipeline } = require('stream/promises');
// node < 16 :
const Util = require('util');
const pipeline = Util.promisify(Stream.pipeline);

// export just to illustrate module usage
module.exports = async function runExample(manager, connName) {

  /** @type {typedefs.SQLERExecResults[]} */
  const rtn = new Array(2);

  /** @type {typedefs.SQLERTransaction} */
  let tx;
  try {
    // start a transaction (needed to keep LOB stream open)
    tx = await manager.db[connName].beginTransaction();

    // stream all reads to a central JSON file (illustrative purposes only)
    rtn.jsonFile = `${Os.tmpdir()}/sqler-${connName}-read-stream-all.json`;

    let count = 0;
    for (let ti = 0; ti < rtn.length; ti++) {
      // read from multiple tables
      rtn[ti] = await manager.db[connName].read[`table${ti + 1}`].rows({
        stream: 1, // indicate reads will be streamed
        binds: { name: 'stream' }
      });

      // write binary report buffer to file?
      for (let readStream of rtn[ti].rows) {
        // read stream is Oracle implementation:
        // https://oracle.github.io/node-oracledb/doc/api.html#querystream
        await pipeline(
          readStream,
          new Stream.Transform({
            objectMode: true,
            transform: async function transformer(chunk, encoding, callback) {
              try {
                count++;
                if (chunk.report instanceof Stream.Readable) {
                  await streamLobToFile(connName, chunk.report, chunk);
                }
                callback(null, chunk);
              } catch (err) {
                callback(err, chunk);
              }
            }
          }),
          // add a transform that formats the JSON into an array string suitable for file write
          async function* transformStringify(chunksAsync) {
            yield `${ti ? ',' : '['}`;
            let cnt = -1;
            for await (const chunk of chunksAsync) {
              cnt++;
              yield `${cnt ? ',' : ''}${JSON.stringify(chunk)}`;
            }
            yield `${ti && cnt ? ']' : ''}`;
          },
          Fs.createWriteStream(rtn.jsonFile, { flags: ti ? 'a' : 'w' })
        );
      }
      
      // when nothing is written make sure the JSON file is empty (illustrative purposes only)
      if (!count) {
        Fs.promises.writeFile(rtn.jsonFile, '[]');
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

  return { rows: [ ...rtn[0].rows, ...rtn[1].rows ], jsonFile: rtn.jsonFile };
};

/**
 * Streams a LOB `oracledb.Lob` instance into a file
 * @param {String} connName The connection name that will be included in the written file name
 * @param {Object} lob The outbound LOB parameter name that will be streamed
 * @param {Object} chunk The LOB owning object
 * @returns {Promise} The LOB to file promise
 */
function streamLobToFile(connName, lob, chunk) {
  return new Promise((resolve, reject) => {
    // don't include the report in the JSON since there should be a file
    delete chunk.report;
    // stream the report into a file (illustrative purposes only)
    chunk.reportPath = `${Os.tmpdir()}/sqler-${connName}-read-${chunk.id}.png`;
    const writeStream = Fs.createWriteStream(chunk.reportPath);
    writeStream.on('error', (err) => lob.destroy(err));
    lob.on('close', () => resolve());
    lob.on('end', () => lob.destroy());
    lob.on('error', (err) => reject(err));
    lob.pipe(writeStream);
  });
}