# Site da Tás Seguro + Área do corretor

Arquivos:
- `index.html`: o site, com o formulário de cotação (Netlify Forms, nome `cotacao`)
- `admin/index.html`: a área do corretor, em seudominio.com.br/admin
- `netlify/functions/admin.mjs`: confere e-mail e senha e busca as cotações com segurança
- `netlify.toml` e `package.json`: configuração do Netlify

## 1. Subir no GitHub
1. Crie uma conta grátis em github.com.
2. Clique em **New repository**, dê o nome `tas-seguro`, marque **Private** e clique em **Create repository**.
3. Clique em **uploading an existing file** e arraste **todos os arquivos e pastas** deste zip (descompactado).
4. Clique em **Commit changes**.

## 2. Ligar no Netlify
1. Em app.netlify.com: **Add new project > Import an existing project > GitHub**.
2. Escolha o repositório `tas-seguro`.
3. Deixe "Build command" vazio e "Publish directory" como `.`. Clique em **Deploy**.

## 3. Criar a senha da área do corretor
1. Gere um token: avatar no canto > **User settings > Applications > Personal access tokens > New access token**. Copie o token.
2. No projeto: **Configuração do projeto > Variáveis ambientais > Add a variable**. Crie estas:
   - `ADMIN_EMAIL` = os e-mails de acesso, separados por vírgula
   - `ADMIN_SENHA_1` = senha do 1º e-mail
   - `ADMIN_SENHA_2` = senha do 2º e-mail
   - `NETLIFY_TOKEN` = o token copiado
3. Vá em **Implanta > Trigger deploy > Deploy project** para aplicar.

## 4. Formulário
Em **Formulários**, confirme que está "Form detection is enabled".

## 5. Domínio
**Gestão de domínio > Add a domain** e siga as instruções do Netlify.

## Usar
- Site: https://seudominio.com.br
- Área do corretor: https://seudominio.com.br/admin

Nunca coloque a senha ou o token dentro dos arquivos. Eles ficam só nas variáveis do Netlify.
