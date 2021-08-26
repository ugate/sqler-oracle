## [2.0.0](https://ugate.github.io/sqler-oracle/tree/v2.0.0) (2021-04-01)
[Full Changelog](https://ugate.github.io/sqler-oracle/compare/v1.0.0...v2.0.0)


__Features:__
* [[FEATURE]: Transactions are now performed on an actual transaction instance rather than an SQL execution result (sqler v7 support).](https://ugate.github.io/sqler-oracle/commit/dac95ba6f09b1a93aa355e969989673dbf593378)
* [[FEATURE]: Oracle dialect now uses built-in sqler track.interpolate to interpolate values from the oracledb module](https://ugate.github.io/sqler-oracle/commit/89753feba6fbfc24aea350caf71d36b35a9d880d)
* [[FEATURE]: Initial release for sqler version >= 5.3.0](https://ugate.github.io/sqler-oracle/commit/f2d4acccfc430cf94fa16269a5c05f554bdb3d90)
* [[FEATURE]: Initial release for sqler version >= 5.3.0](https://ugate.github.io/sqler-oracle/commit/503f2a29951d870bd7f1da478eec4e4b025965bd)

__Fixes:__
* [[FIX]: SQL execution errors now contain a field called "sqlerOracle" that contain metadata pertaining to the execution where the error took place](https://ugate.github.io/sqler-oracle/commit/52b20553ea5a7fabf266cf9a8f70abb973132f7c)
* [[FIX]: When autoCommit and a transactionId is present ensure it is cleaned up after connection close (non-functional fix)](https://ugate.github.io/sqler-oracle/commit/9f0f896288a66cf5865d46e05ba05969f83022b2)