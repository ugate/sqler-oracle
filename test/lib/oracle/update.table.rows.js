'use strict';

const typedefs = require('sqler/typedefs');

// export just to illustrate module usage
module.exports = async function runExample(manager, connName) {

  const date = new Date();

  // binds
  const table1BindsArray = [
    {
      id: 1, name: '', updated: date
    }
  ];
  const table2BindsArray = [
    {
      id2: 1, name2: '', updated2: date
    }
  ];
  const rtn = {};

  //-------------------------------------------------------
  // There are two different ways to perform a transaction
  // 1. Implicit (suitable for a single execution per tx)
  // 2. Explicit (suitable for multiple executions per tx)

  //-------------------------------------------------------
  // There are two different ways to perform a transaction
  // 1. Implicit (suitable for a single execution per tx)
  // 2. Explicit (suitable for multiple executions per tx)

  // using implicit transactions:
  await implicitTransactionUpdate(manager, connName, rtn, table1BindsArray, table2BindsArray);

  // Using an explicit transaction:
  await explicitTransactionUpdate(manager, connName, rtn, table1BindsArray, table2BindsArray);

  // Using a prepared statement:
  await preparedStatementUpdate(manager, connName, rtn, table1BindsArray, table2BindsArray);

  // Using a prepared statement within an explicit transaction
  await preparedStatementExplicitTxUpdate(manager, connName, rtn, table1BindsArray, table2BindsArray);

  return rtn;
};

async function implicitTransactionUpdate(manager, connName, rtn, table1BindsArray, table2BindsArray) {
  // returned results for both tables
  rtn.txImpRslts = new Array(table1BindsArray.length + table2BindsArray.length);

  // simple iterator over all the binds
  forEach('UPDATE', 'Implicit transaction', table1BindsArray, table2BindsArray, (idx, ti, ri, binds, nameProp) => {

    // Example concurrent execution using an implicit transaction for
    // each SQL execution (autoCommit = true is the default)
    rtn.txImpRslts[idx] = manager.db[connName].update[`table${ti + 1}`].rows({
      name: binds[nameProp], // execution name is optional
      binds
    });

  });

  // could have also ran is series by awaiting when the SQL function is called
  for (let i = 0; i < rtn.txImpRslts.length; i++) {
    rtn.txImpRslts[i] = await rtn.txImpRslts[i];
  }
}

