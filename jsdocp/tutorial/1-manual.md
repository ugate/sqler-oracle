#### ⚙️ Setup &amp; Configuration <sub id="conf"></sub>:

> __Most of documentation pertaining to general configuration for `sqler-oracle` can be found in the [`sqler` manual](https://ugate.github.io/sqler).__

The following modules versions are required when using `sqler-oracle`:
```jsdocp ./package.json @~ devDependencies.sqler @~ devDependencies.oracledb
```

Install the required modules:
```sh
npm install sqler
npm install sqler-oracle
npm install oracledb
```

Connection and execution option extensions can be found under the API docs for [globals](global.html).

#### 💡 Examples<sub id="examples"></sub>:

The examples below use the follwing setup:
```js
const dialect = 'oracle', dialectModule = `sqler-${dialect}`;
const { Manager } = require('sqler');
const conf = {
  "univ": {
    "db": {
      "myId": {
        "host": "myhost.example.com",
        "username": "myusername",
        "password": "mypassword"
      }
    }
  },
  "db": {
    "dialects": {
      [dialect]: dialectModule
    },
    "connections": [
      {
        "id": "myId",
        "name": "fin",
        "dir": "db/finance",
        "service": "MYSRV",
        // global bind variables for all SQLs on connection
        "binds": {
          "blankDate": "01-jan-1700",
          "dateFormat": "yyyy-mm-dd\"T\"hh24:mi:ss.ff3\"Z\""
        },
        "sql": {
          "dialect": dialect
        }
      }
    ]
  }
};

// see subsequent examples for different examples
const { manager, result } = await runExample(conf);

console.log('Result:', result);

// after we're done using the manager we should close it
process.on('SIGINT', async function sigintDB() {
  await manager.close();
  console.log('Manager has been closed');
});
```

__Simple Read:__
```sql
-- db/finance/read.ap.invoices.sql
SELECT * FROM FIN_INVOICE INV
WHERE INV.AUDIT = :audit
AND INV."YEAR" = :year
```
```js
async function runExample(conf) {
  const mgr = new Manager(conf);
  // initialize connections and set SQL functions
  await mgr.init();

  // execute the SQL statement and capture the results
  const rslt = await mgr.db.fin.read.ap.invoices({
    binds: {
      audit: 'Y',
      year: 1957
      // binds can also contain oracle-specific binding objects
      // that reference oracledb module properties using ${}
      // year: { val: 1957, dir: '${BIND_INOUT}', type: '${NUMBER}' }
    }
  });

  console.log('Invoices:', rslts.rows);

  return { manager: mgr, result: rslt };
}
```

__Inserting a LOB File:__
```sql
-- db/finance/create.annual.report.sql
INSERT INTO FIN_ANNUAL_REPORT (ID, REPORT, CREATED_AT, UPDATED_AT)
VALUES (:id, :report, :created, :updated)
```
```js
async function runExample(conf) {
  const mgr = new Manager(conf);
  // initialize connections and set SQL functions
  await mgr.init();

  // insert CLOB (autCommit = true is the default)
  const rslt = await mgr.db.fin.create.annual.report({
    binds: {
      id: 1,
      report: await Fs.promises.readFile('finance-annual-report.pdf'),
      created: new Date(),
      updated: new Date()
    }
  });

  return { manager: mgr, result: rslt };
}
```

__Inserting a Large LOB File:__
```sql
-- db/finance/create.annual.report.sql
INSERT INTO FIN_ANNUAL_REPORT (ID, REPORT, CREATED_AT, UPDATED_AT)
VALUES (:id, EMPTY_CLOB(), :created, :updated)
RETURNING REPORT INTO :report
```
```js
async function runExample(conf) {
  const mgr = new Manager(conf);
  // initialize connections and set SQL functions
  await mgr.init();

  // begin tranaction
  const txId = await mgr.db.fin.beginTransaction();

  // insert CLOB
  const rslt = await mgr.db.fin.create.annual.report({
    // autoCommit = false is required to allow streaming
    // of LOB data 
    autoCommit: false,
    transactionId: txId,
    binds: {
      id: 1,
      // binds can also contain oracle-specific binding objects
      // that reference oracledb module properties using ${}
      report: { type: '${CLOB}', dir: '${BIND_OUT}' },
      created: new Date(),
      updated: new Date()
    }
  });

  // process the LOB and return/resolve the results
  return new Promise((resolve, reject) => {
    const lob = rslt.raw.outBinds.report[0];
    lob.on('finish', async () => {
      try {
        await rslt.commit();
        resolve({ manager: mgr, result: rslt });
      } catch (err) {
        reject(err);
      }
    });
    lob.on('error', async (err) => {
      try {
        await rslt.rollback();
      } finally {
        reject(err);
      }
    });
    const stream = Fs.createReadStream('finance-annual-report.pdf');
    stream.on('error', async (err) => {
      try {
        await rslt.rollback();
      } finally {
        reject(err);
      }
    });
    // copies the report to the LOB
    stream.pipe(lob);  
  });
}
```

__Reading a LOB and writting to a file:__
```sql
-- db/finance/read.annual.report.sql
SELECT ID AS "id", REPORT AS "report", CREATED_AT AS "createdAt", UPDATED_AT AS "updatedAt"
FROM FIN_ANNUAL_REPORT
```
```js
async function runExample(conf) {
  const mgr = new Manager(conf);
  // initialize connections and set SQL functions
  await mgr.init();

  // read CLOBs
  const rslt = await mgr.db.fin.read.annual.report();

  // write each CLOB to a file
  const writeLobFile = row => {
    row.report.setEncoding('utf8');
    return new Promise((resolve, reject) => {
      const outStrm = Fs.createWriteStream(`finance-annual-report-${row.id}.pdf`);
      row.report.on('error', err => reject(err));
      row.report.on('end', () => resolve());
      row.report.pipe(outStrm);
    });
  };
  if (rslt.rows.length) {
    const proms = new Array(rslt.rows.length);
    let ri = -1;
    for (let row of rslt.rows) {
      proms[++ri] = writeLobFile(row);
    }
    await Promise.all(proms);
  }

  return { manager: mgr, result: rslt };
}
```