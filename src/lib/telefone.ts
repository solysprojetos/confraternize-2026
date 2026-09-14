// Máscara de telefone brasileira: (85) 99999-8888 para celular e
// (85) 3333-4444 para fixo. Guarda só o que a pessoa digitou, sem completar
// nada por conta própria.
export function formatarTelefone(valor: string): string {
  let numeros = valor.replace(/\D/g, "");
  // Número colado do WhatsApp vem com o código do país: +55 (85) 99999-8888
  if (numeros.length > 11 && numeros.startsWith("55")) numeros = numeros.slice(2);
  const digitos = numeros.slice(0, 11);
  if (digitos.length === 0) return "";
  if (digitos.length <= 2) return `(${digitos}`;
  const ddd = digitos.slice(0, 2);
  const resto = digitos.slice(2);
  if (resto.length <= 4) return `(${ddd}) ${resto}`;
  const corte = resto.length > 8 ? 5 : 4;
  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`;
}

export const digitosDoTelefone = (valor: string) => valor.replace(/\D/g, "");
