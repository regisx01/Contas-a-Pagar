# 📱 Minhas Contas — Como instalar no seu celular

Você recebeu um **PWA (Progressive Web App)** completo. Há **3 formas** de instalar no Android — escolha a que preferir.

---

## ✅ Arquivos do projeto

```
outputs/
├── index.html          ← Página principal
├── styles.css          ← Estilos
├── app.js              ← Lógica (IndexedDB, gráficos, notificações)
├── manifest.json       ← Manifesto PWA
├── service-worker.js   ← Funcionamento offline
└── icons/
    ├── icon.svg
    ├── icon-192.png
    └── icon-512.png
```

---

## 🚀 Opção 1 — Instalar como PWA (mais simples, 2 minutos)

O Android trata um PWA instalado **igual a um app**: aparece na tela inicial, abre em tela cheia, funciona offline e envia notificações.

### Passos:

1. **Hospede os arquivos** em algum serviço gratuito (HTTPS é obrigatório):
   - **GitHub Pages** (recomendado): crie um repositório, suba os arquivos, ative o Pages em Settings → Pages.
   - **Netlify Drop**: vá em https://app.netlify.com/drop e arraste a pasta inteira. Pronto, você recebe um link `https://nome-aleatorio.netlify.app`.
   - **Vercel**: https://vercel.com → "New Project" → upload da pasta.

2. **Abra o link no Chrome do celular**.

3. O Chrome mostrará um banner **"Adicionar à tela inicial"** ou um ícone de instalação na barra de endereço. Toque e confirme.

4. Pronto — o app fica na tela inicial como qualquer aplicativo.

> 💡 Você também pode tocar no botão **"Instalar"** dentro do próprio app (canto superior direito), que aparece automaticamente.

---

## 📦 Opção 2 — Gerar APK real com PWABuilder (recomendado)

O **PWABuilder** (da Microsoft) gera um APK assinado de verdade a partir do seu PWA.

### Passos:

1. Hospede o PWA primeiro (use a Opção 1 para obter um link HTTPS).

2. Acesse **https://www.pwabuilder.com**

3. Cole a URL do seu PWA e clique **"Start"**. Ele vai analisar o manifest e service worker.

4. Clique em **"Package for stores"** → **"Android"**.

5. Configure:
   - **Package ID**: `com.seunome.minhascontas` (qualquer nome único)
   - **App name**: Minhas Contas
   - **Display mode**: Standalone
   - Deixe o resto no padrão.

6. Clique **"Generate Package"**. Em ~30 segundos você recebe um ZIP com:
   - `app-release-signed.apk` ← este é o APK pronto para instalar
   - `app-release-bundle.aab` (para subir à Play Store, se quiser)

7. Transfira o `.apk` para o celular (via cabo, Google Drive, WhatsApp Web, e-mail) e abra. Aceite "instalar de fontes desconhecidas".

---

## 🛠 Opção 3 — Bubblewrap (linha de comando, mais técnico)

Para gerar o APK localmente, sem depender de site:

```bash
npm install -g @bubblewrap/cli
bubblewrap init --manifest=https://seu-pwa.netlify.app/manifest.json
bubblewrap build
```

Requisitos: Node.js + JDK 17 + Android SDK.

---

## 🔔 Sobre as notificações

- O app usa a **Notification API do navegador**, então as notificações funcionam enquanto o app está aberto ou em segundo plano recente.
- Para notificações **push verdadeiras** (que chegam mesmo com app fechado), seria necessário um servidor (Firebase Cloud Messaging) — o que foge do escopo "100% local". No uso diário, abrir o app uma vez por dia é suficiente: ele verifica vencimentos automaticamente.

---

## 💾 Sobre os dados

- Tudo é salvo **localmente no celular** via IndexedDB.
- Nada é enviado para a internet. Sem cadastro, sem servidor, sem custo.
- Use a aba **Relatórios → Exportar backup (JSON)** periodicamente para não perder dados se desinstalar o app.

---

## ✏️ Funcionalidades

- ✅ Cadastro de contas (descrição, valor, vencimento, categoria, observações)
- ✅ Contas recorrentes (geram automaticamente a próxima ao serem pagas)
- ✅ Marcar como paga / histórico de pagamentos
- ✅ Filtros por status e categoria
- ✅ Dashboard com totais (vencidas, próximas, pagas, mês atual)
- ✅ Gráficos (categoria, status, histórico 6 meses)
- ✅ Notificações de vencimento (hoje + 3 dias antes)
- ✅ Exportar / importar backup em JSON
- ✅ Funcionamento offline completo
- ✅ Modo escuro automático (segue o sistema)

---

## 🧪 Testar antes de hospedar

Para rodar localmente no computador:

```bash
cd outputs
python3 -m http.server 8000
```

Depois abra `http://localhost:8000` no navegador. Para testar no celular pela mesma rede Wi-Fi, descubra o IP do computador e acesse `http://SEU-IP:8000` no celular. (Algumas funções de PWA exigem HTTPS, então prefira hospedar para o teste final.)

---

Qualquer dúvida, é só perguntar! 🚀
