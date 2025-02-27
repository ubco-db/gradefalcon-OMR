#!/bin/bash
# Initialize Cassandra schema

# Wait for Cassandra to be fully up and running
echo "Waiting for Cassandra to start..."
until cqlsh -e "describe keyspaces"; do
  echo "Cassandra is unavailable - sleeping"
  sleep 2
done

echo "Cassandra is up - initializing schema"

# Execute the CQL script
cqlsh -f /docker-entrypoint-initdb.d/init-cassandra.cql

echo "Cassandra schema initialized successfully"