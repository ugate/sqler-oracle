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

  // read from multiple tables
  const rslt = await manager.db[connName].read.table.rows({
    stream: 1, // indicate reads will be streamed
    binds: { name: 'stream' }
  });

  // stream all reads to a central JSON file (illustrative purposes only)
  rslt.jsonFile = `${Os.tmpdir()}/sqler-${connName}-read-stream-all.json`;

  // write binary report buffer to file?
  const fileWriteProms = [];
  for (let readStream of rslt.rows) {
    // read stream is MDB implementation:
    // https://mariadb.com/kb/en/connector-nodejs-promise-api/#connectionquerystreamsql-values-emitter
    await pipeline(
      readStream,
      new Stream.Transform({
        objectMode: true,
        transform: function transformer(chunk, encoding, callback) {
          if (Buffer.isBuffer(chunk.report)) {
            // transform and store the path to the report (illustrative purposes only)
            chunk.reportPath = `${Os.tmpdir()}/sqler-${connName}-read-${chunk.id}.png`;
            fileWriteProms.push(Fs.promises.writeFile(chunk.reportPath, chunk.report));
            // don't include the report Buffer in the JSON since there should be a file
            delete chunk.report;
          }
          callback(null, chunk);
        }
      }),
      // add a transform that formats the JSON into an array string suitable for file write
      async function* transformStringify(chunksAsync) {
        yield '[';
        let cnt = -1;
        for await (const chunk of chunksAsync) {
          cnt++;
          yield `${cnt ? ',' : ''}${JSON.stringify(chunk)}`;
        }
        yield ']';
      },
      Fs.createWriteStream(rslt.jsonFile)
    );
  }
  if (fileWriteProms.length) {
    await Promise.all(fileWriteProms);
  }

  return rslt;
};