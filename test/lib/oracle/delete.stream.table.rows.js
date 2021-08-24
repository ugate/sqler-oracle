'use strict';

const Stream = require('stream');
// node >= v16 :
// const { pipeline } = require('stream/promises');
// node < 16 :
const Util = require('util');
const pipeline = Util.promisify(Stream.pipeline);

// export just to illustrate module usage
module.exports = async function runExample(manager, connName) {

  // Delete rows from multiple tables within a single execution
  const rslts = await manager.db[connName].delete.table.rows({
    // delete binds will be batched in groups of 2 before streaming them to the database since
    // execOpts.stream = 2, but we could have batched them individually (stream = 1) as well
    // https://mariadb.com/kb/en/connector-nodejs-promise-api/#connectionbatchsql-values-promise
    stream: 2
    // no need to set execOpts.binds since they will be streamed from the delete instead
  });

  for (let writeStream of rslts.rows) {
    await pipeline(
      // here we're just using some static values for illustration purposes, but they can come from a
      // any readable stream source like a file, database, etc. as long as they are "transformed"
      // into JSON binds before the sqler writable stream receives them
      Stream.Readable.from([
        {
          id: 100, id2: 100
        },
        {
          id: 200, id2: 200
        }
      ]),
      writeStream
    )
  }

  return rslts;
};