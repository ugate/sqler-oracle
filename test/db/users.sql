
define ORA_REPO_USER=&1;
-- grant access to the passed user
whenever sqlerror exit sql.sqlcode;
CREATE USER &&ORA_REPO_USER IDENTIFIED BY &&ORA_REPO_USER;
GRANT CONNECT, RESOURCE TO &&ORA_REPO_USER;
GRANT EXECUTE ON SYS.DBMS_LOCK TO &&ORA_REPO_USER;
EXIT;