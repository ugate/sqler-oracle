### Testing
Testing is conducted under a _lightweight_ version of the Oracle DB called [Oracle XE](https://www.oracle.com/database/technologies/appdev/xe.html). When running locally follow the Oracle installation guidelines.

### CI
[`travis-ci`](https://travis-ci.com/) integration will automatically install Oracle XE localy before CI testing (see `.travis.yml` for more details). Special `env` values are automatically set for `oracledb` path resolution set when auto executing the provided `./test/pkg/install.sh`. In order to use the provided installer each person using the test suite must accept the [OTN License Agreement for Oracle Database Express Edition](https://www.oracle.com/downloads/licenses/database-11g-express-license.html). The following setup is conducted:

- __Host:__ `localhost:1521`
- __Username:__ `travis`
- __Password:__ `travis`

For the __SYSDBA__ role access:

- __Host:__ `localhost:1521`
- __Username:__ `sys`
- __Password:__ `travis`

### Troubleshooting
In some older versions of Oracle XE you may run into an __ORA-12505__ when connecting to the DB due to `listener.ora` missing `SID_DESC` for __XE__. To resolve this issue ensure that `listener.ora` (under the Oracle XE install directory) contains something similar to the following and restart the `OracleXETNSListener` service:
Look 
```tns
SID_LIST_LISTENER =
  (SID_LIST =
    (SID_DESC =
       (SID_NAME = XE)
       (ORACLE_HOME = C:\oraclexe\app\oracle\product\11.2.0\server)
     )
    (SID_DESC =
      (SID_NAME = PLSExtProc)
      (ORACLE_HOME = C:\oraclexe\app\oracle\product\11.2.0\server)
      (PROGRAM = extproc)
    )
    (SID_DESC =
      (SID_NAME = CLRExtProc)
      (ORACLE_HOME = C:\oraclexe\app\oracle\product\11.2.0\server)
      (PROGRAM = extproc)
    )
  )
LISTENER =
  (DESCRIPTION_LIST =
    (DESCRIPTION =
      (ADDRESS = (PROTOCOL = IPC)(KEY = EXTPROC1))
      (ADDRESS = (PROTOCOL = TCP)(HOST = 127.0.0.1)(PORT = 1521))
    )
  )
DEFAULT_SERVICE_LISTENER = (XE)
```