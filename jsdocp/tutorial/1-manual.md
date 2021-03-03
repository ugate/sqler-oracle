### ⚙️ Setup &amp; Configuration <sub id="conf"></sub>:

> __Most of documentation pertaining to general configuration for `sqler-oracle` can be found in the [`sqler` manual](https://ugate.github.io/sqler).__

__Follow the [installation instructions for `oracledb`](https://www.npmjs.com/package/oracledb)__ or use the [`Dockerfile.test`](https://github.com/ugate/sqler-oracle/blob/master/Dockerfile.test) for inspiration.

The following modules versions are required when using `sqler-oracle` for the [Oracle database](https://www.oracle.com/database/) (including the __FREE__ [Oracle XE (Express Edition)](https://www.oracle.com/database/technologies/appdev/xe.html)):
```jsdocp ./package.json @~ devDependencies.sqler @~ devDependencies.oracledb
```

Install the required modules:
```sh
npm install sqler
npm install sqler-oracle
npm install oracledb
```

Connection and execution option extensions can be found under the API docs for [globals](global.html).

### 💡 [Oracle](tutorial-2-usage.html)