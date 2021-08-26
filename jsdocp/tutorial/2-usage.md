### 💡 [Oracle](https://www.oracle.com/database/)/[Oracle XE (__FREE__ Express Edition)](https://www.oracle.com/database/technologies/appdev/xe.html) Examples ([see testing](https://github.com/ugate/repo/tree/master/oracle#readme)):

#### Examples:<sub id="examples"></sub>

The examples below use the following setup:

__[Private Options Configuration:](https://ugate.github.io/sqler/typedefs.html#.SQLERPrivateOptions)__ (appended to the subsequent connection options)
```jsdocp ./test/fixtures/priv.json
```

__[Connection Options Configuration:](global.html#OracleConnectionOptions)__
```jsdocp ./test/fixtures/oracle/conf.json
```

Test code that illustrates how to use the Oracle database with various examples
```jsdocp ./test/fixtures/run-example.js
```

<!-- __Create Database:__<ins id="create_db"></ins>

```jsdocp ./test/db/oracle/setup/create.database.sql
-- db/oracle/setup/create.database.sql
```

```jsdocp ./test/lib/oracle/setup/create.database.js
``` -->

__Create Table(s):__<ins id="create_tables"></ins>

```jsdocp ./test/db/oracle/setup/create.table1.sql
-- db/oracle/setup/create.table1.sql
```
```jsdocp ./test/db/oracle/setup/create.table2.sql
-- db/oracle/setup/create.table2.sql
```

```jsdocp ./test/lib/oracle/setup/create.tables.js
```

__Create Rows:__<ins id="create"></ins>

```jsdocp ./test/db/oracle/create.table1.rows.sql
-- db/oracle/create.table1.rows.sql
```
```jsdocp ./test/db/oracle/create.table2.rows.sql
-- db/oracle/create.table2.rows.sql
```

```jsdocp ./test/lib/oracle/create.table.rows.js
```

__Read Rows:__<ins id="read"></ins>

```jsdocp ./test/db/oracle/read.table1.rows.sql
-- db/oracle/read.table1.rows.sql
```

```jsdocp ./test/db/oracle/read.table2.rows.sql
-- db/oracle/read.table2.rows.sql
```

```jsdocp ./test/lib/oracle/read.table.rows.js
```

__Update Rows:__<ins id="update"></ins>

```jsdocp ./test/db/oracle/update.table1.rows.sql
-- db/oracle/update.table1.rows.sql
```
```jsdocp ./test/db/oracle/update.table2.rows.sql
-- db/oracle/update.table2.rows.sql
```

```jsdocp ./test/lib/oracle/update.table.rows.js
```

__Delete Rows:__<ins id="delete"></ins>

```jsdocp ./test/db/oracle/delete.table1.rows.sql
-- db/oracle/delete.table1.rows.sql
```
```jsdocp ./test/db/oracle/delete.table2.rows.sql
-- db/oracle/delete.table2.rows.sql
```

```jsdocp ./test/lib/oracle/delete.table.rows.js
```

__Create Rows (streaming using the same SQL as the [prior create rows example](#create)):__<ins id="create_stream"></ins>

```jsdocp ./test/lib/oracle/create.stream.table.rows.js
```

__Read Rows (streaming using the same SQL as the [prior read rows example](#read)):__<ins id="read_stream"></ins>

```jsdocp ./test/lib/oracle/read.stream.table.rows.js
```

__Update Rows (streaming using the same SQL as the [prior update rows example](#update)):__<ins id="update_stream"></ins>

```jsdocp ./test/lib/oracle/update.stream.table.rows.js
```

__Delete Rows (streaming using the same SQL as the [prior delete rows example](#delete)):__<ins id="delete_stream"></ins>

```jsdocp ./test/lib/oracle/delete.stream.table.rows.js
```

<!-- __Delete Database:__<ins id="delete_db"></ins>

```jsdocp ./test/db/oracle/setup/delete.database.sql
-- db/oracle/setup/delete.database.sql
```

```jsdocp ./test/lib/oracle/setup/delete.database.js
``` -->