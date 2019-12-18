#!/bin/sh -e

wget -nv test/pkg/oracle-xe-11.2.0-1.0.x86_64.rpm.zip.aa
wget -nv test/pkg/oracle-xe-11.2.0-1.0.x86_64.rpm.zip.ab
wget -nv test/pkg/oracle-xe-11.2.0-1.0.x86_64.rpm.zip.ac
wget -nv test/pkg/oracle-xe-11.2.0-1.0.x86_64.rpm.zip.ad
cat oracle-xe-11.2.0-1.0.x86_64.rpm.zip.* > oracle-xe-11.2.0-1.0.x86_64.rpm.zip


export ORACLE_FILE="oracle-xe-11.2.0-1.0.x86_64.rpm.zip"
export ORACLE_HOME="/u01/app/oracle/product/11.2.0/xe"
export ORACLE_SID=XE

# hostname needs to be present in hosts or oracle installation will fail
ping -c1 $(hostname) || echo 127.0.0.1 $(hostname) | sudo tee -a /etc/hosts

ORACLE_RPM="$(basename $ORACLE_FILE .zip)"

cd "$(dirname "$(readlink -f "$0")")"

dpkg -s bc libaio1 rpm unzip > /dev/null 2>&1 ||
  ( sudo apt-get -qq update && sudo apt-get --no-install-recommends -qq install bc libaio1 rpm unzip )

df -B1 /dev/shm | awk 'END { if ($1 != "shmfs" && $1 != "tmpfs" || $2 < 2147483648) exit 1 }' ||
  ( sudo rm -r /dev/shm && sudo mkdir /dev/shm && sudo mount -t tmpfs shmfs -o size=2G /dev/shm )

test -f /sbin/chkconfig ||
  ( echo '#!/bin/sh' | sudo tee /sbin/chkconfig > /dev/null && sudo chmod u+x /sbin/chkconfig )

test -d /var/lock/subsys || sudo mkdir /var/lock/subsys

unzip -j "$(basename $ORACLE_FILE)" "*/$ORACLE_RPM"
sudo rpm --install --nodeps --nopre "$ORACLE_RPM"

echo 'OS_AUTHENT_PREFIX=""' | sudo tee -a "$ORACLE_HOME/config/scripts/init.ora" > /dev/null
sudo usermod -aG dba $USER

( echo ; echo ; echo travis ; echo travis ; echo n ) | sudo AWK='/usr/bin/awk' /etc/init.d/oracle-xe configure

# localhost:1521
# user/pass: travis/travis
# for SYSDBA role - user/pass: sys/travis
"$ORACLE_HOME/bin/sqlplus" -L -S / AS SYSDBA <<SQL
CREATE USER travis IDENTIFIED BY travis;
GRANT CONNECT, RESOURCE TO travis;
GRANT EXECUTE ON SYS.DBMS_LOCK TO travis;
SQL

# create test table
$ORACLE_HOME/bin/sqlplus -S travis/travis <<SQL
whenever sqlerror exit 2;
create table "test" ("id" integer not null primary key, "name" varchar2(255), "created_at" timestamp with time zone, "updated_at" timestamp with time zone);
SQL
