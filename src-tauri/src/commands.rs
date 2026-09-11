use std::fs::OpenOptions;
use std::io::Write;

#[tauri::command]
pub fn imprimir_cupom(conteudo: String) -> Result<String, String> {
    let porta = "/dev/ttyACM0";

    let mut impressora = OpenOptions::new()
        .write(true)
        .open(porta)
        .map_err(|e| format!("Erro ao abrir {}: {}", porta, e))?;

    // Inicializa a impressora
    impressora
        .write_all(b"\x1B\x40")
        .map_err(|e| format!("Erro ao inicializar impressora: {}", e))?;

    // Conteúdo do cupom
    impressora
        .write_all(conteudo.as_bytes())
        .map_err(|e| format!("Erro ao enviar cupom: {}", e))?;

    // Alimenta o papel
    impressora
        .write_all(b"\n\n\n")
        .map_err(|e| format!("Erro ao alimentar papel: {}", e))?;

    // Corte de papel — ESC/POS
    impressora
        .write_all(b"\x1D\x56\x00")
        .map_err(|e| format!("Erro ao cortar papel: {}", e))?;

    impressora
        .flush()
        .map_err(|e| format!("Erro ao finalizar impressão: {}", e))?;

    Ok("Cupom enviado para a Bematech.".to_string())
}