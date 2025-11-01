require('dotenv').config()
const mysql = require('mysql2/promise')

const cfg = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'tgs_dev',
}

function sleep(ms) {
  return new Promise(res => setTimeout(res, ms))
}

async function tryConnect(withDatabase = false) {
  const params = { host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password }
  if (withDatabase) params.database = cfg.database
  const conn = await mysql.createConnection(params)
  await conn.query('SELECT 1')
  await conn.end()
}

async function main() {
  console.log('=== Validação de Conexão MariaDB ===')
  console.log(`Host: ${cfg.host}:${cfg.port}`)
  console.log(`User: ${cfg.user}`)
  console.log(`Database: ${cfg.database}`)
  console.log('------------------------------------')

  // Passo 1: servidor acessível
  console.log('1) Testando acesso ao servidor (sem database)...')
  try {
    await tryConnect(false)
    console.log('   ✓ Servidor acessível e autenticou o usuário.')
  } catch (err) {
    console.error('   ✗ Falha ao conectar ao servidor MariaDB.')
    if (err && err.code) console.error(`   Código: ${err.code}`)
    console.error('   Ações sugeridas:')
    console.error('   - Verifique se o MariaDB está rodando e escutando em 3306.')
    console.error('   - Confirme firewall/ACL local permitindo conexões.')
    console.error('   - Se estiver usando "localhost", tente "127.0.0.1" (força TCP).')
    process.exit(1)
  }

  // Passo 2: conexão com database específico
  console.log('2) Testando conexão com o database alvo...')
  try {
    await tryConnect(true)
    console.log('   ✓ Conexão com o database validada com sucesso.')
  } catch (err) {
    if (err?.code === 'ER_BAD_DB_ERROR') {
      console.error('   ✗ Database não existe.')
      console.error('   Crie o database e conceda privilégios:')
      console.error(`   SQL: CREATE DATABASE IF NOT EXISTS \`${cfg.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`)
      console.error(`   SQL: GRANT ALL PRIVILEGES ON \`${cfg.database}\`.* TO '${cfg.user}'@'${cfg.host}' IDENTIFIED BY '${cfg.password}';`)
      console.error('   SQL: FLUSH PRIVILEGES;')
    } else if (err?.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('   ✗ Acesso negado para o usuário informado.')
      console.error('   Verifique usuário/senha e conceda privilégios ao schema:')
      console.error(`   SQL: CREATE USER IF NOT EXISTS '${cfg.user}'@'${cfg.host}' IDENTIFIED BY '${cfg.password}';`)
      console.error(`   SQL: GRANT ALL PRIVILEGES ON \`${cfg.database}\`.* TO '${cfg.user}'@'${cfg.host}';`)
      console.error('   SQL: FLUSH PRIVILEGES;')
      console.error('   Dica: se estiver usando host "localhost", conceda também para "127.0.0.1".')
    } else {
      console.error('   ✗ Erro ao conectar ao database.')
      console.error(`   Detalhe: ${err?.message || err}`)
    }
    process.exit(1)
  }

  // Passo 3: teste de resiliência (tentativas com backoff)
  console.log('3) Teste de resiliência (tentativas de reconexão)...')
  const attempts = 3
  for (let i = 1; i <= attempts; i++) {
    try {
      await tryConnect(true)
      console.log(`   ✓ Tentativa ${i}/${attempts} bem-sucedida.`)
    } catch (err) {
      console.error(`   ✗ Tentativa ${i}/${attempts} falhou: ${err?.code || err?.message || err}`)
      if (i < attempts) {
        const delay = 500 * i
        console.log(`   Aguardando ${delay}ms antes de tentar novamente...`)
        await sleep(delay)
        continue
      }
      console.error('   Falha após múltiplas tentativas. Consulte as instruções acima para corrigir.')
      process.exit(1)
    }
  }

  console.log('------------------------------------')
  console.log('✓ Conexão validada. Você pode iniciar o servidor com:')
  console.log('  - npm run dev:checked (início com verificação)')
  console.log('  - npm run dev (início direto)')
}

main().catch(err => {
  console.error('Erro inesperado no verificador:', err)
  process.exit(1)
})