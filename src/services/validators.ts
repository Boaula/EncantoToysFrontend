export function validarCPF(cpf: string): boolean {
  const cpfLimpo = cpf.replace(/\D/g, "");

  // Deve ter 11 dígitos e não ter todos os números iguais
  if (cpfLimpo.length !== 11 || /^(\d)\1{10}$/.test(cpfLimpo)) {
    return false;
  }

  // Validação do 1º dígito
  let soma = 0;
  for (let i = 0; i < 9; i++) {
    soma += parseInt(cpfLimpo.charAt(i)) * (10 - i);
  }
  let resto = (soma * 10) % 11;
  let d1 = resto === 10 || resto === 11 ? 0 : resto;
  if (d1 !== parseInt(cpfLimpo.charAt(9))) return false;

  // Validação do 2º dígito
  soma = 0;
  for (let i = 0; i < 10; i++) {
    soma += parseInt(cpfLimpo.charAt(i)) * (11 - i);
  }
  resto = (soma * 10) % 11;
  let d2 = resto === 10 || resto === 11 ? 0 : resto;

  return d2 === parseInt(cpfLimpo.charAt(10));
}