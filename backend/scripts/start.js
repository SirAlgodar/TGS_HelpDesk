require('dotenv').config()
const mysql = require('mysql2/promise')

const cfg = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'tgs_dev',
}

async function verifyConnection() {
  console.log('Inicializando com verificação de conexão ao MariaDB...')
  try {
    const conn = await mysql.createConnection({
      host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, database: cfg.database,
    })
    await conn.query('SELECT 1')
    await conn.end()
    console.log('✓ Conexão ao banco validada. Iniciando servidor...')
  } catch (err) {
    console.error('✗ Não foi possível validar a conexão ao banco.')
    console.error(`Detalhes: ${err?.code || err?.message || err}`)
    console.error('Sugestões:')
    console.error(`- Confirme que o database "${cfg.database}" existe e o usuário tem acesso.`)
    console.error('- Veja: backend/scripts/check-db.js para instruções detalhadas.')
    process.exit(1)
  }
}

async function start() {
  await verifyConnection()
  // Inicia o servidor principal
  require('../server')
}

start()