---
impacto: capacidade_nova
secao: adicionado
titulo: Conexões MCP seguras para Claude, Cursor e outras ferramentas de IA
---
Nova tela em Configurações › Conexões MCP. O admin liga "Permitir conexões MCP" (desligado por padrão) e cria uma conexão em três passos: nome e ferramenta, perfil de permissões (somente leitura, operação de CRM, construtor de fluxos ou personalizado), validade, IPs e dados pessoais. O token aparece uma vez só. Claude Desktop e claude.ai conectam por login (OAuth). Cada conexão faz só o que foi liberado, nunca passa do papel de quem a criou, mascara telefone e e-mail, tem limite de uso e deixa registro de toda chamada. Nenhuma conexão apaga, publica, dispara campanha, envia mensagem ou exporta. A migration 9023 cria as tabelas, e os tokens de API `dsk_` seguem funcionando como antes.
