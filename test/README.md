### Testing
Tests are conducted using a _lightweight_ version of the Oracle DB called [Oracle XE (Xpress Edition)](https://www.oracle.com/database/technologies/appdev/xe.html).

#### Oracle XE (locally)
If Oracle XE is already installed or performed via the [installation instructions provided by Oracle](https://www.oracle.com/database/technologies/appdev/xe/quickstart.html), all that remains is that the proper aceess is granted to the default `XE` database for the login used for testing:

```sh
#!/bin/sh -e

"$ORACLE_HOME/bin/sqlplus" -L -S / AS SYSDBA <<SQL
CREATE USER travis IDENTIFIED BY travis;
GRANT CONNECT, RESOURCE TO travis;
GRANT EXECUTE ON SYS.DBMS_LOCK TO travis;
SQL
```

#### Oracle XE (CI)
Refer to [Testing with Oracle XE](https://github.com/ugate/repo/tree/master/oracle#readme) for documentation.