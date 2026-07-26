use serialport;
use std::io::Write;

#[tauri::command]
pub fn imprimir_cupom_bematech(porta: String, conteudo: String) -> Result<String, String> {
    // 1. Alterado de 9600 para 115200 (padrão USB da MP-4200 TH)
    let mut port = serialport::new(&porta, 115200)
        .timeout(std::time::Duration::from_millis(1000))
        .open()
        .map_err(|e| format!("Erro ao abrir a porta {}: {}", porta, e))?;

    // Reset / Inicialização da impressora (ESC @)
    let init_printer: [u8; 2] = [0x1B, 0x40];
    port.write_all(&init_printer).map_err(|e| e.to_string())?;

    // Escreve o texto do cupom
    port.write_all(conteudo.as_bytes()).map_err(|e| e.to_string())?;

    // Avança 4 linhas (ESC d 4)
    let feed_lines: [u8; 3] = [0x1B, 0x64, 0x04];
    port.write_all(&feed_lines).map_err(|e| e.to_string())?;

    // Aciona a guilhotina (ESC w 0)
    let acionar_guilhotina: [u8; 3] = [0x1B, 0x77, 0x00];
    port.write_all(&acionar_guilhotina).map_err(|e| e.to_string())?;

    // 2. Força o envio imediato do buffer de dados para a impressora
    port.flush().map_err(|e| e.to_string())?;

    Ok("Cupom impresso e cortado com sucesso!".into())
}