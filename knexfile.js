module.exports = {

  development: {
    client: 'pg',
    connection: "postgres://localhost/drawlol"
  },

  production: {
    client: 'pg',
    connection: process.env.DATABASE_URL
  }
};
