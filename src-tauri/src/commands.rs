use std::fs::OpenOptions;
use std::io::Write;
use tauri::Manager;

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

#[tauri::command]
pub fn salvar_documento(
    app: tauri::AppHandle,
    nome: String,
    conteudo: Vec<u8>,
) -> Result<String, String> {
    if conteudo.is_empty() || conteudo.len() > 40 * 1024 * 1024 {
        return Err("Arquivo vazio ou maior que 40 MB.".to_string());
    }

    let nome_valido = !nome.is_empty()
        && nome.len() <= 180
        && !nome.contains("..")
        && nome.chars().all(|c| {
            c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.')
        });

    if !nome_valido {
        return Err("Nome de arquivo inválido.".to_string());
    }

    let (base, extensao) = if let Some(base) = nome.strip_suffix(".xml") {
        (base, "xml")
    } else if let Some(base) = nome.strip_suffix(".pdf") {
        (base, "pdf")
    } else {
        return Err("Somente arquivos PDF e XML são permitidos.".to_string());
    };

    if base.is_empty() {
        return Err("Nome de arquivo inválido.".to_string());
    }

    let pasta = app
        .path()
        .download_dir()
        .map_err(|e| format!("Não foi possível localizar Downloads: {}", e))?
        .join("EncantoToys");

    std::fs::create_dir_all(&pasta)
        .map_err(|e| format!("Não foi possível criar a pasta: {}", e))?;

    for indice in 0..1000 {
        let nome_destino = if indice == 0 {
            nome.clone()
        } else {
            format!("{}_{}.{}", base, indice, extensao)
        };

        let caminho = pasta.join(nome_destino);

        let mut arquivo = match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&caminho)
        {
            Ok(arquivo) => arquivo,
            Err(erro) if erro.kind() == std::io::ErrorKind::AlreadyExists => {
                continue;
            }
            Err(erro) => {
                return Err(format!("Não foi possível criar o arquivo: {}", erro));
            }
        };

        let resultado = arquivo
            .write_all(&conteudo)
            .and_then(|_| arquivo.sync_all());

        if let Err(erro) = resultado {
            drop(arquivo);
            let _ = std::fs::remove_file(&caminho);
            return Err(format!("Não foi possível salvar o arquivo: {}", erro));
        }

        return Ok(caminho.to_string_lossy().into_owned());
    }

    Err("Existem muitas cópias desse arquivo na pasta.".to_string())
}