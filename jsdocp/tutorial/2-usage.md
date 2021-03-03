### 💡 [Oracle](https://www.oracle.com/database/)/[Oracle XE (__FREE__ Express Edition)](https://www.oracle.com/database/technologies/appdev/xe.html) Examples ([see testing](https://github.com/ugate/repo/tree/master/oracle#readme)):

#### Examples:<sub id="examples"></sub>

The examples below use the following setup:

__[Private Options Configuration:](https://ugate.github.io/sqler/Manager.html#SQLERPrivateOptions)__ (appended to the subsequent connection options)
```jsdocp ./test/fixtures/priv.json
```

__[Connection Options Configuration:](global.html#OracleConnectionOptions)__
```jsdocp ./test/fixtures/oracle/conf.json
```

Test code that illustrates how to use the Oracle database with various examples
```jsdocp ./test/fixtures/run-example.js
```

__Create Table(s):__

```jsdocp ./test/db/oracle/setup/create.table1.sql
-- db/oracle/setup/create.table1.sql
```
```jsdocp ./test/db/oracle/setup/create.table2.sql
-- db/oracle/setup/create.table2.sql
```

```jsdocp ./test/lib/oracle/setup/create.tables.js
```

__Create Rows:__

```jsdocp ./test/db/oracle/create.table1.rows.sql
-- db/oracle/create.table1.rows.sql
```
```jsdocp ./test/db/oracle/create.table2.rows.sql
-- db/oracle/create.table2.rows.sql
```

```jsdocp ./test/lib/oracle/create.table.rows.js
```

__Read Rows:__

```jsdocp ./test/db/oracle/read.table.rows.sql
-- db/oracle/read.table.rows.sql
```

```jsdocp ./test/lib/oracle/read.table.rows.js
```

__Update Rows:__

```jsdocp ./test/db/oracle/update.table1.rows.sql
-- db/oracle/update.table1.rows.sql
```
```jsdocp ./test/db/oracle/update.table2.rows.sql
-- db/oracle/update.table2.rows.sql
```

```jsdocp ./test/lib/oracle/update.table.rows.js
```

__Delete Rows:__

```jsdocp ./test/db/oracle/delete.table1.rows.sql
-- db/oracle/delete.table1.rows.sql
```
```jsdocp ./test/db/oracle/delete.table2.rows.sql
-- db/oracle/delete.table2.rows.sql
```

```jsdocp ./test/lib/oracle/delete.table.rows.js
```

__Delete Tables:__

```jsdocp ./test/db/oracle/setup/delete.table1.sql
-- db/oracle/setup/delete.table1.sql
```
```jsdocp ./test/db/oracle/setup/delete.table2.sql
-- db/oracle/setup/delete.table2.sql
```

```jsdocp ./test/lib/oracle/setup/delete.tables.js
```