async function explicitTransactionUpdate(manager, connName, rtn, table1BindsArray, table2BindsArray) {
  // returned results for both tables
  rtn.txExpRslts = new Array(table1BindsArray.length + table2BindsArray.length);
  /** @type {typedefs.SQLERTransaction} */
  let tx;
  try {
    // start a transaction
    tx = await manager.db[connName].beginTransaction();

    // simple iterator over all the binds
    forEach('UPDATE_TX', 'Explicit transaction', table1BindsArray, table2BindsArray, (idx, ti, ri, binds, nameProp) => {

      // Example concurrent execution (same transacion)
      rtn.txExpRslts[idx] = manager.db[connName].update[`table${ti + 1}`].rows({
        name: binds[nameProp], // execution name is optional
        binds,
        autoCommit: false,
        transactionId: tx.id, // ensure execution takes place within transaction
      });

    });
  
    // could have also ran is series by awaiting when the SQL function is called
    for (let i = 0; i < rtn.txExpRslts.length; i++) {
      rtn.txExpRslts[i] = await rtn.txExpRslts[i];
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
}

// NOTE: Prepared statements are a noop since Oracle implements the concept of statement caching instead
// See https://oracle.github.io/node-oracledb/doc/api.html#-313-statement-caching
// Example just for illustration of consistent sqler API functionality
async function preparedStatementUpdate(manager, connName, rtn, table1BindsArray, table2BindsArray) {
  // need to keep track of at least one result for each table so that unprepare can be called on each
  // (could call unprepare using any of the returned execution results for each table)
  let psRsltIndexTable1 = 0, psRsltIndexTable2;
  // returned results for both tables
  rtn.psRslts = new Array(table1BindsArray.length + table2BindsArray.length);
  try {

    // simple iterator over all the binds
    forEach('UPDATE_PS', 'Prepred statement', table1BindsArray, table2BindsArray, (idx, ti, ri, binds, nameProp) => {

      // Example concurrent execution (same transacion)
      rtn.psRslts[idx] = manager.db[connName].update[`table${ti + 1}`].rows({
        name: binds[nameProp], // execution name is optional
        // flag the SQL execution as a prepared statement
        prepareStatement: true,
        // include the bind parameters
        binds
      });

      // need to keep track of at least one result for each table so that unprepare can be called on each
      if (ti && !psRsltIndexTable2) psRsltIndexTable2 = ti;

    });

    // wait for concurrent executions to complete
    for (let i = 0; i < rtn.psRslts.length; i++) {
      rtn.psRslts[i] = await rtn.psRslts[i];
    }
  } finally {
    // since prepareStatement = true, we need to close the statement
    // and release the prepared statement connection back to the pool
    // (also drops the temporary stored procedure that executes the prepared statement)
    const proms = [];
    if (rtn.psRslts[psRsltIndexTable1]) proms.push(rtn.psRslts[psRsltIndexTable1].unprepare());
    if (rtn.psRslts[psRsltIndexTable2]) proms.push(rtn.psRslts[psRsltIndexTable2].unprepare());
    if (proms.length) await Promise.all(proms);
  }
}

// NOTE: Prepared statements are a noop since Oracle implements the concept of statement caching instead
// See https://oracle.github.io/node-oracledb/doc/api.html#-313-statement-caching
// Example just for illustration of consistent sqler API functionality
async function preparedStatementExplicitTxUpdate(manager, connName, rtn, table1BindsArray, table2BindsArray) {
  // returned results for both tables
  rtn.txExpPsRslts = new Array(table1BindsArray.length + table2BindsArray.length);
  /** @type {typedefs.SQLERTransaction} */
  let tx;
  try {
    // start a transaction
    tx = await manager.db[connName].beginTransaction();

    // simple iterator over all the binds
    forEach('UPDATE_PS_TX', `Prepred statement with txId ${tx.id}`, table1BindsArray, table2BindsArray, (idx, ti, ri, binds, nameProp) => {

      // Example execution in concurrent (same transacion)
      rtn.txExpPsRslts[idx] = manager.db[connName].update[`table${ti + 1}`].rows({
        name: binds[nameProp], // execution name is optional
        autoCommit: false, // don't auto-commit after execution
        transactionId: tx.id, // ensure execution takes place within transaction
        prepareStatement: true, // ensure a prepared statement is used
        // include the bind parameters
        binds
      });

    });

    // wait for concurrent executions to complete
    for (let i = 0; i < rtn.txExpPsRslts.length; i++) {
      rtn.txExpPsRslts[i] = await rtn.txExpPsRslts[i];
    }

    // unprepare will be called when calling commit
    // (alt, could have called unprepare before commit)
    await tx.commit(true); // true to release the connection back to the pool
  } catch (err) {
    if (tx) {
      // unprepare will be called when calling rollback
      // (alt, could have called unprepare before rollback)
      await tx.rollback(true); // true to release the connection back to the pool
    }
    throw err;
  }
}

// just a utility function to iterate over muliple bind arrays and update bind names
function forEach(name, label, table1BindsArray, table2BindsArray, itemHandler) {
  const ln = table1BindsArray.length + table2BindsArray.length;
  for (let i = 0, ti, ri, barr, nameProp; i < ln; i++) {
    // select which table the binds are for
    if (i < table1BindsArray.length) {
      ti = 0;
      ri = i;
      barr = table1BindsArray;
    } else {
      ti = 1;
      ri = i - table1BindsArray.length;
      barr = table2BindsArray;
    }
    nameProp = `name${ti ? ti + 1 : ''}`;

    // update with expanded name
    barr[ri][nameProp] = `TABLE: ${ti + 1}, ROW: ${ri + 1}, ${name}: "${label} ${i + 1}"`;

    itemHandler(i, ti, ri, barr[ri], nameProp);
  }
}