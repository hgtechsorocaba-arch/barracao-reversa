# 📋 Barracão Reversa – Progresso do Projeto
**Última atualização:** 05/03/2026 – 01:04

---

## ✅ O que foi feito hoje

### Estrutura da página (`index.html`, `style.css`, `app.js`)
- [x] Página principal com header fixo, hero, seção "Como Comprar" e vitrine de produtos
- [x] Grid de cards com foto, nome, preço, estado de conservação, categoria
- [x] Badge "⚡ Últimas unidades" para produtos urgentes
- [x] Filtro por nome (busca em tempo real) e por categoria
- [x] Modal de checkout com formulário de cadastro do cliente:
  - Nome completo, telefone (com máscara), cidade, tipo de entrega, endereço, observação
- [x] Finalização via WhatsApp com mensagem formatada completa
- [x] **Foto do produto incluída na mensagem** (URL linkável ou aviso para imagem local)
- [x] Página responsiva (mobile-first)

### Controle de Estoque
- [x] Campo de quantidade em estoque no cadastro de produtos
- [x] Badge colorido por quantidade: ✅ verde (ok) / ⚡ laranja (baixo) / ❌ vermelho (esgotado)
- [x] Overlay "ESGOTADO" na foto + botão Comprar desabilitado quando stock = 0
- [x] Decremento automático do estoque ao enviar pedido pelo WhatsApp
- [x] Widget +/− no painel admin para ajuste manual de estoque

### Painel Admin (`⚙️` no header)
- [x] Login protegido por senha (`barracao2025` – **trocar antes de publicar!**)
- [x] Formulário de cadastro de produto:
  - Nome, categoria, preço, descrição, estado, quantidade em estoque
  - Upload de foto (clique ou drag & drop, máx. 5MB)
  - Checkbox "Últimas unidades"
- [x] Lista de produtos cadastrados com opção de remover e ajustar estoque
- [x] Produtos salvos em `localStorage` (persistem ao fechar o navegador)

### Identidade Visual
- [x] Cores inspiradas no Instagram **@barracao.reversa**:
  - Amarelo `#FFD600` como cor primária
  - Fundo preto `#0d0d0d`
  - Botão "Ver Produtos" amarelo com texto preto
  - Glow amarelo nos hovers e badges

### Configurações atuais (`app.js` linha 7-11)
```js
const CONFIG = {
  whatsappNumber: '159881316215', // ← número de TESTE – trocar pelo número real
  adminPassword: 'barracao2025',  // ← trocar antes de publicar!
  storeName: 'Barracão Reversa',
};
```

---

## 🔧 O que falta / próximos passos

### Prioritário
- [ ] **Trocar o número do WhatsApp** pelo número real do Barracão Reversa
- [ ] **Trocar a senha do admin** por algo seguro
- [ ] **Remover os produtos demo** do `DEMO_PRODUCTS` em `app.js` (ou ajustá-los)
- [ ] **Logo real** – substituir o ♻️ emoji pelo logo do Barracão Reversa
- [ ] **Endereço real** no footer e botão WhatsApp
- [ ] **Hospedar online** (sugestão: Vercel ou Netlify – arrastar a pasta)

### Melhorias futuras (ideias levantadas)
- [ ] Carrinho com múltiplos produtos no mesmo pedido
- [ ] Galeria de múltiplas fotos por produto
- [ ] Link de compartilhamento individual por produto (para divulgar no WhatsApp/Instagram)
- [ ] Integração com Google Sheets para salvar pedidos automaticamente
- [x] Integração básica com Supabase (Configurações)
- [x] Migração do Catálogo de Produtos para Supabase (Banco de Dados Real)
- [ ] Implementação de Carrinho e Checkout Pro (Mercado Pago)
- [ ] Status "Vendido" – marcar produto como vendido sem excluir
- [ ] Mostrar chave PIX + QR Code na tela de checkout

---

## 🗂️ Arquivos do projeto

```
C:\Projetos\barracao-reversa\
├── index.html   → Página principal
├── style.css    → Estilos (cores, layout, responsividade)
├── app.js       → Toda a lógica (produtos, estoque, checkout, admin, WhatsApp)
└── PROGRESSO.md → Este arquivo
```

## 🚀 Como testar localmente
```bash
npx serve C:\Projetos\barracao-reversa -p 5500
# Acesse: http://localhost:5500
```
