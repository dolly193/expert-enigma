const EfiPaySdk = require('sdk-node-apis-efi');
require('dotenv').config();
const fs = require('fs');

/**
 * Verifica se uma string parece ser um conteúdo codificado em Base64.
 * @param {string} str A string para verificar.
 * @returns {boolean}
 */
const isBase64 = (str) => {
  if (!str || typeof str !== 'string') return false;
  const base64Regex = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
  return base64Regex.test(str.trim());
};
/**
 * Inicializa e configura o SDK da Efí Pay.
 * A configuração é montada dinamicamente com base nas variáveis de ambiente.
 */
const initializeEfiPay = () => {
  const isProduction = process.env.NODE_ENV === 'production';

  // Validação robusta das credenciais com base no ambiente
  if (isProduction) {
    if (!process.env.EFI_PROD_CLIENT_ID || !process.env.EFI_PROD_CLIENT_SECRET) {
      throw new Error('Credenciais de PRODUÇÃO da Efí (EFI_PROD_CLIENT_ID, EFI_PROD_CLIENT_SECRET) não estão definidas no ambiente.');
    }
  } else {
    if (!process.env.EFI_HOMOLOG_CLIENT_ID || !process.env.EFI_HOMOLOG_CLIENT_SECRET) {
      throw new Error('Credenciais de HOMOLOGAÇÃO da Efí (EFI_HOMOLOG_CLIENT_ID, EFI_HOMOLOG_CLIENT_SECRET) não estão definidas no ambiente.');
    }
  }

  // Valida a existência da chave PIX, que é necessária para criar cobranças.
  if (!process.env.EFI_PIX_KEY) {
    throw new Error('A variável de ambiente EFI_PIX_KEY não está definida.');
  }

  let certificateContent;
  const certValue = process.env.EFI_CERTIFICATE;

  if (!certValue) {
    throw new Error('A variável de ambiente EFI_CERTIFICATE (com o conteúdo base64 ou o caminho para o arquivo) não está definida.');
  }

  // Verifica se a variável de ambiente contém o conteúdo Base64 diretamente ou se é um caminho de arquivo.
  if (isBase64(certValue) && !fs.existsSync(certValue)) {
    // Se for uma string Base64 e não for um caminho de arquivo válido, use-a diretamente.
    console.log('[Efí Pay Service] Usando conteúdo do certificado diretamente da variável de ambiente.');
    certificateContent = certValue;
  } else {
    // Caso contrário, trate como um caminho de arquivo.
    console.log(`[Efí Pay Service] Lendo certificado do caminho: ${certValue}`);
    if (!fs.existsSync(certValue)) {
      throw new Error(`Arquivo de certificado não encontrado no caminho: ${certValue}`);
    }
    try {
      certificateContent = fs.readFileSync(certValue);
    } catch (error) {
      throw new Error(`Falha ao ler o arquivo de certificado em ${certValue}. Verifique as permissões.`);
    }
  }

  const options = {
    client_id: isProduction ? process.env.EFI_PROD_CLIENT_ID : process.env.EFI_HOMOLOG_CLIENT_ID,
    client_secret: isProduction ? process.env.EFI_PROD_CLIENT_SECRET : process.env.EFI_HOMOLOG_CLIENT_SECRET,
    sandbox: !isProduction,
    // O SDK espera o conteúdo do arquivo .p12 como um Buffer, não como uma string Base64.
    certificate: certificateContent,
  };
  
  try {
    // Log para depuração, confirmando as opções usadas para inicializar o SDK
    console.log(`[Efí Pay Service] Inicializando SDK em modo ${options.sandbox ? 'Sandbox' : 'Produção'}. Client ID: ${options.client_id ? 'Definido' : '***NÃO DEFINIDO***'}`);
    // Retorna uma nova instância do SDK já configurada
    return new EfiPaySdk(options);
  } catch (e) {
    console.error('[Efí Pay Service] ERRO CRÍTICO ao instanciar o SDK da Efí:', e);
    throw e; // Lança o erro para interromper a inicialização da aplicação
  }
};
// Padrão Singleton: A instância do SDK é criada uma única vez quando o módulo é carregado.
const efiInstance = initializeEfiPay();
const EfiPay = {
  createPixCharge: async (total, expirationInSeconds) => {
    try {
      // Corpo da requisição para criar a cobrança imediata
      const body = {
        calendario: {
          expiracao: expirationInSeconds.toString(),
        },
        valor: {
          // A API da Efí espera o valor como uma string com duas casas decimais.
          original: total.toFixed(2),
        },
        chave: process.env.EFI_PIX_KEY, // Sua chave PIX cadastrada na Efí
        solicitacaoPagador: `Pedido Gamer Store R$${total.toFixed(2)}`,
      };

      console.log("Enviando requisição para a API da Efí...");

      // Chama o método do SDK para criar a cobrança, usando a instância singleton.
      const pixChargeResponse = await efiInstance.pixCreateImmediateCharge({}, body); // O primeiro argumento (params) pode ser um objeto vazio.

      // Gera o QR Code para a cobrança criada.
      const qrCodeResponse = await efiInstance.pixGenerateQRCode({ params: { txid: pixChargeResponse.txid } });

      console.log("Cobrança PIX e QR Code gerados com sucesso!");

      // Retorna um objeto unificado com as informações necessárias para o frontend
      return {
        txid: pixChargeResponse.txid,
        pixCopiaECola: qrCodeResponse.pix_copia_e_cola,
        imagemQrcode: qrCodeResponse.imagem_qrcode,
      };

    } catch (error) {
      // O SDK da Efí pode retornar o erro em diferentes propriedades
      const errorMessage = error.error_description || (error.erros && error.erros[0] && error.erros[0].mensagem) || error.message || 'Falha na comunicação com a API de pagamento.';
      console.error('Erro ao gerar cobrança Efí:', errorMessage, error);
      // Lança um erro mais específico, que pode ser útil para o chamador da função.
      throw new Error(errorMessage);
    }
  },
};

module.exports = { EfiPay, efiInstance };