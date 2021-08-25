'use strict';

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

  for (let ti = 0; ti < rtn.length; ti++) {
    // Delete rows from multiple tables within a single execution
    rtn[ti] = await manager.db[connName].delete[`table${ti + 1}`].rows({
      // delete binds will be batched in groups of 2 before streaming them to the database since
      // execOpts.stream = 2, but we could have batched them individually (stream = 1) as well
      // https://oracle.github.io/node-oracledb/doc/api.html#executemany
      stream: 2
      // no need to set execOpts.binds since they will be streamed from the delete instead
    });

    for (let writeStream of rtn[ti].rows) {
      await pipeline(
        // here we're just using some static values for illustration purposes, but they can come from a
        // any readable stream source like a file, database, etc. as long as they are "transformed"
        // into JSON binds before the sqler writable stream receives them
        Stream.Readable.from([
          {
            [`id${ti ? 2 : ''}`]: 100
          },
          {
            [`id${ti ? 2 : ''}`]: 200
          }
        ]),
        writeStream
      )
    }
  }

  return rtn;
};