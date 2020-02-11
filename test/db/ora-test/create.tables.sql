BEGIN
  EXECUTE IMMEDIATE 'CREATE TABLE "TEST" ("ID" integer not null primary key, "NAME" varchar2(255), "CREATED_AT" timestamp with time zone, "UPDATED_AT" timestamp with time zone)';
  EXECUTE IMMEDIATE 'CREATE TABLE "TEST2" ("ID" integer not null primary key, "REPORT" CLOB, "CREATED_AT" timestamp with time zone, "UPDATED_AT" timestamp with time zone)';
END;