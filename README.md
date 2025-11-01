# Sistema de Tickets (TGS)

Um sistema completo de helpdesk/tickets desenvolvido com Node.js e React, incluindo autenticação baseada em papéis e interface moderna.

## 🚀 Funcionalidades

### Autenticação e Autorização
- **3 níveis de usuário**: Admin, Agente e Usuário
- **Admin**: Gerencia usuários e tem privilégios de agente
- **Agente**: Visualiza e gerencia todos os tickets
- **Usuário**: Cria e acompanha seus próprios tickets

### Sistema de Tickets
- Criação de tickets com anexos
- Sistema de comentários
- Controle de status (aberto, em andamento, fechado)
- Upload de arquivos
- Histórico completo de interações

### Interface
- Design moderno e responsivo
- Tela de login centralizada sem navegação
- Redirecionamento automático baseado no papel do usuário
- Navegação condicional (links aparecem apenas quando logado)

## 🛠️ Tecnologias

### Backend
- **Node.js** com Express
- **SQLite** para desenvolvimento
- **MariaDB** para produção
- **JWT** para autenticação
- **Multer** para upload de arquivos
- **bcrypt** para hash de senhas

### Frontend
- **React** com Hooks
- **React Router** para navegação
- **Axios** para requisições HTTP
- **Vite** como bundler

## 📦 Instalação

### Pré-requisitos
- Node.js (versão 16 ou superior)
- npm ou yarn

### 1. Clone o repositório
```bash
git clone <url-do-repositorio>
cd TGS
```

### 2. Configure o Backend
```bash
cd backend
npm install
```

Copie o arquivo de exemplo e configure as variáveis:
```bash
cp .env.example .env
```

Edite o arquivo `.env`:
```env
PORT=3110
JWT_SECRET=seu_jwt_secret_aqui
DB_TYPE=sqlite
DEFAULT_ADMIN_EMAIL=admin@example.com
DEFAULT_ADMIN_PASSWORD=admin
```

### 3. Configure o Frontend
```bash
cd ../frontend
npm install
```

O arquivo `.env` já está configurado:
```env
VITE_API_URL=http://localhost:3110
```

## 🚀 Executando o Sistema

### Desenvolvimento

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev:checked
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

### Produção

**Backend:**
```bash
cd backend
npm start
```

**Frontend:**
```bash
cd frontend
npm run build
npm run preview
```

## 🔐 Acesso Inicial

### Usuário Administrador Padrão
- **Email**: `admin@example.com`
- **Senha**: `admin`

O administrador é criado automaticamente na primeira execução do sistema.

## 📱 Como Usar

### 1. Acesso ao Sistema
- Acesse `http://localhost:5173/login`
- Faça login com as credenciais do admin ou usuário criado

### 2. Fluxo por Papel

**Como Admin:**
- Acesso automático à tela de agente
- Pode gerenciar usuários (criar, editar, excluir)
- Visualiza e gerencia todos os tickets

**Como Agente:**
- Acesso à tela de agente
- Visualiza todos os tickets
- Pode alterar status e comentar

**Como Usuário:**
- Acesso ao portal do usuário
- Cria novos tickets
- Acompanha status dos próprios tickets
- Adiciona comentários aos próprios tickets

### 3. Criando Tickets
1. Acesse o "Portal do Usuário"
2. Preencha título, descrição e categoria
3. Anexe arquivos se necessário
4. Acompanhe o progresso na lista de tickets

### 4. Gerenciando Tickets (Agente/Admin)
1. Acesse a "Tela do Atendente"
2. Visualize todos os tickets
3. Altere status conforme necessário
4. Adicione comentários para comunicação

## 🗂️ Estrutura do Projeto

```
TGS/
├── backend/
│   ├── server.js          # Servidor principal
│   ├── package.json       # Dependências do backend
│   ├── .env              # Configurações (não versionado)
│   ├── .env.example      # Exemplo de configurações
│   └── uploads/          # Arquivos enviados
├── frontend/
│   ├── src/
│   │   ├── App.jsx       # Componente principal
│   │   ├── api.js        # Configuração do Axios
│   │   └── main.jsx      # Ponto de entrada
│   ├── package.json      # Dependências do frontend
│   └── .env             # Configuração da API
└── README.md            # Este arquivo
```

## 🔧 API Endpoints

### Autenticação
- `POST /api/auth/login` - Login
- `GET /api/me` - Dados do usuário logado

### Tickets
- `GET /api/tickets` - Listar tickets
- `POST /api/tickets` - Criar ticket
- `PUT /api/tickets/:id` - Atualizar ticket
- `GET /api/tickets/:id/comments` - Comentários do ticket
- `POST /api/tickets/:id/comments` - Adicionar comentário

### Admin (apenas para admins)
- `GET /api/admin/users` - Listar usuários
- `POST /api/admin/users` - Criar usuário
- `PUT /api/admin/users/:id` - Atualizar usuário
- `DELETE /api/admin/users/:id` - Excluir usuário

## 🔒 Segurança

- Senhas são hasheadas com bcrypt
- Autenticação via JWT
- Middleware de autorização por papel
- Validação de entrada nos endpoints
- Upload de arquivos com validação de tipo

## 🐛 Solução de Problemas

### Backend não conecta ao banco
- Verifique as configurações no `.env`
- Para SQLite, certifique-se que o diretório tem permissão de escrita
- Para MariaDB, verifique se o serviço está rodando

### Frontend não consegue fazer login
- Verifique se o backend está rodando na porta 3110
- Confirme se `VITE_API_URL` está correto no `.env` do frontend
- Verifique o console do navegador para erros de CORS

### Erro de permissão
- Certifique-se de estar logado com o usuário correto
- Verifique se o token JWT não expirou
- Confirme se o papel do usuário tem as permissões necessárias

## 📝 Licença

Este projeto está sob a licença MIT. Veja o arquivo LICENSE para mais detalhes.

## 🤝 Contribuição

1. Faça um fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📞 Suporte

Para suporte, abra uma issue no repositório ou entre em contato com a equipe de desenvolvimento.