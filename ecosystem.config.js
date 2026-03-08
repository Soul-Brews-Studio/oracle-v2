module.exports = {
  apps: [{
    name: 'oracle-api',
    script: 'src/server.ts',
    interpreter: 'bun',
    env: {
      ORACLE_PORT: 47779,
      ORACLE_VECTOR_DB: 'lancedb',
    },
  }],
};
