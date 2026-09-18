/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Foto institucional — lida do Drive, nunca da URL pública do Forms (que não
 * existe: uploads de formulário vão para uma pasta privada do Drive do dono
 * do formulário).
 *
 * PERMISSÃO NECESSÁRIA: escopo `https://www.googleapis.com/auth/drive.readonly`
 * (concedido automaticamente na primeira execução/autorização do script,
 * porque `DriveApp.getFileById` está em uso). O script só lê o ARQUIVO que o
 * próprio evento do formulário acabou de gerar — nunca lista pastas nem varre
 * o Drive.
 *
 * A Edge Function NÃO confia no `mimeType` que o Drive relata (poderia ser
 * ajustado por qualquer coisa) — ela detecta o tipo real pelos BYTES. Aqui só
 * empacotamos o que ela precisa para fazer essa checagem.
 * ─────────────────────────────────────────────────────────────────────────────
 */

function getPhotoPayload_(answersIndex, photoField) {
  if (!photoField) return null;

  var itemResponse = findItemResponse_(answersIndex, photoField.titles);
  if (!itemResponse) return null;

  // Pergunta de upload devolve um ARRAY de IDs do Drive, mesmo com um só arquivo.
  var fileIds = itemResponse.getResponse();
  if (!fileIds || !fileIds.length) return null;

  var file;
  try {
    file = DriveApp.getFileById(fileIds[0]);
  } catch (err) {
    // Arquivo removido do Drive entre o envio e o processamento, ou permissão
    // insuficiente. A Edge Function trata "sem foto" como pendência
    // (`photo_missing`), nunca como motivo para não criar o membro.
    return null;
  }

  var blob = file.getBlob();
  return {
    fileName: file.getName(),
    mimeType: blob.getContentType(),
    bytesBase64: Utilities.base64Encode(blob.getBytes()),
  };
}
