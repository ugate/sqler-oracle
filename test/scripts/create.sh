#!/bin/sh -e

# create test table
$ORACLE_HOME/bin/sqlplus -S travis/travis <<SQL
whenever sqlerror exit 2;
create table "TEST" ("ID" integer not null primary key, "NAME" varchar2(255), "CREATED_AT" timestamp with time zone, "UPDATED_AT" timestamp with time zone);
SQL